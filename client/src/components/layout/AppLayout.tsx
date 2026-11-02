/*
 * Khung chung cho mọi trang sau khi đăng nhập: Header ở trên, nội dung trang render vào <Outlet />.
 * Dùng làm "layout route" trong App.tsx nên Header không bị mount lại khi chuyển trang.
 */
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

/** Khung nội dung có lề và giới hạn chiều rộng, dùng cho các trang thường (không dùng cho bảng Kanban). */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className={styles.container}>{children}</div>;
}
