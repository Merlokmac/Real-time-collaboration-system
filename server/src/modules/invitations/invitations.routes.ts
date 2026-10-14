import { Router } from 'express';
import { z } from 'zod';
import { ctxOf, currentUserId } from '../../middlewares/auth';
import { projectIdOf, requireOwner } from '../../middlewares/projectAccess';
import * as invitations from './invitations.service';

// /api/invitations: lời mời của người đang đăng nhập
export const myInvitationsRouter = Router();

myInvitationsRouter.get('/', async (req, res) => {
  res.json({ items: await invitations.listMyInvitations(currentUserId(req)) });
});

myInvitationsRouter.post('/:invitationId/accept', async (req, res) => {
  res.json(await invitations.respond(ctxOf(req), String(req.params.invitationId), true));
});

myInvitationsRouter.post('/:invitationId/decline', async (req, res) => {
  res.json(await invitations.respond(ctxOf(req), String(req.params.invitationId), false));
});

// /api/projects/:projectId/invitations: chủ dự án quản lý
export const projectInvitationsRouter = Router({ mergeParams: true });
projectInvitationsRouter.use(requireOwner);

projectInvitationsRouter.get('/', async (req, res) => {
  res.json({ items: await invitations.listProjectInvitations(projectIdOf(req)) });
});

projectInvitationsRouter.post('/', async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Email không hợp lệ') }).parse(req.body);
  res.status(201).json({ invitation: await invitations.invite(ctxOf(req), projectIdOf(req), email) });
});

projectInvitationsRouter.delete('/:invitationId', async (req, res) => {
  await invitations.cancelInvitation(ctxOf(req), projectIdOf(req), String(req.params.invitationId));
  res.status(204).end();
});
