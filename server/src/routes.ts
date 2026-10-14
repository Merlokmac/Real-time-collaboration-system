import { Router } from 'express';
import { requireAuth } from './middlewares/auth';
import { requireProjectMember } from './middlewares/projectAccess';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { projectsRouter, projectDetailRouter } from './modules/projects/projects.routes';
import { membersRouter } from './modules/members/members.routes';
import { myInvitationsRouter, projectInvitationsRouter } from './modules/invitations/invitations.routes';
import { boardRouter } from './modules/board/board.routes';
import { columnsRouter } from './modules/columns/columns.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { labelsRouter } from './modules/labels/labels.routes';
import { commentsRouter } from './modules/comments/comments.routes';
import { messagesRouter } from './modules/messages/messages.routes';
import { activityRouter } from './modules/activity/activity.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

apiRouter.use(requireAuth);
apiRouter.use('/users', usersRouter);
apiRouter.use('/invitations', myInvitationsRouter);
apiRouter.use('/projects', projectsRouter);

const project = Router({ mergeParams: true });
project.use(requireProjectMember);
project.use('/members', membersRouter);
project.use('/invitations', projectInvitationsRouter);
project.use('/board', boardRouter);
project.use('/columns', columnsRouter);
project.use('/tasks/:taskId/comments', commentsRouter);
project.use('/tasks', tasksRouter);
project.use('/labels', labelsRouter);
project.use('/messages', messagesRouter);
project.use('/activity', activityRouter);
project.use('/', projectDetailRouter);

apiRouter.use('/projects/:projectId', project);
