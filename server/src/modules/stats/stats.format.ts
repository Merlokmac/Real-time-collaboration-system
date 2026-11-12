export type StatsColumn = { id: string; name: string; isDone: boolean };
export type StatsTask = { columnId: string; assigneeId: string | null; dueDate: Date | null };
export type StatsMember = { id: string; name: string; avatarUrl: string | null };

const DAY = 24 * 60 * 60 * 1000;

/**
 * Tính số liệu thống kê từ dữ liệu đã đọc sẵn, không đụng database nên test được trực tiếp.
 * Thẻ "xong" là thẻ nằm trong cột đánh dấu isDone; "quá hạn" chỉ tính thẻ chưa xong.
 */
export function buildStats(columns: StatsColumn[], tasks: StatsTask[], members: StatsMember[], now = new Date()) {
  const doneColumns = new Set(columns.filter((c) => c.isDone).map((c) => c.id));
  const isDone = (t: StatsTask) => doneColumns.has(t.columnId);
  const isOverdue = (t: StatsTask) => !!t.dueDate && t.dueDate < now && !isDone(t);
  const isDueSoon = (t: StatsTask) =>
    !!t.dueDate && t.dueDate >= now && t.dueDate.getTime() - now.getTime() <= 7 * DAY && !isDone(t);

  const total = tasks.length;
  const done = tasks.filter(isDone).length;

  return {
    total,
    done,
    overdue: tasks.filter(isOverdue).length,
    dueSoon: tasks.filter(isDueSoon).length,
    unassigned: tasks.filter((t) => !t.assigneeId).length,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
    byColumn: columns.map((c) => ({
      columnId: c.id,
      name: c.name,
      isDone: c.isDone,
      count: tasks.filter((t) => t.columnId === c.id).length,
    })),
    byAssignee: members.map((m) => {
      const mine = tasks.filter((t) => t.assigneeId === m.id);
      return {
        userId: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        total: mine.length,
        done: mine.filter(isDone).length,
        overdue: mine.filter(isOverdue).length,
      };
    }),
  };
}

export type ProjectStats = ReturnType<typeof buildStats>;
