import { Router } from 'express';
import { z } from 'zod';
import { cursorQuery } from '../../lib/pagination';
import { projectIdOf } from '../../middlewares/projectAccess';
import { listActivity } from './activity.service';

export const activityRouter = Router({ mergeParams: true });

const query = cursorQuery.extend({ taskId: z.string().optional() });

activityRouter.get('/', async (req, res) => {
  const q = query.parse(req.query);
  res.json(await listActivity(projectIdOf(req), q));
});
