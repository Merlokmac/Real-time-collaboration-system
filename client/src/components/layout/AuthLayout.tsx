import type { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  /** Dòng dưới cùng, ví dụ link chuyển sang đăng ký/đăng nhập */
  footer?: ReactNode;
  children: ReactNode;
}

/** Khung chung cho trang đăng nhập/đăng ký: thẻ ở giữa màn hình, trên điện thoại thì tràn ngang. */
export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.wrapper}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={styles.brandName}>Kanban cộng tác</span>
        </div>

        <section className={styles.card}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </header>
          {children}
        </section>

        {footer && <p className={styles.footer}>{footer}</p>}
      </div>
    </main>
  );
}
