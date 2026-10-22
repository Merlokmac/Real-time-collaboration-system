import { Router } from 'express';
import { z } from 'zod';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf } from '../../middlewares/projectAccess';
import * as columns from './columns.service';

export const columnsRouter = Router({ mergeParams: true });

const name = z.string().trim().min(1, 'Tên cột không được trống').max(50);

columnsRouter.post('/', async (req, res) => {
  const body = z.object({ name, isDone: z.boolean().optional() }).parse(req.body);
  res.status(201).json({ column: await columns.createColumn(ctxOf(req), projectIdOf(req), body) });
});

columnsRouter.patch('/:columnId', async (req, res) => {
  const body = z
    .object({ name: name.optional(), isDone: z.boolean().optional() })
    .refine((v) => v.name !== undefined || v.isDone !== undefined, { message: 'Không có gì để cập nhật' })
    .parse(req.body);
  res.json({ column: await columns.updateColumn(ctxOf(req), projectIdOf(req), String(req.params.columnId), body) });
});

columnsRouter.post('/:columnId/move', async (req, res) => {
  const { toIndex } = z.object({ toIndex: z.number().int().min(0) }).parse(req.body);
  const columnIds = await columns.moveColumn(ctxOf(req), projectIdOf(req), String(req.params.columnId), toIndex);
  res.json({ columnIds });
});

columnsRouter.delete('/:columnId', async (req, res) => {
  await columns.deleteColumn(ctxOf(req), projectIdOf(req), String(req.params.columnId));
  res.status(204).end();
});
