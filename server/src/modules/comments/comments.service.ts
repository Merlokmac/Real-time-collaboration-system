import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { forbidden, notFound } from '../../lib/errors';
import { toPage } from '../../lib/pagination';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { recordActivity } from '../activity/activity.service';

const commentInclude = { author: { select: publicUser } } satisfies Prisma.CommentInclude;

async function assertTask(projectId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true, title: true } });
  if (!task) throw notFound('Không tìm thấy công việc');
  return task;
}

// Trả về theo thứ tự mới nhất trước, client đảo lại khi hiển thị
export async function listComments(projectId: string, taskId: string, opts: { cursor?: string; limit: number }) {
  await assertTask(projectId, taskId);
  const rows = await prisma.comment.findMany({
    where: { taskId },
    include: commentInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return toPage(rows, opts.limit);
}

export async function createComment(
  ctx: Ctx,
  projectId: string,
  taskId: string,
  input: { content: string; clientId?: string },
) {
  const task = await assertTask(projectId, taskId);

  if (input.clientId) {
    const existing = await prisma.comment.findUnique({
      where: { authorId_clientId: { authorId: ctx.userId, clientId: input.clientId } },
      include: commentInclude,
    });
    // Client gửi lại do mất mạng: trả về bản đã lưu, không tạo bản thứ hai
    if (existing) return { comment: existing, created: false };
  }

  let comment;
  try {
    comment = await prisma.comment.create({
      data: { taskId, authorId: ctx.userId, content: input.content, clientId: input.clientId },
      include: commentInclude,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && input.clientId) {
      const existing = await prisma.comment.findUniqueOrThrow({
        where: { authorId_clientId: { authorId: ctx.userId, clientId: input.clientId } },
        include: commentInclude,
      });
      return { comment: existing, created: false };
    }
    throw err;
  }

  realtime.toProject(projectId, ServerEvents.commentCreated, comment, ctx.socketId);
  await recordActivity({
    projectId,
    actorId: ctx.userId,
    action: 'comment.created',
    entityType: 'task',
    entityId: taskId,
    meta: { title: task.title, commentId: comment.id },
  });
  return { comment, created: true };
}

async function loadOwnComment(ctx: Ctx, projectId: string, taskId: string, commentId: string, allowOwner: boolean) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, taskId, task: { projectId } },
  });
  if (!comment) throw notFound('Không tìm thấy bình luận');
  if (comment.authorId !== ctx.userId) {
    const isOwner =
      allowOwner && (await prisma.projectMember.count({ where: { projectId, userId: ctx.userId, role: 'OWNER' } })) > 0;
    if (!isOwner) throw forbidden('Bạn chỉ được thao tác với bình luận của mình');
  }
  return comment;
}

export async function updateComment(ctx: Ctx, projectId: string, taskId: string, commentId: string, content: string) {
  const task = await assertTask(projectId, taskId);
  await loadOwnComment(ctx, projectId, taskId, commentId, false);
  const comment = await prisma.comment.update({
    where: { id: commentId },
    data: { content, editedAt: new Date() },
    include: commentInclude,
  });
  realtime.toProject(projectId, ServerEvents.commentUpdated, comment, ctx.socketId);
  await recordActivity({
    projectId,
    actorId: ctx.userId,
    action: 'comment.updated',
    entityType: 'task',
    entityId: taskId,
    meta: { title: task.title, commentId },
  });
  return comment;
}

export async function deleteComment(ctx: Ctx, projectId: string, taskId: string, commentId: string) {
  const task = await assertTask(projectId, taskId);
  const comment = await loadOwnComment(ctx, projectId, taskId, commentId, true);
  await prisma.comment.delete({ where: { id: commentId } });
  realtime.toProject(projectId, ServerEvents.commentDeleted, { taskId, commentId }, ctx.socketId);
  await recordActivity({
    projectId,
    actorId: ctx.userId,
    action: 'comment.deleted',
    entityType: 'task',
    entityId: taskId,
    // Chủ dự án xóa bình luận của người khác thì ghi rõ tác giả
    meta: { title: task.title, commentId, authorId: comment.authorId },
  });
}
