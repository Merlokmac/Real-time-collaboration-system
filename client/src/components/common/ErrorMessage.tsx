import type { ReactNode } from 'react';
import styles from './ErrorMessage.module.css';

/** Khung báo lỗi chung (không gắn với ô nhập nào), ví dụ sai mật khẩu, mất mạng. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.box} role="alert">
      {children}
    </div>
  );
}
