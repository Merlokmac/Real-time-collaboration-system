import { Router } from 'express';
import { z } from 'zod';
import { cursorQuery } from '../../lib/pagination';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf } from '../../middlewares/projectAccess';
import * as comments from './comments.service';

// /api/projects/:projectId/tasks/:taskId/comments
export const commentsRouter = Router({ mergeParams: true });

const content = z.string().trim().min(1, 'Nội dung không được trống').max(2000);
const ids = (req: { params: Record<string, unknown> }) => ({
  taskId: String(req.params.taskId),
  commentId: String(req.params.commentId),
});

commentsRouter.get('/', async (req, res) => {
  const q = cursorQuery.parse(req.query);
  res.json(await comments.listComments(projectIdOf(req), ids(req).taskId, q));
});

commentsRouter.post('/', async (req, res) => {
  const body = z.object({ content, clientId: z.string().min(1).max(64).optional() }).parse(req.body);
  const { comment, created } = await comments.createComment(ctxOf(req), projectIdOf(req), ids(req).taskId, body);
  res.status(created ? 201 : 200).json({ comment });
});

commentsRouter.patch('/:commentId', async (req, res) => {
  const body = z.object({ content }).parse(req.body);
  const { taskId, commentId } = ids(req);
  res.json({ comment: await comments.updateComment(ctxOf(req), projectIdOf(req), taskId, commentId, body.content) });
});

commentsRouter.delete('/:commentId', async (req, res) => {
  const { taskId, commentId } = ids(req);
  await comments.deleteComment(ctxOf(req), projectIdOf(req), taskId, commentId);
  res.status(204).end();
});
