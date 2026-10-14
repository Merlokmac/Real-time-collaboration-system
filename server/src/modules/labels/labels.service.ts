import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { recordActivity } from '../activity/activity.service';

export function listLabels(projectId: string) {
  return prisma.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
}

export async function createLabel(ctx: Ctx, projectId: string, input: { name: string; color: string }) {
  const label = await prisma.label.create({ data: { projectId, ...input } });
  realtime.toProject(projectId, ServerEvents.labelCreated, label, ctx.socketId);
  await recordActivity({
    projectId,
    actorId: ctx.userId,
    action: 'label.created',
    entityType: 'label',
    entityId: label.id,
    meta: { name: label.name },
  });
  return label;
}

export async function updateLabel(
  ctx: Ctx,
  projectId: string,
  labelId: string,
  input: { name?: string; color?: string },
) {
  const result = await prisma.label.updateMany({ where: { id: labelId, projectId }, data: input });
  if (result.count === 0) throw notFound('Không tìm thấy nhãn');
  const label = await prisma.label.findUniqueOrThrow({ where: { id: labelId } });
  realtime.toProject(projectId, ServerEvents.labelUpdated, label, ctx.socketId);
  return label;
}

export async function deleteLabel(ctx: Ctx, projectId: string, labelId: string) {
  const label = await prisma.label.findFirst({ where: { id: labelId, projectId } });
  if (!label) throw notFound('Không tìm thấy nhãn');
  await prisma.label.delete({ where: { id: labelId } });
  realtime.toProject(projectId, ServerEvents.labelDeleted, { labelId }, ctx.socketId);
  await recordActivity({
    projectId,
    actorId: ctx.userId,
    action: 'label.deleted',
    entityType: 'label',
    entityId: labelId,
    meta: { name: label.name },
  });
}
