import { Prisma } from '@prisma/client';
import { publicUser } from '../../lib/selects';

export const taskInclude = {
  assignee: { select: publicUser },
  labels: { include: { label: true } },
  column: { select: { isDone: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function formatTask(task: TaskRow, now = new Date()) {
  const { labels, column, ...rest } = task;
  return {
    ...rest,
    labels: labels.map((l) => l.label),
    // Chỉ cảnh báo quá hạn khi thẻ chưa nằm trong cột hoàn thành
    isOverdue: !!task.dueDate && task.dueDate < now && !column.isDone,
  };
}

export type TaskDto = ReturnType<typeof formatTask>;
