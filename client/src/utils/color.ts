/**
 * Chọn màu chữ (đen hoặc trắng) đọc rõ trên nền `hex` ("#RRGGBB").
 * Dùng độ sáng cảm nhận (công thức YIQ): nền sáng → chữ tối, nền tối → chữ trắng.
 * Màu nhãn do người dùng chọn nên không biết trước là sáng hay tối.
 */
export function textColorOn(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 'var(--color-text)';
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#111827' : '#ffffff';
}
