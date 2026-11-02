import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Chữ cho trình đọc màn hình */
  label?: string;
}

export function Spinner({ size = 'md', label = 'Đang tải' }: SpinnerProps) {
  return (
    <span className={`${styles.spinner} ${styles[size]}`} role="status">
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

/** Vòng quay giữa màn hình, dùng khi chưa biết đã đăng nhập hay chưa */
export function FullPageSpinner({ label = 'Đang tải' }: { label?: string }) {
  return (
    <div className={styles.fullPage}>
      <Spinner size="lg" label={label} />
    </div>
  );
}
