/*
 * Trang bảng Kanban của một dự án (/projects/:projectId).
 *
 * Dữ liệu và thao tác nằm trong useBoard; trang này chỉ lo hiển thị các trạng thái:
 *   - lần đầu đang tải → vòng quay
 *   - 404 → "Dự án không tồn tại hoặc bạn không có quyền" (server trả 404 cả khi mình không phải thành viên,
 *     để người ngoài không dò được dự án nào tồn tại)
 *   - lỗi khác (mất mạng, lỗi server) → thông báo + nút Thử lại
 *   - có dữ liệu → tiêu đề dự án + bảng
 *   - kéo thả thất bại → thẻ/cột đã được useBoard đưa về chỗ cũ; trang hiện thông báo lỗi nổi ở dưới
 *   - URL có ?task=<id> → mở chi tiết thẻ đó (TaskDetail)
 *
 * Không dùng PageContainer: bảng phải chiếm hết chiều ngang và chiều cao còn lại để cuộn ngang.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, getErrorMessage } from '../api/client';
import { Board } from '../components/board/Board';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { TaskDetail } from '../components/task/TaskDetail';
import { useBoard } from '../hooks/useBoard';
import type { Task } from '../types';
import { findTask } from '../utils/boardState';
import styles from './BoardPage.module.css';

export function BoardPage() {
  // Route /projects/:projectId luôn có tham số này
  const { projectId = '' } = useParams<{ projectId: string }>();
  const {
    project,
    board,
    error,
    loading,
    reload,
    createColumn,
    renameColumn,
    setColumnDone,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    refreshTask,
    forgetTask,
    moveTask,
    moveColumn,
    savingTaskIds,
    savingColumnIds,
  } = useBoard(projectId);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Thông báo lỗi kéo thả tự ẩn sau 6 giây (vẫn có nút đóng)
  useEffect(() => {
    if (!moveError) return;
    const timer = window.setTimeout(() => setMoveError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [moveError]);

  const handleMoveError = useCallback(
    (what: string, err: unknown) => {
      setMoveError(`Không ${what} được, đã đưa về chỗ cũ. ${getErrorMessage(err)}`);
      // 404: thẻ/cột đã bị người khác xóa → tải lại bảng để thấy đúng hiện trạng
      if (err instanceof ApiError && err.code === 'NOT_FOUND') reload();
    },
    [reload],
  );

  const handleMoveTask = useCallback(
    (taskId: string, toColumnId: string, toIndex: number) => {
      setMoveError(null);
      moveTask(taskId, toColumnId, toIndex).catch((err: unknown) => handleMoveError('chuyển thẻ', err));
    },
    [moveTask, handleMoveError],
  );

  const handleMoveColumn = useCallback(
    (columnId: string, toIndex: number) => {
      setMoveError(null);
      moveColumn(columnId, toIndex).catch((err: unknown) => handleMoveError('đổi vị trí cột', err));
    },
    [moveColumn, handleMoveError],
  );

  // Thẻ đang mở lưu trên URL (?task=<id>) để tải lại trang hoặc gửi đường dẫn vẫn mở đúng thẻ.
  // Dùng replace để nút Back của trình duyệt không phải lùi qua từng lần mở/đóng thẻ.
  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskId = searchParams.get('task');

  const openTask = useCallback(
    (task: Task) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('task', task.id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const closeTask = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return (
      <div className={styles.message}>
        <h1 className={styles.messageTitle}>Dự án không tồn tại hoặc bạn không có quyền</h1>
        <p className={styles.muted}>Có thể dự án đã bị xóa, hoặc bạn không còn là thành viên.</p>
        <Link to="/projects" className={styles.backButton}>
          ← Về Dự án của tôi
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.message}>
        <ErrorMessage>Không tải được bảng. {getErrorMessage(error)}</ErrorMessage>
        <div className={styles.messageActions}>
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
          <Link to="/projects">← Về Dự án của tôi</Link>
        </div>
      </div>
    );
  }

  if (!project || !board) {
    return (
      <div className={styles.center}>
        <Spinner size="lg" label="Đang tải bảng" />
      </div>
    );
  }

  const isOwner = project.role === 'OWNER';

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/projects" className={styles.back} aria-label="Về Dự án của tôi" title="Về Dự án của tôi">
          ←
        </Link>
        <h1 className={styles.title}>{project.name}</h1>
        <span className={`${styles.role} ${isOwner ? styles.owner : ''}`}>{isOwner ? 'Chủ dự án' : 'Thành viên'}</span>
        {loading && <Spinner size="sm" label="Đang tải lại" />}
      </div>

      <Board
        board={board}
        savingTaskIds={savingTaskIds}
        savingColumnIds={savingColumnIds}
        onMoveTask={handleMoveTask}
        onMoveColumn={handleMoveColumn}
        onCreateColumn={createColumn}
        onRename={renameColumn}
        onSetDone={setColumnDone}
        onDelete={deleteColumn}
        onCreateTask={createTask}
        onOpenTask={openTask}
      />

      {openTaskId && (
        <TaskDetail
          // key: đổi sang thẻ khác thì dựng lại từ đầu (bỏ bản nháp, trạng thái tải của thẻ cũ)
          key={openTaskId}
          projectId={projectId}
          taskId={openTaskId}
          task={findTask(board, openTaskId)}
          columns={board.columns}
          labels={board.labels}
          onRefresh={refreshTask}
          onGone={forgetTask}
          onSave={updateTask}
          onMove={moveTask}
          onDelete={deleteTask}
          onClose={closeTask}
        />
      )}

      {moveError && (
        <div className={styles.toast} role="alert">
          <span>{moveError}</span>
          <button type="button" className={styles.toastClose} onClick={() => setMoveError(null)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
