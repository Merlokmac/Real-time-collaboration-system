import { Router } from 'express';
import { z } from 'zod';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf } from '../../middlewares/projectAccess';
import * as checklist from './checklist.service';

// /api/projects/:projectId/tasks/:taskId/checklist
export const checklistRouter = Router({ mergeParams: true });

const content = z.string().trim().min(1, 'Nội dung không được trống').max(200);
const taskId = (req: { params: Record<string, unknown> }) => String(req.params.taskId);
const itemId = (req: { params: Record<string, unknown> }) => String(req.params.itemId);

checklistRouter.get('/', async (req, res) => {
  res.json(await checklist.getChecklist(projectIdOf(req), taskId(req)));
});

checklistRouter.post('/', async (req, res) => {
  const body = z.object({ content }).parse(req.body);
  res.status(201).json(await checklist.addItem(ctxOf(req), projectIdOf(req), taskId(req), body.content));
});

checklistRouter.patch('/:itemId', async (req, res) => {
  const body = z
    .object({ content: content.optional(), isDone: z.boolean().optional() })
    .refine((v) => v.content !== undefined || v.isDone !== undefined, { message: 'Không có gì để cập nhật' })
    .parse(req.body);
  res.json(await checklist.updateItem(ctxOf(req), projectIdOf(req), taskId(req), itemId(req), body));
});

checklistRouter.post('/:itemId/move', async (req, res) => {
  const { toIndex } = z.object({ toIndex: z.number().int().min(0) }).parse(req.body);
  res.json(await checklist.moveItem(ctxOf(req), projectIdOf(req), taskId(req), itemId(req), toIndex));
});

checklistRouter.delete('/:itemId', async (req, res) => {
  res.json(await checklist.deleteItem(ctxOf(req), projectIdOf(req), taskId(req), itemId(req)));
});
