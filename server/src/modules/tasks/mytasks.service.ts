import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { formatTask, taskInclude } from './tasks.format';

export type MyTasksFilter = {
  status: 'open' | 'done' | 'all';
  overdue: boolean;
  limit: number;
};

const myTaskInclude = {
  ...taskInclude,
  column: { select: { id: true, name: true, isDone: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

// Việc được giao cho mình ở mọi dự án, việc gần hạn nhất lên đầu, việc không có hạn xếp cuối
export async function listMyTasks(userId: string, filter: MyTasksFilter) {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    assigneeId: userId,
    project: { members: { some: { userId } } },
  };
  if (filter.overdue) {
    // Quá hạn chỉ tính thẻ chưa nằm trong cột hoàn thành
    where.dueDate = { lt: now };
    where.column = { isDone: false };
  } else if (filter.status !== 'all') {
    where.column = { isDone: filter.status === 'done' };
  }

  const rows = await prisma.task.findMany({
    where,
    include: myTaskInclude,
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: filter.limit,
  });
  return {
    items: rows.map((row) => ({ ...formatTask(row, now), column: row.column, project: row.project })),
  };
}
