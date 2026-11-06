// Định dạng thời gian để hiển thị (tiếng Việt).

const relative = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "14:05 20/10/2026" — dùng cho tooltip khi cần giờ chính xác */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/**
 * Thời gian tương đối: "vừa xong", "5 phút trước", "hôm qua"...
 * Quá 7 ngày thì hiện ngày cụ thể vì "23 ngày trước" khó hình dung hơn.
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now; // âm = trong quá khứ
  const abs = Math.abs(diff);
  if (abs < MINUTE) return 'vừa xong';
  // Intl trả "Hôm qua", "Hôm kia" viết hoa; viết thường để ghép sau chữ khác ("Cập nhật hôm qua")
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), 'minute').toLocaleLowerCase('vi');
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour').toLocaleLowerCase('vi');
  if (abs < 7 * DAY) return relative.format(Math.round(diff / DAY), 'day').toLocaleLowerCase('vi');
  return dateOnly.format(new Date(iso));
}
