import { Router } from 'express';
import { z } from 'zod';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf, requireOwner } from '../../middlewares/projectAccess';
import * as members from './members.service';

export const membersRouter = Router({ mergeParams: true });

membersRouter.get('/', async (req, res) => {
  res.json({ items: await members.listMembers(projectIdOf(req)) });
});

membersRouter.post('/leave', async (req, res) => {
  await members.leaveProject(ctxOf(req), projectIdOf(req));
  res.status(204).end();
});

membersRouter.post('/transfer-ownership', requireOwner, async (req, res) => {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
  res.json({ items: await members.transferOwnership(ctxOf(req), projectIdOf(req), userId) });
});

membersRouter.delete('/:userId', requireOwner, async (req, res) => {
  await members.removeMember(ctxOf(req), projectIdOf(req), String(req.params.userId));
  res.status(204).end();
});
