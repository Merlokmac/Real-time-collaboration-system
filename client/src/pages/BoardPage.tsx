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
 *   - URL có ?q=&assignee=&label=&overdue=1 → bộ lọc bảng (BoardFilters). URL là nguồn sự thật; mọi thay đổi URL
 *     (mở/đóng thẻ, đổi lọc, ghi ô tìm kiếm sau debounce) đi qua MỘT hàm `updateParams`, xem comment ở đó.
 *   - realtime (useBoardRealtime): thay đổi của người khác hiện ngay; bị xóa khỏi dự án → về Dự án của tôi
 *   - khung chat bên phải (ChatPanel của Người 3), mời thành viên (chỉ chủ dự án)
 *
 * Không dùng PageContainer: bảng phải chiếm hết chiều ngang và chiều cao còn lại để cuộn ngang.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, getErrorMessage } from '../api/client';
import { Board } from '../components/board/Board';
import { BoardFilters } from '../components/board/BoardFilters';
import { ChatPanel } from '../components/chat/ChatPanel';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { InviteMemberDialog } from '../components/invitations/InviteMemberDialog';
import { TaskDetail } from '../components/task/TaskDetail';
import { useBoard } from '../hooks/useBoard';
import { useBoardRealtime } from '../hooks/useBoardRealtime';
import { useDebounce } from '../hooks/useDebounce';
import type { Task } from '../types';
import { findTask } from '../utils/boardState';
import { parseFilter, writeFilter } from '../utils/boardFilter';
import styles from './BoardPage.module.css';

export function BoardPage() {
  // Route /projects/:projectId luôn có tham số này
  const { projectId = '' } = useParams<{ projectId: string }>();
  // URL là nguồn sự thật của bộ lọc (?q=&assignee=&label=&overdue=) và của thẻ đang mở (?task=)
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => parseFilter(searchParams), [searchParams]);
  const {
    project,
    board,
    error,
    loading,
    boardPartial,
    filterError,
    reload,
    retry,
    applyUpdate,
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
    moveTaskToEnd,
    moveColumn,
    savingTaskIds,
    savingColumnIds,
  } = useBoard(projectId, filter);
  const navigate = useNavigate();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  useBoardRealtime({
    projectId,
    ready: board !== null,
    partial: boardPartial,
    loading,
    applyUpdate,
    reload,
    // Bị chủ dự án xóa khỏi dự án trong lúc đang xem
    onAccessRevoked: () => navigate('/projects', { replace: true }),
  });

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

  /*
   * MỘT hàm duy nhất ghi URL, dùng cho openTask, closeTask, đổi bộ lọc và ghi ô tìm kiếm.
   * Luôn `replace: true` (Back không phải lùi qua từng lần gõ / mở thẻ) và luôn đọc `prev` mới nhất rồi chỉ sửa
   * tham số của mình, nên bộ lọc không ghi đè ?task= và ngược lại. Nếu mỗi nơi tự gọi setSearchParams với bản
   * sao URL lấy lúc render thì lần ghi sau (ví dụ debounce ô tìm kiếm chạy ngay sau khi mở thẻ) sẽ xóa mất lần trước.
   */
  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Thẻ đang mở lưu trên URL (?task=<id>) để tải lại trang hoặc gửi đường dẫn vẫn mở đúng thẻ.
  const openTaskId = searchParams.get('task');
  const openTask = useCallback((task: Task) => updateParams((p) => p.set('task', task.id)), [updateParams]);
  const closeTask = useCallback(() => updateParams((p) => p.delete('task')), [updateParams]);

  // ---------- Bộ lọc ----------
  // Ô tìm kiếm có chữ đang gõ (qInput) tách khỏi URL: URL chỉ cập nhật sau khi ngừng gõ 300ms.
  const urlQ = filter.q ?? '';
  const [qInput, setQInput] = useState(urlQ);
  const debouncedQ = useDebounce(qInput, 300);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);

  // URL đổi từ bên ngoài (Back, Xóa lọc, dán đường dẫn) → đặt lại ô tìm kiếm cho khớp.
  // Phân biệt với "chính mình vừa ghi": lúc đó `debouncedQ` (giá trị đã ghi) bằng `urlQ`. Nếu cứ đặt lại thì
  // người dùng gõ thêm chữ trong lúc URL đang cập nhật sẽ bị xóa mất chữ vừa gõ (qInput đi trước URL).
  // (Đổi state ngay trong lúc render là cách React khuyến nghị cho state dẫn xuất từ props/URL.)
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    if (urlQ !== debouncedQ.trim()) setQInput(urlQ);
  }

  // Sang dự án khác (BoardPage được dùng lại, không unmount): bỏ chữ đang gõ dở của dự án cũ. Đổi `qInput` làm
  // hẹn giờ debounce cũ bị hủy, nên chữ cũ không kịp ghi vào URL của dự án mới.
  const [prevProjectId, setPrevProjectId] = useState(projectId);
  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setQInput(urlQ);
  }

  // Ghi URL khi chữ đã ổn định 300ms. Chỉ ghi khi KHÁC q trên URL: tránh điều hướng thừa lúc mount và
  // vòng lặp URL -> qInput -> URL. Cố ý chỉ phụ thuộc `debouncedQ`: nếu URL đổi (Back) mà chữ debounce chưa đổi
  // thì không được ghi đè URL bằng chữ cũ.
  useEffect(() => {
    const next = debouncedQ.trim();
    if (next === urlQ) return;
    updateParams((p) => writeFilter(p, { ...parseFilter(p), q: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const handleFilterChange = useCallback(
    (patch: Pick<typeof filter, 'assigneeId' | 'labelId' | 'overdue'>) =>
      updateParams((p) => writeFilter(p, { ...parseFilter(p), ...patch })),
    [updateParams],
  );

  const handleClearFilter = useCallback(() => {
    setQInput('');
    updateParams((p) => writeFilter(p, {}));
  }, [updateParams]);

  // Thông báo ngắn trên thanh lọc (tạo thẻ khi đang lọc), tự ẩn sau 6 giây
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleCreateTask = useCallback(
    async (columnId: string, title: string) => {
      const task = await createTask(columnId, title);
      if (boardPartial) setNotice('Đã tạo thẻ. Thẻ có thể đang bị bộ lọc ẩn.');
      return task;
    },
    [createTask, boardPartial],
  );

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
          <Button variant="secondary" onClick={retry}>
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
        <div className={styles.actions}>
          {isOwner && (
            <Button variant="secondary" onClick={() => setInviting(true)}>
              Mời thành viên
            </Button>
          )}
          <Button variant={chatOpen ? 'primary' : 'secondary'} onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen}>
            Trò chuyện
          </Button>
        </div>
      </div>

      <BoardFilters
        projectId={projectId}
        filter={filter}
        searchText={qInput}
        onSearchTextChange={setQInput}
        onChange={handleFilterChange}
        onClear={handleClearFilter}
        labels={board.labels}
        cardCount={board.columns.reduce((sum, c) => sum + c.tasks.length, 0)}
        loading={loading}
        error={filterError}
        onRetry={reload}
        notice={notice}
      />

      <div className={styles.body}>
        <div className={styles.boardArea}>
          <Board
            board={board}
            savingTaskIds={savingTaskIds}
            savingColumnIds={savingColumnIds}
            taskDragDisabled={boardPartial}
            onMoveTask={handleMoveTask}
            onMoveColumn={handleMoveColumn}
            onCreateColumn={createColumn}
            onRename={renameColumn}
            onSetDone={setColumnDone}
            onDelete={deleteColumn}
            onCreateTask={handleCreateTask}
            onOpenTask={openTask}
          />
        </div>

        {/* Luôn mount (chỉ ẩn đi) để không lỡ tin nhắn và danh sách online khi khung đang đóng */}
        <aside className={styles.chat} hidden={!chatOpen} aria-label="Trò chuyện dự án">
          <button type="button" className={styles.chatClose} onClick={() => setChatOpen(false)} aria-label="Đóng khung trò chuyện">
            ×
          </button>
          {/* key theo dự án: đổi dự án là dựng lại khung chat, không còn tin nhắn / người online của dự án cũ */}
          <ChatPanel key={projectId} projectId={projectId} />
        </aside>
      </div>

      {inviting && <InviteMemberDialog projectId={projectId} onClose={() => setInviting(false)} />}

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
          onMove={moveTaskToEnd}
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
