import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { socket } from '../realtime/socket';
import styles from './placeholder.module.css';

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();

  useEffect(() => {
    if (!projectId) return;

    socket.emit('project:join', projectId);

    console.log('Join project room:', projectId);

    return () => {
      socket.emit('project:leave', projectId);
    };
  }, [projectId]);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1>Bảng dự án</h1>

        <p className={styles.muted}>
          Mã dự án: <span className={styles.code}>{projectId}</span>
        </p>

        <p className={styles.muted}>
          Socket: {socket.connected ? 'Đã kết nối' : 'Chưa kết nối'}
        </p>

        <Link to="/projects">← Về Dự án của tôi</Link>
      </div>
    </main>
  );
}