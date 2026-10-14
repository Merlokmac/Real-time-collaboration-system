import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { toPage } from '../../lib/pagination';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';

export type ActivityInput = {
  projectId: string;
  actorId: string;
  action: string;
  entityType: 'project' | 'member' | 'invitation' | 'column' | 'task' | 'label' | 'comment';
  entityId: string;
  meta?: Prisma.InputJsonValue;
};

const activityInclude = { actor: { select: publicUser } } satisfies Prisma.ActivityLogInclude;
export type ActivityWithActor = Prisma.ActivityLogGetPayload<{ include: typeof activityInclude }>;

// Gọi bên trong transaction của thao tác chính, chỉ phát sự kiện sau khi commit
export function logActivity(db: Db, input: ActivityInput) {
  return db.activityLog.create({ data: input, include: activityInclude });
}

export function publishActivity(log: ActivityWithActor | null | undefined) {
  if (log) realtime.toProject(log.projectId, ServerEvents.activityCreated, log);
}

export async function recordActivity(input: ActivityInput) {
  const log = await logActivity(prisma, input);
  publishActivity(log);
  return log;
}

export async function listActivity(projectId: string, opts: { cursor?: string; limit: number; taskId?: string }) {
  const rows = await prisma.activityLog.findMany({
    where: {
      projectId,
      ...(opts.taskId ? { entityType: 'task', entityId: opts.taskId } : {}),
    },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return toPage(rows, opts.limit);
}
