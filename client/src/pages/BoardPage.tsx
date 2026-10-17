// Tạm thời (Tuần 1): chỉ hiện projectId lấy từ URL. Bảng Kanban làm ở Tuần 3.
import { Link, useParams } from 'react-router-dom';
import styles from './placeholder.module.css';

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1>Bảng dự án</h1>
        <p className={styles.muted}>
          Mã dự án: <span className={styles.code}>{projectId}</span>
        </p>
        <p className={styles.muted}>Bảng Kanban sẽ có ở Tuần 3.</p>
        <Link to="/projects">← Về Dự án của tôi</Link>
      </div>
    </main>
  );
}
