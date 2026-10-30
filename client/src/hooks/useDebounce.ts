import { useEffect, useState } from 'react';

/**
 * Trả về `value` sau khi nó ngừng thay đổi `delay` ms.
 * Dùng cho ô tìm kiếm: gõ liên tục chỉ gọi API một lần khi dừng gõ.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // Giá trị đổi trước khi hết giờ → hủy hẹn giờ cũ, đếm lại từ đầu
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
