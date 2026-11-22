/*
 * Bộ lọc bảng <-> query string của URL. Toàn hàm thuần (không đọc window, không gọi API).
 *
 * URL là nguồn sự thật của bộ lọc: ?q=<chữ>&assignee=<id|none>&label=<id>&overdue=1
 * (nằm cạnh ?task=<id> của chi tiết thẻ). Tải lại trang, gửi đường dẫn, nút Back đều giữ đúng bộ lọc.
 */
import type { BoardFilter } from '../api/board';

/** Độ dài tối đa của ô tìm kiếm — khớp giới hạn của server (q > 200 ký tự bị 400). */
export const MAX_SEARCH_LENGTH = 200;

/** Đọc bộ lọc từ URL. Tham số rỗng / không hợp lệ thì coi như không có. */
export function parseFilter(params: URLSearchParams): BoardFilter {
  const q = params.get('q')?.trim() ?? '';
  const assignee = params.get('assignee')?.trim() ?? '';
  const label = params.get('label')?.trim() ?? '';
  const overdue = params.get('overdue');
  const filter: BoardFilter = {};
  if (q) filter.q = q;
  if (assignee) filter.assigneeId = assignee;
  if (label) filter.labelId = label;
  if (overdue === '1' || overdue === 'true') filter.overdue = true;
  return filter;
}

/**
 * Ghi bộ lọc vào `params` (sửa tại chỗ, các tham số khác như `task` được giữ nguyên).
 * Giá trị rỗng thì XÓA tham số, để "Xóa lọc" trả về URL sạch.
 */
export function writeFilter(params: URLSearchParams, filter: BoardFilter): void {
  const setOrDelete = (key: string, value: string | undefined) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  setOrDelete('q', filter.q?.trim());
  setOrDelete('assignee', filter.assigneeId);
  setOrDelete('label', filter.labelId);
  setOrDelete('overdue', filter.overdue ? '1' : undefined);
}

export function isFilterActive(filter: BoardFilter): boolean {
  return countActive(filter) > 0;
}

/** Số tiêu chí đang bật (hiện trên huy hiệu của nút "Lọc" ở điện thoại). */
export function countActive(filter: BoardFilter): number {
  return [filter.q?.trim(), filter.assigneeId, filter.labelId, filter.overdue].filter(Boolean).length;
}

/**
 * Chuỗi định danh của bộ lọc, dùng làm khóa request / deps của effect
 * (so sánh chuỗi ổn định hơn so sánh object vừa tạo lại ở mỗi lần render).
 */
export function filterKey(filter: BoardFilter): string {
  return JSON.stringify([filter.q?.trim() ?? '', filter.assigneeId ?? '', filter.labelId ?? '', !!filter.overdue]);
}
