import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { lockColumns, lockProject, moveInList, writeColumnOrder } from '../../lib/ordering';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';

export async function createColumn(ctx: Ctx, projectId: string, input: { name: string; isDone?: boolean }) {
  const { column, log } = await prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const count = await tx.column.count({ where: { projectId } });
    const column = await tx.column.create({
      data: { projectId, name: input.name, isDone: input.isDone ?? false, position: count },
    });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'column.created',
      entityType: 'column',
      entityId: column.id,
      meta: { name: column.name },
    });
    return { column, log };
  });
  realtime.toProject(projectId, ServerEvents.columnCreated, column, ctx.socketId);
  publishActivity(log);
  return column;
}

export async function updateColumn(
  ctx: Ctx,
  projectId: string,
  columnId: string,
  input: { name?: string; isDone?: boolean },
) {
  const { column, log } = await prisma.$transaction(async (tx) => {
    const before = await tx.column.findFirst({ where: { id: columnId, projectId } });
    if (!before) throw notFound('Không tìm thấy cột');
    const column = await tx.column.update({ where: { id: columnId }, data: input });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: input.isDone !== undefined && input.isDone !== before.isDone ? 'column.done_changed' : 'column.updated',
      entityType: 'column',
      entityId: columnId,
      meta: { name: column.name, previousName: before.name, isDone: column.isDone },
    });
    return { column, log };
  });
  realtime.toProject(projectId, ServerEvents.columnUpdated, column, ctx.socketId);
  publishActivity(log);
  return column;
}

export async function moveColumn(ctx: Ctx, projectId: string, columnId: string, toIndex: number) {
  const { order, log } = await prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const cols = await tx.column.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      select: { id: true, name: true },
    });
    const col = cols.find((c) => c.id === columnId);
    if (!col) throw notFound('Không tìm thấy cột');

    const order = moveInList(
      cols.map((c) => c.id),
      columnId,
      toIndex,
    );
    await writeColumnOrder(tx, order);
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'column.moved',
      entityType: 'column',
      entityId: columnId,
      meta: { name: col.name, toIndex: order.indexOf(columnId) },
    });
    return { order, log };
  });
  // Gửi cho cả người kéo để client lấy thứ tự server làm chuẩn
  realtime.toProject(projectId, ServerEvents.columnsReordered, { projectId, columnIds: order });
  publishActivity(log);
  return order;
}

export async function deleteColumn(ctx: Ctx, projectId: string, columnId: string) {
  const { order, log } = await prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    await lockColumns(tx, [columnId]);
    const column = await tx.column.findFirst({ where: { id: columnId, projectId } });
    if (!column) throw notFound('Không tìm thấy cột');

    const taskCount = await tx.task.count({ where: { columnId } });
    if (taskCount > 0) throw conflict('COLUMN_NOT_EMPTY', 'Chỉ được xóa cột không còn công việc');
    const total = await tx.column.count({ where: { projectId } });
    if (total <= 1) throw badRequest('Dự án cần ít nhất một cột');

    await tx.column.delete({ where: { id: columnId } });
    const remaining = await tx.column.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const order = remaining.map((c) => c.id);
    await writeColumnOrder(tx, order);

    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'column.deleted',
      entityType: 'column',
      entityId: columnId,
      meta: { name: column.name },
    });
    return { order, log };
  });
  realtime.toProject(projectId, ServerEvents.columnDeleted, { projectId, columnId, columnIds: order }, ctx.socketId);
  publishActivity(log);
}
