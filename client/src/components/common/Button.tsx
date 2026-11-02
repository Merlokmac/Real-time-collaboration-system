import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Đang gửi: hiện vòng quay và khóa nút để không bấm 2 lần */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], fullWidth && styles.fullWidth, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...rest} type={type} className={classes} disabled={disabled || loading} aria-busy={loading}>
      {loading && <Spinner size="sm" />}
      <span>{children}</span>
    </button>
  );
}
