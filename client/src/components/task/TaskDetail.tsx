/*
 * Chi tiết một thẻ, mở dạng hộp thoại (toàn màn hình trên điện thoại).
 *
 * Dữ liệu:
 *   - Hiện ngay bản thẻ đang có trên bảng (`initialTask`) để không phải chờ.
 *   - Đồng thời gọi GET /tasks/:taskId lấy bản mới nhất (version, mô tả có thể đã đổi từ lúc tải bảng).
 *     Đổi thẻ hoặc đóng hộp thoại giữa chừng thì hủy request (AbortController).
 *   - 404: thẻ đã bị xóa (hoặc mình không còn trong dự án) → báo và chỉ cho đóng.
 *
 * Sửa thẻ, xung đột version, chuyển cột, xóa thẻ và bình luận được thêm ở các bước sau.
 */
import { useEffect, useState } from 'react';
import { ApiError, getErrorMessage } from '../../api/client';
import { getTask } from '../../api/tasks';
import type { Column, Task } from '../../types';
import { textColorOn } from '../../utils/color';
import { formatDate, formatDateTime } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { TaskDescriptionEditor } from './TaskDescriptionEditor';
import styles from './TaskDetail.module.css';

interface TaskDetailProps {
  projectId: string;
  taskId: string;
  /** Bản thẻ đang có trên bảng, hiển thị trong lúc tải bản mới nhất */
  initialTask?: Task;
  /** Các cột của bảng, để hiện tên cột chứa thẻ */
  columns: Column[];
  onClose: () => void;
}

type Loaded =
  | { key: string; task: Task; error?: undefined }
  | { key: string; task?: undefined; error: unknown };

export function TaskDetail({ projectId, taskId, initialTask, columns, onClose }: TaskDetailProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const requestKey = `${taskId}#${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    getTask(projectId, taskId, { signal: controller.signal })
      .then((task) => setData({ key: requestKey, task }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setData({ key: requestKey, error: err });
      });
    return () => controller.abort();
  }, [projectId, taskId, requestKey]);

  // Cùng cách với useBoard: "đang tải" suy ra từ việc dữ liệu thuộc request nào
  const loading = data?.key !== requestKey;
  const current = data && data.key.startsWith(`${taskId}#`) ? data : null;
  const task = current?.task ?? (initialTask?.id === taskId ? initialTask : undefined);
  const error = loading ? null : (current?.error ?? null);
  const retry = () => setReloadKey((k) => k + 1);

  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return (
      <Modal title="Không tìm thấy công việc" onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
        <p>Công việc không còn tồn tại hoặc bạn không còn quyền xem.</p>
      </Modal>
    );
  }

  if (!task) {
    return (
      <Modal title="Chi tiết công việc" onClose={onClose} size="lg">
        {error ? (
          <div className={styles.status}>
            <ErrorMessage>Không tải được công việc. {getErrorMessage(error)}</ErrorMessage>
            <Button variant="secondary" onClick={retry}>
              Thử lại
            </Button>
          </div>
        ) : (
          <div className={styles.center}>
            <Spinner size="lg" label="Đang tải công việc" />
          </div>
        )}
      </Modal>
    );
  }

  const column = columns.find((c) => c.id === task.columnId);

  return (
    <Modal title={task.title} onClose={onClose} size="lg">
      <div className={styles.content}>
        {loading && (
          <p className={styles.syncing} role="status">
            <Spinner size="sm" /> Đang tải bản mới nhất…
          </p>
        )}
        {error !== null && (
          <div className={styles.status}>
            <ErrorMessage>Không tải được bản mới nhất. {getErrorMessage(error)}</ErrorMessage>
            <Button variant="secondary" onClick={retry}>
              Thử lại
            </Button>
          </div>
        )}

        <dl className={styles.fields}>
          <dt>Cột</dt>
          <dd>
            {column ? column.name : '—'}
            {column?.isDone && <span className={styles.doneBadge}>✓ Hoàn thành</span>}
          </dd>

          <dt>Người phụ trách</dt>
          <dd>
            {task.assignee ? (
              <span className={styles.person}>
                <Avatar name={task.assignee.name} id={task.assignee.id} src={task.assignee.avatarUrl} size="sm" />
                {task.assignee.name}
              </span>
            ) : (
              <span className={styles.muted}>Chưa giao</span>
            )}
          </dd>

          <dt>Hạn hoàn thành</dt>
          <dd>
            {task.dueDate ? (
              <>
                <time dateTime={task.dueDate}>{formatDate(task.dueDate)}</time>
                {task.isOverdue && <span className={styles.overdueBadge}>Quá hạn</span>}
              </>
            ) : (
              <span className={styles.muted}>Không có hạn</span>
            )}
          </dd>

          <dt>Nhãn</dt>
          <dd>
            {task.labels.length > 0 ? (
              <ul className={styles.labels}>
                {task.labels.map((label) => (
                  <li key={label.id} className={styles.label} style={{ background: label.color, color: textColorOn(label.color) }}>
                    {label.name}
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.muted}>Không có nhãn</span>
            )}
          </dd>
        </dl>

        <section className={styles.section} aria-labelledby="task-description-heading">
          <h3 id="task-description-heading" className={styles.sectionTitle}>
            Mô tả
          </h3>
          <TaskDescriptionEditor taskId={task.id} descriptionText={task.descriptionText} />
        </section>

        <p className={styles.meta}>
          Tạo lúc {formatDateTime(task.createdAt)} · Cập nhật lúc {formatDateTime(task.updatedAt)}
        </p>
      </div>
    </Modal>
  );
}
