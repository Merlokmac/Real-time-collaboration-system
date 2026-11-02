// API dự án: /projects và /projects/:projectId. Mỗi hàm bỏ lớp { items } / { project } bọc ngoài.
import type { Project, ProjectSummary } from '../types';
import { api } from './client';

export interface CreateProjectInput {
  /** 1–100 ký tự */
  name: string;
  /** tối đa 1000 ký tự */
  description?: string;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

/**
 * PATCH /projects/:id trả về bản ghi dự án thô, KHÔNG có role và memberCount
 * (khác GET). Xem client/docs/backend-issues.md.
 */
export type UpdatedProject = Omit<Project, 'role' | 'memberCount'>;

/** Các dự án mình là thành viên, mới cập nhật trước. `q` lọc theo tên (không phân biệt hoa thường). */
export async function listProjects(options: { q?: string; signal?: AbortSignal } = {}): Promise<ProjectSummary[]> {
  const { items } = await api.get<{ items: ProjectSummary[] }>('/projects', {
    query: { q: options.q?.trim() },
    signal: options.signal,
  });
  return items;
}

/** Người tạo thành chủ dự án; server tạo sẵn 3 cột mặc định. */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const { project } = await api.post<{ project: Project }>('/projects', input);
  return project;
}

/** 404 NOT_FOUND nếu dự án không tồn tại hoặc mình không phải thành viên. */
export async function getProject(projectId: string, options?: { signal?: AbortSignal }): Promise<Project> {
  const { project } = await api.get<{ project: Project }>(`/projects/${projectId}`, options);
  return project;
}

/** Chỉ chủ dự án (403 FORBIDDEN với thành viên thường). */
export async function updateProject(projectId: string, input: UpdateProjectInput): Promise<UpdatedProject> {
  const { project } = await api.patch<{ project: UpdatedProject }>(`/projects/${projectId}`, input);
  return project;
}

/** Chỉ chủ dự án. `confirmName` phải trùng đúng tên dự án, nếu không server trả 400. */
export function removeProject(projectId: string, confirmName: string): Promise<void> {
  return api.delete(`/projects/${projectId}`, { confirmName });
}
