import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { toPage } from '../../lib/pagination';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';

const messageInclude = { author: { select: publicUser } } satisfies Prisma.MessageInclude;

export async function listMessages(projectId: string, opts: { cursor?: string; limit: number }) {
  const rows = await prisma.message.findMany({
    where: { projectId },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return toPage(rows, opts.limit);
}

/**
 * Lưu tin nhắn chat. Phần Socket.IO cũng gọi hàm này khi nhận sự kiện gửi tin,
 * để tin nhắn luôn được lưu trước khi phát cho cả phòng.
 */
export async function createMessage(ctx: Ctx, projectId: string, input: { content: string; clientId?: string }) {
  const findExisting = () =>
    input.clientId
      ? prisma.message.findUnique({
          where: { authorId_clientId: { authorId: ctx.userId, clientId: input.clientId } },
          include: messageInclude,
        })
      : null;

  const existing = await findExisting();
  if (existing) return { message: existing, created: false };

  try {
    const message = await prisma.message.create({
      data: { projectId, authorId: ctx.userId, content: input.content, clientId: input.clientId },
      include: messageInclude,
    });
    realtime.toProject(projectId, ServerEvents.messageCreated, message, ctx.socketId);
    return { message, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const again = await findExisting();
      if (again) return { message: again, created: false };
    }
    throw err;
  }
}
