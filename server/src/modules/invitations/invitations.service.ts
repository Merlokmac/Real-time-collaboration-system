import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';

const INVITATION_TTL_DAYS = 7;

const invitationInclude = {
  project: { select: { id: true, name: true, description: true } },
  inviter: { select: publicUser },
  invitee: { select: publicUser },
} satisfies Prisma.InvitationInclude;

const pendingWhere = () => ({ status: 'PENDING' as const, expiresAt: { gt: new Date() } });

export function listProjectInvitations(projectId: string) {
  return prisma.invitation.findMany({
    where: { projectId, ...pendingWhere() },
    include: invitationInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export function listMyInvitations(userId: string) {
  return prisma.invitation.findMany({
    where: { inviteeId: userId, ...pendingWhere() },
    include: invitationInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function invite(ctx: Ctx, projectId: string, email: string) {
  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) throw notFound('Email này chưa đăng ký tài khoản');

  const { invitation, log } = await prisma.$transaction(async (tx) => {
    // Khóa dòng project để hai lời mời gửi cùng lúc không tạo trùng
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR NO KEY UPDATE`;

    const member = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: invitee.id } },
    });
    if (member) throw conflict('ALREADY_MEMBER', 'Người này đã là thành viên dự án');

    const pending = await tx.invitation.findFirst({ where: { projectId, inviteeId: invitee.id, ...pendingWhere() } });
    if (pending) throw conflict('ALREADY_INVITED', 'Đã gửi lời mời cho người này và đang chờ phản hồi');

    const invitation = await tx.invitation.create({
      data: {
        projectId,
        inviteeId: invitee.id,
        inviterId: ctx.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
      include: invitationInclude,
    });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'invitation.sent',
      entityType: 'invitation',
      entityId: invitation.id,
      meta: { inviteeName: invitee.name, inviteeEmail: invitee.email },
    });
    return { invitation, log };
  });

  realtime.toUser(invitee.id, ServerEvents.invitationReceived, invitation);
  publishActivity(log);
  return invitation;
}

export async function cancelInvitation(ctx: Ctx, projectId: string, invitationId: string) {
  const result = await prisma.invitation.updateMany({
    where: { id: invitationId, projectId, status: 'PENDING' },
    data: { status: 'CANCELED', respondedAt: new Date() },
  });
  if (result.count === 0) throw notFound('Không tìm thấy lời mời đang chờ');

  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  realtime.toUser(invitation.inviteeId, ServerEvents.invitationCanceled, { invitationId, projectId });
}

export async function respond(ctx: Ctx, invitationId: string, accept: boolean) {
  const { invitation, log } = await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({
      where: { id: invitationId, inviteeId: ctx.userId },
      include: invitationInclude,
    });
    if (!invitation) throw notFound('Không tìm thấy lời mời');
    if (invitation.status !== 'PENDING') throw badRequest('Lời mời đã được xử lý');
    if (invitation.expiresAt <= new Date()) throw badRequest('Lời mời đã hết hạn');

    // Điều kiện status = PENDING đảm bảo bấm hai lần chỉ xử lý một lần
    const updated = await tx.invitation.updateMany({
      where: { id: invitationId, status: 'PENDING' },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    });
    if (updated.count === 0) throw badRequest('Lời mời đã được xử lý');

    if (!accept) return { invitation, log: null };

    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: invitation.projectId, userId: ctx.userId } },
      create: { projectId: invitation.projectId, userId: ctx.userId, role: 'MEMBER' },
      update: {},
    });
    const log = await logActivity(tx, {
      projectId: invitation.projectId,
      actorId: ctx.userId,
      action: 'member.joined',
      entityType: 'member',
      entityId: ctx.userId,
      meta: { name: invitation.invitee.name },
    });
    return { invitation, log };
  });

  if (accept) {
    realtime.toProject(invitation.projectId, ServerEvents.memberJoined, {
      projectId: invitation.projectId,
      user: invitation.invitee,
      role: 'MEMBER',
    });
    publishActivity(log);
  }
  return { projectId: invitation.projectId, status: accept ? 'ACCEPTED' : 'DECLINED' };
}
