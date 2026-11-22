/**
 * Bảng màu định sẵn cho nhãn. Mỗi màu đã được kiểm tra tương phản với màu chữ do `textColorOn` chọn (đen hoặc trắng):
 * tỉ lệ ≥ 5:1 (ngưỡng WCAG AA cho chữ nhỏ là 4.5:1). Đã loại các màu "tươi" như #22c55e, #f97316, #06b6d4 vì
 * chữ trắng trên chúng chỉ đạt khoảng 2.3–2.8:1. Màu tự chọn bằng <input type="color"> thì người dùng tự chịu.
 */
export const LABEL_PALETTE: { name: string; color: string }[] = [
  { name: 'Đỏ', color: '#b91c1c' },
  { name: 'Cam', color: '#c2410c' },
  { name: 'Vàng', color: '#eab308' },
  { name: 'Lục', color: '#15803d' },
  { name: 'Xanh ngọc', color: '#0f766e' },
  { name: 'Lam', color: '#0369a1' },
  { name: 'Xanh dương', color: '#1d4ed8' },
  { name: 'Chàm', color: '#4f46e5' },
  { name: 'Tím', color: '#7c3aed' },
  { name: 'Hồng', color: '#be185d' },
  { name: 'Xám', color: '#475569' },
  { name: 'Nâu', color: '#92400e' },
];

export const DEFAULT_LABEL_COLOR = LABEL_PALETTE[0].color;
