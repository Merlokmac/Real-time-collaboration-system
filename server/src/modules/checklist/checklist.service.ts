import { prisma, type Db } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { moveInList } from '../../lib/ordering';
import type { Ctx } from '../../middlewares/auth';
import { realtime } from '../../realtime/bridge';
import { ServerEvents } from '../../realtime/events';
import { logActivity, publishActivity } from '../activity/activity.service';

export const MAX_CHECKLIST_ITEMS = 50;

async function loadTask(db: Db, projectId: string, taskId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, projectId }, select: { id: true, title: true } });
  if (!task) throw notFound('Không tìm thấy công việc');
  return task;
}

// Khóa dòng thẻ để hai người thêm/kéo mục cùng lúc không ra trùng vị trí
async function lockTask(tx: Db, taskId: string) {
  await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${taskId} FOR NO KEY UPDATE`;
}

function listItems(db: Db, taskId: string) {
  return db.checklistItem.findMany({ where: { taskId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
}

async function loadItem(db: Db, taskId: string, itemId: string) {
  const item = await db.checklistItem.findFirst({ where: { id: itemId, taskId } });
  if (!item) throw notFound('Không tìm thấy mục việc cần làm');
  return item;
}

// Ghi lại position 0..n-1, chỉ cập nhật dòng thực sự thay đổi
async function writeOrder(tx: Db, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const positions = itemIds.map((_, i) => i);
  await tx.$executeRaw`
    UPDATE checklist_items AS c
    SET position = v.pos, updated_at = now()
    FROM unnest(${itemIds}::text[], ${positions}::int[]) AS v(id, pos)
    WHERE c.id = v.id AND c.position <> v.pos
  `;
}

function summarize<T extends { isDone: boolean }>(items: T[]) {
  return { items, total: items.length, done: items.filter((i) => i.isDone).length };
}

// Client chỉ cần thay cả danh sách bằng bản server gửi, không phải tự ghép từng thay đổi
function publish(projectId: string, taskId: string, items: unknown[], exceptSocketId?: string) {
  realtime.toProject(projectId, ServerEvents.checklistUpdated, { taskId, items }, exceptSocketId);
}

export async function getChecklist(projectId: string, taskId: string) {
  await loadTask(prisma, projectId, taskId);
  return summarize(await listItems(prisma, taskId));
}

export async function addItem(ctx: Ctx, projectId: string, taskId: string, content: string) {
  const { item, items, log } = await prisma.$transaction(async (tx) => {
    const task = await loadTask(tx, projectId, taskId);
    await lockTask(tx, taskId);

    const count = await tx.checklistItem.count({ where: { taskId } });
    if (count >= MAX_CHECKLIST_ITEMS) throw badRequest(`Mỗi công việc tối đa ${MAX_CHECKLIST_ITEMS} mục`);

    const item = await tx.checklistItem.create({ data: { taskId, content, position: count } });
    const log = await logActivity(tx, {
      projectId,
      actorId: ctx.userId,
      action: 'checklist.added',
      entityType: 'task',
      entityId: taskId,
      meta: { title: task.title, item: content },
    });
    return { item, items: await listItems(tx, taskId), log };
  });

  publish(projectId, taskId, items, ctx.socketId);
  publishActivity(log);
  return { item, ...summarize(items) };
}

export async function updateItem(
  ctx: Ctx,
  projectId: string,
  taskId: string,
  itemId: string,
  input: { content?: string; isDone?: boolean },
) {
  const { item, items, log } = await prisma.$transaction(async (tx) => {
    const task = await loadTask(tx, projectId, taskId);
    const before = await loadItem(tx, taskId, itemId);
    const item = await tx.checklistItem.update({ where: { id: itemId }, data: input });

    // Chỉ ghi lịch sử khi tick/bỏ tick, sửa chữ thì không cần
    const toggled = input.isDone !== undefined && input.isDone !== before.isDone;
    const log = toggled
      ? await logActivity(tx, {
          projectId,
          actorId: ctx.userId,
          action: item.isDone ? 'checklist.checked' : 'checklist.unchecked',
          entityType: 'task',
          entityId: taskId,
          meta: { title: task.title, item: item.content },
        })
      : null;
    return { item, items: await listItems(tx, taskId), log };
  });

  publish(projectId, taskId, items, ctx.socketId);
  publishActivity(log);
  return { item, ...summarize(items) };
}

export async function moveItem(ctx: Ctx, projectId: string, taskId: string, itemId: string, toIndex: number) {
  const items = await prisma.$transaction(async (tx) => {
    await loadTask(tx, projectId, taskId);
    await lockTask(tx, taskId);
    await loadItem(tx, taskId, itemId);

    const ids = (await listItems(tx, taskId)).map((i) => i.id);
    await writeOrder(tx, moveInList(ids, itemId, toIndex));
    return listItems(tx, taskId);
  });

  publish(projectId, taskId, items, ctx.socketId);
  return summarize(items);
}

export async function deleteItem(ctx: Ctx, projectId: string, taskId: string, itemId: string) {
  const items = await prisma.$transaction(async (tx) => {
    await loadTask(tx, projectId, taskId);
    await lockTask(tx, taskId);
    await loadItem(tx, taskId, itemId);

    await tx.checklistItem.delete({ where: { id: itemId } });
    const rest = (await listItems(tx, taskId)).map((i) => i.id);
    await writeOrder(tx, rest);
    return listItems(tx, taskId);
  });

  publish(projectId, taskId, items, ctx.socketId);
  return summarize(items);
}
