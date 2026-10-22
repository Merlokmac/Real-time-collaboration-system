import { prisma } from '../lib/prisma';
import { taskIdOf } from './docName';

export type DocAccess = { taskId: string; projectId: string };

/**
 * Kiểm tra user có được mở tài liệu Yjs này không.
 * Gọi khi client kết nối WebSocket tới /yjs/<docName>, trả null thì đóng kết nối.
 */
export async function authorizeDocument(userId: string, docName: string): Promise<DocAccess | null> {
  const taskId = taskIdOf(docName);
  if (!taskId) return null;

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { members: { some: { userId } } } },
    select: { id: true, projectId: true },
  });
  return task ? { taskId: task.id, projectId: task.projectId } : null;
}
