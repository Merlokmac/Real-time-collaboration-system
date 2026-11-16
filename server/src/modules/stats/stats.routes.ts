import { Router } from 'express';
import { projectIdOf } from '../../middlewares/projectAccess';
import { getProjectStats } from './stats.service';

export const statsRouter = Router({ mergeParams: true });

statsRouter.get('/', async (req, res) => {
  res.json({ stats: await getProjectStats(projectIdOf(req)) });
});
