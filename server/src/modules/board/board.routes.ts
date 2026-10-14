import { Router } from 'express';
import { z } from 'zod';
import { projectIdOf } from '../../middlewares/projectAccess';
import { getBoard } from './board.service';

export const boardRouter = Router({ mergeParams: true });

const filterQuery = z.object({
  q: z.string().trim().max(200).optional(),
  assigneeId: z.string().optional(),
  labelId: z.string().optional(),
  overdue: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

boardRouter.get('/', async (req, res) => {
  const filter = filterQuery.parse(req.query);
  res.json(await getBoard(projectIdOf(req), { ...filter, q: filter.q || undefined }));
});
