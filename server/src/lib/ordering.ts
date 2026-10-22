import type { Db } from './prisma';

export function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length));
}

export function moveInList<T>(list: T[], item: T, toIndex: number): T[] {
  const rest = list.filter((x) => x !== item);
  rest.splice(clampIndex(toIndex, rest.length), 0, item);
  return rest;
}

// Ghi lại position 0..n-1 cho danh sách thẻ của một cột, chỉ cập nhật dòng thực sự thay đổi
export async function writeTaskOrder(tx: Db, columnId: string, taskIds: string[]) {
  if (taskIds.length === 0) return;
  const positions = taskIds.map((_, i) => i);
  await tx.$executeRaw`
    UPDATE tasks AS t
    SET position = v.pos, column_id = ${columnId}, updated_at = now()
    FROM unnest(${taskIds}::text[], ${positions}::int[]) AS v(id, pos)
    WHERE t.id = v.id AND (t.position <> v.pos OR t.column_id <> ${columnId})
  `;
}

export async function writeColumnOrder(tx: Db, columnIds: string[]) {
  if (columnIds.length === 0) return;
  const positions = columnIds.map((_, i) => i);
  await tx.$executeRaw`
    UPDATE columns AS c
    SET position = v.pos, updated_at = now()
    FROM unnest(${columnIds}::text[], ${positions}::int[]) AS v(id, pos)
    WHERE c.id = v.id AND c.position <> v.pos
  `;
}

export async function lockProject(tx: Db, projectId: string) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR NO KEY UPDATE`;
}

// Khóa theo thứ tự id cố định để hai giao dịch không chờ nhau vòng tròn
export async function lockColumns(tx: Db, columnIds: string[]) {
  const ids = [...new Set(columnIds)].sort();
  for (const id of ids) {
    await tx.$queryRaw`SELECT id FROM columns WHERE id = ${id} FOR NO KEY UPDATE`;
  }
}

export async function orderedTaskIds(tx: Db, columnId: string) {
  const rows = await tx.task.findMany({
    where: { columnId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
