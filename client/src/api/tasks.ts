// API công việc (thẻ): /projects/:projectId/tasks. Mô tả thẻ KHÔNG sửa ở đây mà qua Yjs (Người 3).
import type { ColumnTaskOrder, IsoDateString, Task } from '../types';
import { api } from './client';

export interface CreateTaskInput {
  columnId: string;
  /** 1–200 ký tự */
  title: string;
  /** Phải là thành viên dự án */
  assigneeId?: string | null;
  dueDate?: IsoDateString | null;
  labelIds?: string[];
}

export interface UpdateTaskInput {
  /** Version đang có ở client; server so với bản hiện tại để phát hiện xung đột */
  version: number;
  title?: string;
  assigneeId?: string | null;
  dueDate?: IsoDateString | null;
  /** Danh sách nhãn mới (thay toàn bộ) */
  labelIds?: string[];
}

export interface MoveTaskResult {
  task: Task;
  /** Thứ tự thẻ mới của cột nguồn và cột đích (cùng cột thì chỉ có một phần tử) */
  columns: ColumnTaskOrder[];
}

const base = (projectId: string) => `/projects/${projectId}/tasks`;

/** Thẻ mới nằm cuối cột. */
export async function createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  const { task } = await api.post<{ task: Task }>(base(projectId), input);
  return task;
}

export async function getTask(projectId: string, taskId: string, options?: { signal?: AbortSignal }): Promise<Task> {
  const { task } = await api.get<{ task: Task }>(`${base(projectId)}/${taskId}`, options);
  return task;
}

/**
 * Người khác đã sửa trước (version lệch) → 409 VERSION_CONFLICT, `error.details.current` là bản mới nhất.
 * Nơi gọi giữ bản nháp và cho người dùng chọn (Tuần 5).
 */
export async function updateTask(projectId: string, taskId: string, input: UpdateTaskInput): Promise<Task> {
  const { task } = await api.patch<{ task: Task }>(`${base(projectId)}/${taskId}`, input);
  return task;
}

/** Kéo thẻ sang cột `toColumnId`, vị trí `toIndex` (tính từ 0). */
export function moveTask(projectId: string, taskId: string, toColumnId: string, toIndex: number): Promise<MoveTaskResult> {
  return api.post<MoveTaskResult>(`${base(projectId)}/${taskId}/move`, { toColumnId, toIndex });
}

export function deleteTask(projectId: string, taskId: string): Promise<void> {
  return api.delete(`${base(projectId)}/${taskId}`);
}
