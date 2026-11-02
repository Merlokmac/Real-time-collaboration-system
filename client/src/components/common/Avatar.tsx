/*
 * Ảnh đại diện. Không có ảnh (hoặc ảnh lỗi) thì hiện chữ cái đầu trên nền màu.
 * Màu nền chọn theo id người dùng nên cùng một người luôn cùng một màu.
 */
import { useState } from 'react';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  /** Dùng để chọn màu nền cố định; không có thì dùng tên */
  id?: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const COLOR_COUNT = 6; // khớp --avatar-1 … --avatar-6 trong variables.css

/** "Nguyễn Văn Huân" → "NH"; "Huân" → "H" */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function colorIndex(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(hash) % COLOR_COUNT) + 1;
}

export function Avatar({ name, id, src, size = 'md' }: AvatarProps) {
  // Nhớ đường dẫn bị lỗi (thay vì true/false) để khi đổi sang ảnh khác thì thử tải lại
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && src !== failedSrc;
  const className = `${styles.avatar} ${styles[size]}`;

  if (showImage) {
    return <img className={className} src={src!} alt={name} onError={() => setFailedSrc(src!)} />;
  }

  return (
    <span
      className={className}
      style={{ background: `var(--avatar-${colorIndex(id ?? name)})` }}
      role="img"
      aria-label={name}
    >
      {getInitials(name)}
    </span>
  );
}
