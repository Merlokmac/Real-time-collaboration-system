import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { formatTask, taskInclude } from '../tasks/tasks.format';

export type BoardFilter = {
  q?: string;
  assigneeId?: string; // 'none' = chưa giao
  labelId?: string;
  overdue?: boolean;
};

export async function getBoard(projectId: string, filter: BoardFilter) {
  const now = new Date();
  const where: Prisma.TaskWhereInput = { projectId };

  if (filter.q) where.title = { contains: filter.q, mode: 'insensitive' };
  if (filter.assigneeId) where.assigneeId = filter.assigneeId === 'none' ? null : filter.assigneeId;
  if (filter.labelId) where.labels = { some: { labelId: filter.labelId } };
  if (filter.overdue) {
    where.dueDate = { lt: now };
    where.column = { isDone: false };
  }

  const [columns, tasks, labels] = await Promise.all([
    prisma.column.findMany({ where: { projectId }, orderBy: { position: 'asc' } }),
    prisma.task.findMany({ where, include: taskInclude, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    prisma.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } }),
  ]);

  const byColumn = new Map(columns.map((c) => [c.id, [] as ReturnType<typeof formatTask>[]]));
  for (const t of tasks) byColumn.get(t.columnId)?.push(formatTask(t, now));

  return {
    columns: columns.map((c) => ({ ...c, tasks: byColumn.get(c.id) ?? [] })),
    labels,
    filtered: Boolean(filter.q || filter.assigneeId || filter.labelId || filter.overdue),
  };
}
