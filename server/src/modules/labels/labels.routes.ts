import { Router } from 'express';
import { z } from 'zod';
import { ctxOf } from '../../middlewares/auth';
import { projectIdOf } from '../../middlewares/projectAccess';
import * as labels from './labels.service';

export const labelsRouter = Router({ mergeParams: true });

const name = z.string().trim().min(1, 'Tên nhãn không được trống').max(30);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải có dạng #RRGGBB');

labelsRouter.get('/', async (req, res) => {
  res.json({ items: await labels.listLabels(projectIdOf(req)) });
});

labelsRouter.post('/', async (req, res) => {
  const body = z.object({ name, color }).parse(req.body);
  res.status(201).json({ label: await labels.createLabel(ctxOf(req), projectIdOf(req), body) });
});

labelsRouter.patch('/:labelId', async (req, res) => {
  const body = z
    .object({ name: name.optional(), color: color.optional() })
    .refine((v) => v.name !== undefined || v.color !== undefined, { message: 'Không có gì để cập nhật' })
    .parse(req.body);
  res.json({ label: await labels.updateLabel(ctxOf(req), projectIdOf(req), String(req.params.labelId), body) });
});

labelsRouter.delete('/:labelId', async (req, res) => {
  await labels.deleteLabel(ctxOf(req), projectIdOf(req), String(req.params.labelId));
  res.status(204).end();
});
