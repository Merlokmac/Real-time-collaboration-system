import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';
import { formatTask, taskInclude } from '../tasks/tasks.format';

export function listMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: publicUser } },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });
}

// Dùng chung cho xóa thành viên và tự rời dự án
async function detachMember(ctx: Ctx, projectId: string, userId: string, action: 'member.removed' | 'member.left') {
  const { log, user, unassignedTasks } = await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { user: { select: publicUser } },
    });
    if (!member) throw notFound('Người này không thuộc dự án');
    if (member.role === 'OWNER') {
      throw forbidden('Chủ dự án cần chuyển quyền cho người khác trước');
    }

    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    // Thẻ đang giao cho người này chuyển về trạng thái chưa giao
    const unassigned = await tx.task.findMany({ where: { projectId, assigneeId: userId }, select: { id: true } });
    if (unassigned.length) {
      await tx.task.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null, version: { increment: 1 } },
      });
    }

    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action,
      entityType: 'member',
      entityId: userId,
      meta: { name: member.user.name, unassignedTaskIds: unassigned.map((t) => t.id) },
    });
    const unassignedTasks = unassigned.length
      ? await tx.task.findMany({ where: { id: { in: unassigned.map((t) => t.id) } }, include: taskInclude })
      : [];
    return { log, user: member.user, unassignedTasks: unassignedTasks.map((t) => formatTask(t)) };
  });

  const unassignedTaskIds = unassignedTasks.map((t) => t.id);
  realtime.revokeAccess(projectId, userId);
  realtime.toProject(projectId, ServerEvents.memberRemoved, { projectId, userId, user, unassignedTaskIds });
  // Version của các thẻ này đã tăng, phát lại để bản nháp cũ ở client không ghi đè người phụ trách
  for (const task of unassignedTasks) realtime.toProject(projectId, ServerEvents.taskUpdated, task);
  publishActivity(log);
}

export function removeMember(ctx: Ctx, projectId: string, userId: string) {
  if (userId === ctx.userId) throw badRequest('Dùng chức năng rời dự án để tự rời');
  return detachMember(ctx, projectId, userId, 'member.removed');
}

export function leaveProject(ctx: Ctx, projectId: string) {
  return detachMember(ctx, projectId, ctx.userId, 'member.left');
}

export async function transferOwnership(ctx: Ctx, projectId: string, newOwnerId: string) {
  if (newOwnerId === ctx.userId) throw badRequest('Bạn đang là chủ dự án');

  const log = await prisma.$transaction(async (tx) => {
    const target = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: newOwnerId } },
      include: { user: { select: publicUser } },
    });
    if (!target) throw notFound('Người nhận quyền phải là thành viên dự án');

    const demoted = await tx.projectMember.updateMany({
      where: { projectId, userId: ctx.userId, role: 'OWNER' },
      data: { role: 'MEMBER' },
    });
    if (demoted.count === 0) throw forbidden('Chỉ chủ dự án được chuyển quyền');

    await tx.projectMember.update({
      where: { projectId_userId: { projectId, userId: newOwnerId } },
      data: { role: 'OWNER' },
    });

    return logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'member.ownership_transferred',
      entityType: 'member',
      entityId: newOwnerId,
      meta: { name: target.user.name },
    });
  });

  realtime.toProject(projectId, ServerEvents.memberRoleChanged, {
    projectId,
    changes: [
      { userId: ctx.userId, role: 'MEMBER' },
      { userId: newOwnerId, role: 'OWNER' },
    ],
  });
  publishActivity(log);
  return listMembers(projectId);
}
