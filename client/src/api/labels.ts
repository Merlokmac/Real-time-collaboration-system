// API nhãn: /projects/:projectId/labels. Mọi thành viên dự án (không chỉ chủ dự án) đều được dùng.
import type { Label } from '../types';
import { api, type RequestOptions } from './client';

export interface CreateLabelInput {
  /** 1–30 ký tự sau khi trim. Trùng tên (phân biệt hoa/thường) trong cùng dự án → 409 DUPLICATE */
  name: string;
  /** Đúng dạng "#RRGGBB" */
  color: string;
}

/** Phải có ít nhất một trường (nếu không server trả 400 VALIDATION_ERROR) */
export type UpdateLabelInput = Partial<CreateLabelInput>;

const base = (projectId: string) => `/projects/${projectId}/labels`;

export async function listLabels(projectId: string, options?: RequestOptions): Promise<Label[]> {
  const { items } = await api.get<{ items: Label[] }>(base(projectId), options);
  return items;
}

export async function createLabel(projectId: string, input: CreateLabelInput): Promise<Label> {
  const { label } = await api.post<{ label: Label }>(base(projectId), input);
  return label;
}

export async function updateLabel(projectId: string, labelId: string, input: UpdateLabelInput): Promise<Label> {
  const { label } = await api.patch<{ label: Label }>(`${base(projectId)}/${labelId}`, input);
  return label;
}

/** Xóa nhãn: server gỡ nhãn khỏi mọi thẻ đang dùng (và phát task:updated cho các thẻ đó). */
export function deleteLabel(projectId: string, labelId: string): Promise<void> {
  return api.delete(`${base(projectId)}/${labelId}`);
}
