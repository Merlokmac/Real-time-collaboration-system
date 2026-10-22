import { Router } from 'express';
import { z } from 'zod';
import { ctxOf, currentUserId } from '../../middlewares/auth';
import { projectIdOf, requireOwner } from '../../middlewares/projectAccess';
import * as projects from './projects.service';

// /api/projects
export const projectsRouter = Router();

const createBody = z.object({
  name: z.string().trim().min(1, 'Tên dự án không được trống').max(100),
  description: z.string().trim().max(1000).optional(),
});

projectsRouter.get('/', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
  res.json({ items: await projects.listMyProjects(currentUserId(req), q || undefined) });
});

projectsRouter.post('/', async (req, res) => {
  const body = createBody.parse(req.body);
  res.status(201).json({ project: await projects.createProject(ctxOf(req), body) });
});

// /api/projects/:projectId (đã qua requireProjectMember)
export const projectDetailRouter = Router({ mergeParams: true });

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, { message: 'Không có gì để cập nhật' });

projectDetailRouter.get('/', async (req, res) => {
  const project = await projects.getProject(projectIdOf(req));
  res.json({ project: { ...project, role: req.membership!.role } });
});

projectDetailRouter.patch('/', requireOwner, async (req, res) => {
  const body = updateBody.parse(req.body);
  res.json({ project: await projects.updateProject(ctxOf(req), projectIdOf(req), body) });
});

projectDetailRouter.delete('/', requireOwner, async (req, res) => {
  const { confirmName } = z.object({ confirmName: z.string() }).parse(req.body ?? {});
  await projects.deleteProject(ctxOf(req), projectIdOf(req), confirmName);
  res.status(204).end();
});
