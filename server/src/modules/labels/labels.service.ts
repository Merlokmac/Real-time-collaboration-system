import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';
import { formatTask, taskInclude } from '../tasks/tasks.format';

export function listLabels(projectId: string) {
  return prisma.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
}

export async function createLabel(ctx: Ctx, projectId: string, input: { name: string; color: string }) {
  const { label, log } = await prisma.$transaction(async (tx) => {
    const label = await tx.label.create({ data: { projectId, ...input } });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'label.created',
      entityType: 'label',
      entityId: label.id,
      meta: { name: label.name },
    });
    return { label, log };
  });
  realtime.toProject(projectId, ServerEvents.labelCreated, label, ctx.socketId);
  publishActivity(log);
  return label;
}

export async function updateLabel(
  ctx: Ctx,
  projectId: string,
  labelId: string,
  input: { name?: string; color?: string },
) {
  const { label, log } = await prisma.$transaction(async (tx) => {
    const before = await tx.label.findFirst({ where: { id: labelId, projectId } });
    if (!before) throw notFound('Không tìm thấy nhãn');
    const label = await tx.label.update({ where: { id: labelId }, data: input });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'label.updated',
      entityType: 'label',
      entityId: labelId,
      meta: { name: label.name, previousName: before.name, color: label.color },
    });
    return { label, log };
  });
  realtime.toProject(projectId, ServerEvents.labelUpdated, label, ctx.socketId);
  publishActivity(log);
  return label;
}

/**
 * Xóa nhãn cũng làm thay đổi các thẻ đang gắn nhãn đó,
 * nên tăng version của các thẻ này để bản nháp cũ ở client không ghi đè lại nhãn đã xóa.
 */
export async function deleteLabel(ctx: Ctx, projectId: string, labelId: string) {
  const { tasks, log } = await prisma.$transaction(async (tx) => {
    const label = await tx.label.findFirst({ where: { id: labelId, projectId } });
    if (!label) throw notFound('Không tìm thấy nhãn');

    const links = await tx.taskLabel.findMany({ where: { labelId }, select: { taskId: true } });
    const taskIds = links.map((l) => l.taskId);

    await tx.label.delete({ where: { id: labelId } });
    if (taskIds.length) {
      await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { version: { increment: 1 } } });
    }
    const tasks = taskIds.length
      ? await tx.task.findMany({ where: { id: { in: taskIds } }, include: taskInclude })
      : [];

    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'label.deleted',
      entityType: 'label',
      entityId: labelId,
      meta: { name: label.name, taskCount: taskIds.length },
    });
    return { tasks: tasks.map((t) => formatTask(t)), log };
  });

  realtime.toProject(projectId, ServerEvents.labelDeleted, { labelId }, ctx.socketId);
  // Gửi cả cho người xóa vì thẻ của họ cũng đổi version
  for (const task of tasks) realtime.toProject(projectId, ServerEvents.taskUpdated, task);
  publishActivity(log);
}
