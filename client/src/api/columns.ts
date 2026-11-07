// API cột: /projects/:projectId/columns. Mọi thành viên dự án đều được dùng.
import type { Column } from '../types';
import { api } from './client';

export interface CreateColumnInput {
  /** 1–50 ký tự */
  name: string;
  isDone?: boolean;
}

/** Phải có ít nhất một trường */
export type UpdateColumnInput = Partial<CreateColumnInput>;

const base = (projectId: string) => `/projects/${projectId}/columns`;

/** Cột mới luôn nằm cuối bảng. */
export async function createColumn(projectId: string, input: CreateColumnInput): Promise<Column> {
  const { column } = await api.post<{ column: Column }>(base(projectId), input);
  return column;
}

export async function updateColumn(projectId: string, columnId: string, input: UpdateColumnInput): Promise<Column> {
  const { column } = await api.patch<{ column: Column }>(`${base(projectId)}/${columnId}`, input);
  return column;
}

/** Trả về thứ tự mới của toàn bộ cột (lấy làm chuẩn thay cho thứ tự tạm ở client). */
export async function moveColumn(projectId: string, columnId: string, toIndex: number): Promise<string[]> {
  const { columnIds } = await api.post<{ columnIds: string[] }>(`${base(projectId)}/${columnId}/move`, { toIndex });
  return columnIds;
}

/**
 * Chỉ xóa được cột trống: còn thẻ thì 409 COLUMN_NOT_EMPTY.
 * Dự án chỉ còn một cột thì 400 BAD_REQUEST.
 */
export function deleteColumn(projectId: string, columnId: string): Promise<void> {
  return api.delete(`${base(projectId)}/${columnId}`);
}
