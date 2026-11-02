import { Link } from 'react-router-dom';
import styles from './placeholder.module.css';

export function NotFoundPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1>Không tìm thấy trang</h1>
        <p className={styles.muted}>Đường dẫn bạn mở không tồn tại hoặc đã bị đổi.</p>
        <Link to="/projects">← Về Dự án của tôi</Link>
      </div>
    </main>
  );
}
