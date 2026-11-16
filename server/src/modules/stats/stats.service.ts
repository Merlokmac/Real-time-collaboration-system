import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { buildStats } from './stats.format';

export async function getProjectStats(projectId: string) {
  const [columns, tasks, members] = await Promise.all([
    prisma.column.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, isDone: true },
    }),
    prisma.task.findMany({ where: { projectId }, select: { columnId: true, assigneeId: true, dueDate: true } }),
    prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: publicUser } },
    }),
  ]);
  return buildStats(
    columns,
    tasks,
    members.map((m) => m.user),
  );
}
