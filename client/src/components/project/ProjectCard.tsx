// Một thẻ trong danh sách Dự án của tôi. Cả thẻ là một link vào bảng của dự án.
import { Link } from 'react-router-dom';
import type { ProjectSummary } from '../../types';
import { formatDateTime, formatRelativeTime } from '../../utils/format';
import styles from './ProjectCard.module.css';

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const isOwner = project.role === 'OWNER';

  return (
    <Link to={`/projects/${project.id}`} className={styles.card}>
      <div className={styles.top}>
        <h2 className={styles.name}>{project.name}</h2>
        <span className={`${styles.role} ${isOwner ? styles.owner : ''}`}>
          {isOwner ? 'Chủ dự án' : 'Thành viên'}
        </span>
      </div>

      {project.description ? (
        <p className={styles.description}>{project.description}</p>
      ) : (
        <p className={`${styles.description} ${styles.empty}`}>Chưa có mô tả</p>
      )}

      <div className={styles.meta}>
        <span>{project.memberCount} thành viên</span>
        <span aria-hidden="true">·</span>
        <time dateTime={project.updatedAt} title={formatDateTime(project.updatedAt)}>
          Cập nhật {formatRelativeTime(project.updatedAt)}
        </time>
      </div>
    </Link>
  );
}
