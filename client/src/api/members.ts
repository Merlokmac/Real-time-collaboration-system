// API thành viên dự án: /projects/:projectId/members. Tuần 5 chỉ cần danh sách để chọn người phụ trách thẻ.
// Mời, xóa thành viên, chuyển quyền là phần giao diện của Người 3.
import type { ProjectMember } from '../types';
import { api } from './client';

/** Chủ dự án đứng đầu, sau đó theo thứ tự tham gia. */
export async function listMembers(projectId: string, options?: { signal?: AbortSignal }): Promise<ProjectMember[]> {
  const { items } = await api.get<{ items: ProjectMember[] }>(`/projects/${projectId}/members`, options);
  return items;
}
