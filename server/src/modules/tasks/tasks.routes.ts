import { Router } from 'express';
import { z } from 'zod';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf } from '../../middlewares/projectAccess';
import * as tasks from './tasks.service';

export const tasksRouter = Router({ mergeParams: true });

const title = z.string().trim().min(1, 'Tiêu đề không được trống').max(200);
const dueDate = z.coerce.date().nullable();
const labelIds = z.array(z.string().min(1)).max(20);

const createBody = z.object({
  columnId: z.string().min(1),
  title,
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: dueDate.optional(),
  labelIds: labelIds.optional(),
});

const updateBody = z
  .object({
    version: z.number().int().positive(),
    title: title.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    dueDate: dueDate.optional(),
    labelIds: labelIds.optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: 'Không có gì để cập nhật' });

const moveBody = z.object({
  toColumnId: z.string().min(1),
  toIndex: z.number().int().min(0),
});

const taskId = (req: { params: Record<string, unknown> }) => String(req.params.taskId);

tasksRouter.post('/', async (req, res) => {
  const body = createBody.parse(req.body);
  res.status(201).json({ task: await tasks.createTask(ctxOf(req), projectIdOf(req), body) });
});

tasksRouter.get('/:taskId', async (req, res) => {
  res.json({ task: await tasks.getTask(projectIdOf(req), taskId(req)) });
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const body = updateBody.parse(req.body);
  res.json({ task: await tasks.updateTask(ctxOf(req), projectIdOf(req), taskId(req), body) });
});

tasksRouter.post('/:taskId/move', async (req, res) => {
  const { toColumnId, toIndex } = moveBody.parse(req.body);
  res.json(await tasks.moveTask(ctxOf(req), projectIdOf(req), taskId(req), toColumnId, toIndex));
});

tasksRouter.delete('/:taskId', async (req, res) => {
  await tasks.deleteTask(ctxOf(req), projectIdOf(req), taskId(req));
  res.status(204).end();
});
