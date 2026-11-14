// API bình luận của một thẻ: /projects/:projectId/tasks/:taskId/comments.
import type { Comment, Paginated } from '../types';
import { api } from './client';

const base = (projectId: string, taskId: string) => `/projects/${projectId}/tasks/${taskId}/comments`;

export interface ListCommentsOptions {
  /** `nextCursor` của lần tải trước; bỏ trống để lấy trang mới nhất */
  cursor?: string | null;
  /** 1–100, server mặc định 30 */
  limit?: number;
  signal?: AbortSignal;
}

/** Mới nhất trước. `nextCursor = null` là đã hết. */
export function listComments(projectId: string, taskId: string, options: ListCommentsOptions = {}): Promise<Paginated<Comment>> {
  const { cursor, limit, signal } = options;
  return api.get<Paginated<Comment>>(base(projectId, taskId), { query: { cursor, limit }, signal });
}

/**
 * `clientId` do client tự sinh (crypto.randomUUID()). Gửi lại cùng `clientId` (ví dụ bấm lại sau khi mất mạng)
 * thì server trả bản đã lưu thay vì tạo bình luận thứ hai.
 */
export async function createComment(projectId: string, taskId: string, content: string, clientId: string): Promise<Comment> {
  const { comment } = await api.post<{ comment: Comment }>(base(projectId, taskId), { content, clientId });
  return comment;
}

/** Chỉ tác giả được sửa (người khác nhận 403). */
export async function updateComment(projectId: string, taskId: string, commentId: string, content: string): Promise<Comment> {
  const { comment } = await api.patch<{ comment: Comment }>(`${base(projectId, taskId)}/${commentId}`, { content });
  return comment;
}

/** Tác giả hoặc chủ dự án được xóa. */
export function deleteComment(projectId: string, taskId: string, commentId: string): Promise<void> {
  return api.delete(`${base(projectId, taskId)}/${commentId}`);
}
