// API bảng: GET /projects/:projectId/board (cột + thẻ + nhãn trong một lần gọi).
import type { Board } from '../types';
import { api } from './client';

export interface BoardFilter {
  /** Tìm theo tiêu đề thẻ */
  q?: string;
  /** id người phụ trách, hoặc 'none' = chưa giao cho ai */
  assigneeId?: string;
  labelId?: string;
  /** Chỉ thẻ quá hạn (chưa ở cột hoàn thành) */
  overdue?: boolean;
}

/**
 * Cột theo thứ tự, mỗi cột có `tasks` đã sắp theo vị trí.
 * Có bộ lọc thì cột vẫn đủ nhưng thẻ chỉ còn thẻ khớp, và `filtered = true`.
 * 404 NOT_FOUND nếu dự án không tồn tại hoặc mình không phải thành viên.
 */
export function getBoard(projectId: string, filter: BoardFilter = {}, options?: { signal?: AbortSignal }): Promise<Board> {
  return api.get<Board>(`/projects/${projectId}/board`, {
    query: {
      q: filter.q?.trim(),
      assigneeId: filter.assigneeId,
      labelId: filter.labelId,
      overdue: filter.overdue,
    },
    signal: options?.signal,
  });
}
