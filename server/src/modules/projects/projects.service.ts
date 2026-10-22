import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';

export const DEFAULT_COLUMNS = [
  { name: 'Cần làm', isDone: false },
  { name: 'Đang làm', isDone: false },
  { name: 'Hoàn thành', isDone: true },
];

export async function listMyProjects(userId: string, q?: string) {
  const memberships = await prisma.projectMember.findMany({
    where: {
      userId,
      ...(q ? { project: { name: { contains: q, mode: 'insensitive' } } } : {}),
    },
    include: { project: { include: { _count: { select: { members: true } } } } },
    orderBy: { project: { updatedAt: 'desc' } },
  });

  return memberships.map(({ project, role }) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    role,
    memberCount: project._count.members,
    updatedAt: project.updatedAt,
  }));
}

export async function createProject(ctx: Ctx, input: { name: string; description?: string }) {
  const { project, log } = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: input.name,
        description: input.description ?? '',
        createdById: ctx.userId,
        members: { create: { userId: ctx.userId, role: 'OWNER' } },
        columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, position: i })) },
      },
    });
    const log = await logActivity(tx, {
      projectId: project.id,
      actorId: ctx.userId,
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
      meta: { name: project.name },
    });
    return { project, log };
  });
  publishActivity(log);
  return { ...project, role: 'OWNER' as const, memberCount: 1 };
}

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { _count: { select: { members: true } } },
  });
  if (!project) throw notFound('Không tìm thấy dự án');
  const { _count, ...rest } = project;
  return { ...rest, memberCount: _count.members };
}

export async function updateProject(ctx: Ctx, projectId: string, input: { name?: string; description?: string }) {
  const { project, log } = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({ where: { id: projectId }, data: input });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'project.updated',
      entityType: 'project',
      entityId: projectId,
      meta: input,
    });
    return { project, log };
  });
  realtime.toProject(projectId, ServerEvents.projectUpdated, project, ctx.socketId);
  publishActivity(log);
  return project;
}

export async function deleteProject(ctx: Ctx, projectId: string, confirmName: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Không tìm thấy dự án');
  if (project.name !== confirmName) throw badRequest('Tên xác nhận không khớp với tên dự án');

  // Thẻ tham chiếu cột bằng Restrict nên xóa thẻ trước, phần còn lại cascade theo project
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  realtime.toProject(projectId, ServerEvents.projectDeleted, { projectId });
  realtime.closeProject(projectId);
}
