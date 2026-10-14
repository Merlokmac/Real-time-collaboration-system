import * as Y from 'yjs';
import { prisma } from '../lib/prisma';
import { recordActivity } from '../modules/activity/activity.service';
import { DESCRIPTION_FIELD, taskIdOf } from './docName';

// Số bản cập nhật tối đa trước khi gom lại thành snapshot
const COMPACT_THRESHOLD = 200;
const DESCRIPTION_TEXT_LIMIT = 10_000;

const toBytes = (u: Uint8Array) => new Uint8Array(u);

/** Trạng thái đầy đủ của tài liệu (snapshot + các cập nhật sau snapshot), null nếu chưa có gì */
export async function loadDocumentState(taskId: string): Promise<Uint8Array | null> {
  const [doc, updates] = await Promise.all([
    prisma.taskDocument.findUnique({ where: { taskId }, select: { snapshot: true } }),
    prisma.documentUpdate.findMany({ where: { taskId }, orderBy: { id: 'asc' }, select: { data: true } }),
  ]);

  const parts: Uint8Array[] = [];
  if (doc?.snapshot) parts.push(new Uint8Array(doc.snapshot));
  for (const u of updates) parts.push(new Uint8Array(u.data));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : Y.mergeUpdates(parts);
}

export async function appendUpdate(taskId: string, update: Uint8Array) {
  const [, doc] = await prisma.$transaction([
    prisma.documentUpdate.create({ data: { taskId, data: toBytes(update) } }),
    prisma.taskDocument.upsert({
      where: { taskId },
      create: { taskId, updateCount: 1 },
      update: { updateCount: { increment: 1 } },
      select: { updateCount: true },
    }),
  ]);
  if (doc.updateCount >= COMPACT_THRESHOLD) {
    compactDocument(taskId).catch((err) => console.error('Gom tài liệu Yjs lỗi', taskId, err));
  }
}

/**
 * Gộp snapshot cũ và các cập nhật thành snapshot mới, xóa các cập nhật đã gộp,
 * đồng thời xuất bản text sang tasks.description_text để tìm kiếm/hiển thị.
 */
export async function compactDocument(taskId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ snapshot: Uint8Array | null }[]>`
      SELECT snapshot FROM task_documents WHERE task_id = ${taskId} FOR UPDATE
    `;
    if (locked.length === 0) return;

    const updates = await tx.documentUpdate.findMany({
      where: { taskId },
      orderBy: { id: 'asc' },
      select: { id: true, data: true },
    });

    const parts: Uint8Array[] = [];
    if (locked[0].snapshot) parts.push(new Uint8Array(locked[0].snapshot));
    for (const u of updates) parts.push(new Uint8Array(u.data));
    if (parts.length === 0) return;

    const merged = Y.mergeUpdates(parts);
    const lastId = updates.length ? updates[updates.length - 1].id : null;

    if (lastId !== null) {
      await tx.documentUpdate.deleteMany({ where: { taskId, id: { lte: lastId } } });
    }
    const remaining = await tx.documentUpdate.count({ where: { taskId } });
    await tx.taskDocument.update({
      where: { taskId },
      data: { snapshot: toBytes(merged), updateCount: remaining },
    });
    await tx.task.update({
      where: { id: taskId },
      data: { descriptionText: extractText(merged) },
    });
  });
}

export function extractText(state: Uint8Array): string {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    return doc.getText(DESCRIPTION_FIELD).toString().slice(0, DESCRIPTION_TEXT_LIMIT);
  } finally {
    doc.destroy();
  }
}

const LOAD_ORIGIN = Symbol('db-load');

/**
 * Đối tượng persistence theo đúng giao diện setPersistence() của y-websocket:
 *   bindState: khi tài liệu được mở lần đầu trên server
 *   writeState: khi người cuối cùng rời tài liệu
 */
export const yjsPersistence = {
  async bindState(docName: string, ydoc: Y.Doc) {
    const taskId = taskIdOf(docName);
    if (!taskId) return;

    const state = await loadDocumentState(taskId);
    if (state) Y.applyUpdate(ydoc, state, LOAD_ORIGIN);

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === LOAD_ORIGIN) return;
      appendUpdate(taskId, update).catch((err) => console.error('Lưu cập nhật Yjs lỗi', taskId, err));
    });
  },

  async writeState(docName: string, _ydoc: Y.Doc) {
    const taskId = taskIdOf(docName);
    if (!taskId) return;
    try {
      await compactDocument(taskId);
    } catch (err) {
      // Thẻ có thể đã bị xóa trong lúc tài liệu còn mở
      console.error('Lưu snapshot Yjs lỗi', taskId, err);
    }
  },
};

/**
 * Ghi lịch sử theo phiên chỉnh sửa (không ghi từng ký tự).
 * Phần realtime gọi khi một người đã sửa mô tả rời khỏi tài liệu.
 */
export async function recordDescriptionSession(projectId: string, taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true } });
  if (!task) return;
  await recordActivity({
    projectId,
    actorId: userId,
    action: 'task.description_edited',
    entityType: 'task',
    entityId: taskId,
    meta: { title: task.title },
  });
}
