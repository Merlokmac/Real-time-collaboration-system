import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { lockColumns, moveInList, orderedTaskIds, writeTaskOrder } from '../../lib/ordering';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';
import { formatTask, taskInclude } from './tasks.format';

export type CreateTaskInput = {
  columnId: string;
  title: string;
  assigneeId?: string | null;
  dueDate?: Date | null;
  labelIds?: string[];
};

export type UpdateTaskInput = {
  version: number;
  title?: string;
  assigneeId?: string | null;
  dueDate?: Date | null;
  labelIds?: string[];
};

async function assertAssignee(db: Db, projectId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: assigneeId } },
  });
  if (!member) throw badRequest('Người phụ trách phải là thành viên dự án');
}

async function assertLabels(db: Db, projectId: string, labelIds: string[] | undefined) {
  if (!labelIds?.length) return;
  const count = await db.label.count({ where: { projectId, id: { in: labelIds } } });
  if (count !== new Set(labelIds).size) throw badRequest('Nhãn không thuộc dự án');
}

async function loadTask(db: Db, projectId: string, taskId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, projectId }, include: taskInclude });
  if (!task) throw notFound('Không tìm thấy công việc');
  return task;
}

export async function getTask(projectId: string, taskId: string) {
  return formatTask(await loadTask(prisma, projectId, taskId));
}

export async function createTask(ctx: Ctx, projectId: string, input: CreateTaskInput) {
  const { task, log } = await prisma.$transaction(async (tx) => {
    const column = await tx.column.findFirst({ where: { id: input.columnId, projectId } });
    if (!column) throw notFound('Không tìm thấy cột');
    await assertAssignee(tx, projectId, input.assigneeId);
    await assertLabels(tx, projectId, input.labelIds);

    await lockColumns(tx, [column.id]);
    const position = await tx.task.count({ where: { columnId: column.id } });

    const created = await tx.task.create({
      data: {
        projectId,
        columnId: column.id,
        title: input.title,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        createdById: ctx.userId,
        position,
        labels: input.labelIds?.length
          ? { createMany: { data: [...new Set(input.labelIds)].map((labelId) => ({ labelId })) } }
          : undefined,
      },
      include: taskInclude,
    });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'task.created',
      entityType: 'task',
      entityId: created.id,
      meta: { title: created.title, columnName: column.name },
    });
    return { task: formatTask(created), log };
  });

  realtime.toProject(projectId, ServerEvents.taskCreated, task, ctx.socketId);
  publishActivity(log);
  return task;
}

/**
 * Cập nhật có điều kiện theo version (optimistic locking).
 * Nếu version client gửi lên đã cũ thì trả 409 kèm bản hiện tại để client giữ bản nháp và so sánh.
 */
export async function updateTask(ctx: Ctx, projectId: string, taskId: string, input: UpdateTaskInput) {
  const { version, labelIds, ...fields } = input;

  const { task, log } = await prisma.$transaction(async (tx) => {
    const before = await loadTask(tx, projectId, taskId);
    await assertAssignee(tx, projectId, fields.assigneeId);
    await assertLabels(tx, projectId, labelIds);

    const result = await tx.task.updateMany({
      where: { id: taskId, projectId, version },
      data: { ...fields, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw conflict('VERSION_CONFLICT', 'Công việc đã được người khác cập nhật', {
        current: formatTask(before),
      });
    }

    if (labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId } });
      if (labelIds.length) {
        await tx.taskLabel.createMany({ data: [...new Set(labelIds)].map((labelId) => ({ taskId, labelId })) });
      }
    }

    const after = await loadTask(tx, projectId, taskId);
    const changed = diffTask(before, after, labelIds !== undefined);
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'task.updated',
      entityType: 'task',
      entityId: taskId,
      meta: { title: after.title, changed },
    });
    return { task: formatTask(after), log };
  });

  realtime.toProject(projectId, ServerEvents.taskUpdated, task, ctx.socketId);
  publishActivity(log);
  return task;
}

function diffTask(
  before: Awaited<ReturnType<typeof loadTask>>,
  after: Awaited<ReturnType<typeof loadTask>>,
  labelsTouched: boolean,
) {
  const changed: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};
  if (before.title !== after.title) changed.title = { from: before.title, to: after.title };
  if (before.assigneeId !== after.assigneeId) {
    changed.assignee = { from: before.assignee?.name ?? null, to: after.assignee?.name ?? null };
  }
  if (before.dueDate?.getTime() !== after.dueDate?.getTime()) {
    changed.dueDate = { from: before.dueDate?.toISOString() ?? null, to: after.dueDate?.toISOString() ?? null };
  }
  if (labelsTouched) {
    changed.labels = {
      from: before.labels.map((l) => l.label.name),
      to: after.labels.map((l) => l.label.name),
    };
  }
  return changed;
}

/**
 * Khóa các cột chứa thẻ trước rồi mới đọc lại thẻ.
 * Mọi thao tác đổi cột/thứ tự đều phải giữ khóa cột nên sau khi khóa xong vị trí thẻ không đổi nữa.
 * Nếu thẻ vừa bị người khác chuyển sang cột khác trước lúc khóa thì thử lại.
 */
async function lockTaskColumns(tx: Db, projectId: string, taskId: string, extraColumnIds: string[] = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const seen = await tx.task.findFirst({ where: { id: taskId, projectId }, select: { columnId: true } });
    if (!seen) throw notFound('Không tìm thấy công việc');

    await lockColumns(tx, [seen.columnId, ...extraColumnIds]);
    const current = await tx.task.findFirst({
      where: { id: taskId, projectId },
      select: { columnId: true, title: true },
    });
    if (!current) throw notFound('Không tìm thấy công việc');
    if (current.columnId === seen.columnId) return current;
  }
  throw conflict('BUSY', 'Công việc đang được thao tác, vui lòng thử lại');
}

/**
 * Di chuyển thẻ trong cùng cột hoặc sang cột khác.
 * Server quyết định thứ tự cuối cùng và trả về bố cục mới của các cột bị ảnh hưởng.
 */
export async function moveTask(ctx: Ctx, projectId: string, taskId: string, toColumnId: string, toIndex: number) {
  const { result, log } = await prisma.$transaction(async (tx) => {
    const target = await tx.column.findFirst({ where: { id: toColumnId, projectId } });
    if (!target) throw notFound('Không tìm thấy cột đích');

    const current = await lockTaskColumns(tx, projectId, taskId, [toColumnId]);
    const fromColumnId = current.columnId;

    let columns: { columnId: string; taskIds: string[] }[];
    if (fromColumnId === toColumnId) {
      const order = moveInList(await orderedTaskIds(tx, fromColumnId), taskId, toIndex);
      await writeTaskOrder(tx, fromColumnId, order);
      columns = [{ columnId: fromColumnId, taskIds: order }];
    } else {
      const source = (await orderedTaskIds(tx, fromColumnId)).filter((id) => id !== taskId);
      const dest = moveInList(await orderedTaskIds(tx, toColumnId), taskId, toIndex);
      await writeTaskOrder(tx, toColumnId, dest);
      await writeTaskOrder(tx, fromColumnId, source);
      columns = [
        { columnId: fromColumnId, taskIds: source },
        { columnId: toColumnId, taskIds: dest },
      ];
    }

    const fromColumn =
      fromColumnId === toColumnId ? target : await tx.column.findUniqueOrThrow({ where: { id: fromColumnId } });
    const task = formatTask(await loadTask(tx, projectId, taskId));
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'task.moved',
      entityType: 'task',
      entityId: taskId,
      meta: { title: current.title, fromColumn: fromColumn.name, toColumn: target.name },
    });
    return { result: { task, columns }, log };
  });

  // Gửi cả cho người kéo để client lấy bố cục server làm chuẩn
  realtime.toProject(projectId, ServerEvents.taskMoved, result);
  publishActivity(log);
  return result;
}

export async function deleteTask(ctx: Ctx, projectId: string, taskId: string) {
  const { columnId, order, log } = await prisma.$transaction(async (tx) => {
    const current = await lockTaskColumns(tx, projectId, taskId);
    const columnId = current.columnId;

    await tx.task.delete({ where: { id: taskId } });
    const order = await orderedTaskIds(tx, columnId);
    await writeTaskOrder(tx, columnId, order);

    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'task.deleted',
      entityType: 'task',
      entityId: taskId,
      meta: { title: current.title },
    });
    return { columnId, order, log };
  });

  realtime.toProject(projectId, ServerEvents.taskDeleted, { taskId, columnId, taskIds: order }, ctx.socketId);
  publishActivity(log);
}
