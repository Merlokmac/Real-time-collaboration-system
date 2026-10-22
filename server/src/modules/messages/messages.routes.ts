import { Router } from 'express';
import { z } from 'zod';
import { cursorQuery } from '../../lib/pagination';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf } from '../../middlewares/projectAccess';
import * as messages from './messages.service';

export const messagesRouter = Router({ mergeParams: true });

export const messageBody = z.object({
  content: z.string().trim().min(1, 'Tin nhắn không được trống').max(2000),
  clientId: z.string().min(1).max(64).optional(),
});

messagesRouter.get('/', async (req, res) => {
  const q = cursorQuery.parse(req.query);
  res.json(await messages.listMessages(projectIdOf(req), q));
});

messagesRouter.post('/', async (req, res) => {
  const body = messageBody.parse(req.body);
  const { message, created } = await messages.createMessage(ctxOf(req), projectIdOf(req), body);
  res.status(created ? 201 : 200).json({ message });
});
