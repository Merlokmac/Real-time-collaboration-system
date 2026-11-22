/*
 * Chi tiết một thẻ, mở dạng hộp thoại (toàn màn hình trên điện thoại).
 *
 * Nguồn dữ liệu:
 *   - Thẻ trên bảng (`task`, do useBoard giữ) là bản chính về VỊ TRÍ (cột), để chuyển cột, kéo thả, sau này là
 *     realtime hiện ngay ở đây.
 *   - `latest`: bản mới nhất đọc riêng (GET /tasks/:taskId khi mở, kết quả lưu, bản trong lỗi 409). Cũng được áp lên
 *     bảng (`onRefresh`). Hiển thị bản có version lớn hơn giữa hai nguồn, nên thẻ không có trên bảng vẫn sửa được.
 *   - GET trả 404 → thẻ đã bị xóa: báo, và bỏ thẻ khỏi bảng (`onGone`). Lỗi khác → báo kèm nút Thử lại.
 *
 * Sửa thẻ (xem useTaskDraft):
 *   - Sửa trường nào thì bản nháp ghi lại `base` (bản lúc bắt đầu sửa). Lưu = PATCH với `base.version`
 *     và chỉ các trường đã đổi.
 *   - 409 VERSION_CONFLICT: giữ bản nháp, áp bản mới nhất (`error.details.current`), hiện bảng so sánh.
 *     Người dùng chọn "Dùng bản mới" hoặc "Gửi lại bản của tôi" (gửi lại với version mới). Không ghi đè âm thầm.
 *   - Đóng khi còn thay đổi chưa lưu → hỏi lại.
 *
 * Chuyển cột: chọn cột rồi bấm "Chuyển" (không gọi API ngay khi đổi ô chọn, vì phím ↑/↓ có thể đổi giá trị ngoài ý
 * muốn). Thẻ xuống cuối cột đích, dùng cùng moveTask với kéo thả (cần cho điện thoại và bàn phím).
 * Chuyển cột không đổi version nên không ảnh hưởng bản nháp.
 *
 * Chỉ render MỘT <Modal> ở cùng vị trí cho mọi trạng thái (đang tải, lỗi, không tìm thấy, đã tải), để hộp thoại
 * không bị dựng lại khi tải xong (giữ focus và chỗ trả focus khi đóng).
 */
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, getErrorMessage, getFieldErrors } from '../../api/client';
import { listMembers } from '../../api/members';
import { getTask, type UpdateTaskInput } from '../../api/tasks';
import { changesBetween, useTaskDraft, type TaskChanges, type TaskDraft } from '../../hooks/useTaskDraft';
import type { BoardColumn, Label, ProjectMember, Task } from '../../types';
import { formatDateTime } from '../../utils/format';
import { validateTaskTitle } from '../../utils/validation';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ErrorMessage } from '../common/ErrorMessage';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { TaskDescriptionEditor } from './TaskDescriptionEditor';
import { TaskFields } from './TaskFields';
import { VersionConflict } from './VersionConflict';
import styles from './TaskDetail.module.css';

interface TaskDetailProps {
  projectId: string;
  taskId: string;
  /** Thẻ trên bảng; undefined nếu bảng không có thẻ này */
  task?: Task;
  columns: BoardColumn[];
  /** Nhãn của dự án */
  labels: Label[];
  /** Áp bản thẻ đọc riêng lên bảng (GET /tasks/:id, bản mới nhất trong lỗi 409) */
  onRefresh: (task: Task) => void;
  /** Thẻ không còn trên server (404): bỏ khỏi bảng */
  onGone: (taskId: string) => void;
  onSave: (taskId: string, input: UpdateTaskInput) => Promise<Task>;
  /**
   * Chuyển thẻ xuống cuối cột `toColumnId`. Có thể trả về bản thẻ mới của server (khi thẻ không có trên bảng
   * vì đang bị lọc ẩn) để hộp thoại biết cột mới.
   */
  onMove: (taskId: string, toColumnId: string) => Promise<Task | undefined>;
  onDelete: (taskId: string) => Promise<void>;
  onClose: () => void;
}

type LoadState = { key: string; error: unknown | null };
type MembersState = { key: string; items: ProjectMember[] | null };

/**
 * Bản để hiển thị: nội dung lấy từ bản có version lớn hơn, vị trí (cột) luôn lấy từ bảng nếu bảng có thẻ.
 * Kéo/chuyển cột không tăng version nên bản đọc riêng có thể mang cột cũ.
 */
function pickShown(onBoard: Task | undefined, latest: Task | undefined): Task | undefined {
  if (!onBoard || !latest) return onBoard ?? latest;
  if (latest.version <= onBoard.version) return onBoard;
  return { ...latest, columnId: onBoard.columnId, position: onBoard.position, isOverdue: onBoard.isOverdue };
}

export function TaskDetail({
  projectId,
  taskId,
  task: boardTask,
  columns,
  labels,
  onRefresh,
  onGone,
  onSave,
  onMove,
  onDelete,
  onClose,
}: TaskDetailProps) {
  const formId = useId();

  // ---------- Bản mới nhất ----------
  // TaskDetail được key theo taskId ở trang bảng, nên state này luôn thuộc đúng một thẻ
  const [latest, setLatest] = useState<Task | undefined>();
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<LoadState | null>(null);
  const requestKey = String(reloadKey);

  useEffect(() => {
    const controller = new AbortController();
    getTask(projectId, taskId, { signal: controller.signal })
      .then((task) => {
        setLatest((prev) => (prev && prev.version > task.version ? prev : task));
        setLoad({ key: requestKey, error: null });
        onRefresh(task);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ key: requestKey, error: err });
        if (err instanceof ApiError && err.code === 'NOT_FOUND') onGone(taskId);
      });
    return () => controller.abort();
  }, [projectId, taskId, requestKey, onRefresh, onGone]);

  const loading = load?.key !== requestKey;
  const loadError = loading ? null : (load?.error ?? null);
  const notFound = loadError instanceof ApiError && loadError.code === 'NOT_FOUND';
  const task = notFound ? undefined : pickShown(boardTask, latest);

  /** Ghi nhận một bản mới hơn (kết quả lưu, bản trong lỗi 409) cho cả hộp thoại lẫn bảng. */
  function acceptLatest(next: Task) {
    setLatest((prev) => (prev && prev.version > next.version ? prev : next));
    onRefresh(next);
  }

  // ---------- Thành viên (để chọn người phụ trách) ----------
  const [membersState, setMembersState] = useState<MembersState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listMembers(projectId, { signal: controller.signal })
      .then((items) => setMembersState({ key: projectId, items }))
      .catch(() => {
        // Không tải được thì ô chọn chỉ còn "Chưa giao" và người đang được giao; vẫn sửa được các trường khác
        if (!controller.signal.aborted) setMembersState({ key: projectId, items: [] });
      });
    return () => controller.abort();
  }, [projectId]);
  const members = membersState?.key === projectId ? membersState.items : null;

  // ---------- Sửa thẻ ----------
  const draft = useTaskDraft(task);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>();
  // Bản mới nhất trên server khi lưu bị 409; null = không có xung đột
  const [conflict, setConflict] = useState<Task | null>(null);

  async function save(version: number, changes: TaskChanges) {
    if (!task) return;
    if (Object.keys(changes).length === 0) {
      draft.reset();
      setConflict(null);
      return;
    }
    const error = changes.title !== undefined ? validateTaskTitle(changes.title) : undefined;
    setTitleError(error);
    if (error) return;

    setSaving(true);
    setFormError(null);
    try {
      acceptLatest(await onSave(task.id, { version, ...changes }));
      draft.reset();
      setConflict(null);
    } catch (err) {
      const current = err instanceof ApiError && err.code === 'VERSION_CONFLICT' ? conflictTask(err) : null;
      if (current) {
        setConflict(current);
        acceptLatest(current);
      } else {
        setTitleError(getFieldErrors(err).title);
        setFormError(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.base) void save(draft.base.version, draft.changes);
  }

  function discardChanges() {
    draft.reset();
    setConflict(null);
    setFormError(null);
    setTitleError(undefined);
  }

  // Khi xung đột: các trường MÌNH đã sửa mà vẫn còn khác bản mới nhất. Dùng cho cả bảng so sánh lẫn "Gửi lại".
  // Không so cả bản nháp với bản mới nhất: các trường mình không đụng tới vẫn mang giá trị cũ, gửi lên sẽ ghi đè
  // mất thay đổi của người khác.
  const pending = conflict && draft.values ? pendingChanges(draft.values, draft.changes, conflict) : {};

  function resubmit() {
    if (conflict) void save(conflict.version, pending);
  }

  // ---------- Chuyển cột, xóa, đóng ----------
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'delete' | 'close' | null>(null);
  const selectedColumnId = targetColumnId ?? task?.columnId ?? '';

  async function handleMove() {
    if (!task || selectedColumnId === task.columnId) return;
    const target = columns.find((c) => c.id === selectedColumnId);
    if (!target) return;
    setMoving(true);
    setMoveError(null);
    try {
      // Xuống cuối cột đích. Cách tính vị trí do useBoard.moveTaskToEnd lo (khi đang lọc nó nhờ server kẹp về cuối cột)
      const moved = await onMove(task.id, target.id);
      // Thẻ không có trên bảng (đang bị lọc ẩn): bảng không báo cột mới cho ta, nên lấy từ kết quả server;
      // nếu không ô chọn sẽ nhảy về cột cũ vì `latest` còn mang cột cũ.
      if (moved) acceptLatest(moved);
      setTargetColumnId(null);
    } catch (err) {
      setMoveError(`Không chuyển được cột. ${getErrorMessage(err)}`);
    } finally {
      setMoving(false);
    }
  }

  function requestClose() {
    if (saving) return;
    if (draft.dirty) setConfirming('close');
    else onClose();
  }

  // ---------- Nội dung hộp thoại theo trạng thái ----------

  let title: string;
  let body: ReactNode;
  let footer: ReactNode;

  if (notFound) {
    title = 'Không tìm thấy công việc';
    body = <p>Công việc không còn tồn tại hoặc bạn không còn quyền xem.</p>;
    footer = <Button onClick={onClose}>Đóng</Button>;
  } else if (!task || !draft.values) {
    title = 'Chi tiết công việc';
    body = loadError ? (
      <div className={styles.status}>
        <ErrorMessage>Không tải được công việc. {getErrorMessage(loadError)}</ErrorMessage>
        <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Thử lại
        </Button>
      </div>
    ) : (
      <div className={styles.center}>
        <Spinner size="lg" label="Đang tải công việc" />
      </div>
    );
  } else {
    title = task.title;
    const changedElsewhere = draft.base && draft.base.version !== task.version && !conflict;

    footer = (
      <div className={styles.footer}>
        <Button variant="ghost" className={styles.delete} onClick={() => setConfirming('delete')} disabled={saving}>
          Xóa công việc
        </Button>
        {draft.dirty && !conflict ? (
          <>
            <Button variant="secondary" onClick={discardChanges} disabled={saving}>
              Hủy thay đổi
            </Button>
            <Button type="submit" form={formId} loading={saving}>
              Lưu
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={requestClose}>
            Đóng
          </Button>
        )}
      </div>
    );

    body = (
      <div className={styles.content}>
        {loading && (
          <p className={styles.syncing} role="status">
            <Spinner size="sm" /> Đang tải bản mới nhất…
          </p>
        )}
        {loadError !== null && (
          <div className={styles.status}>
            <ErrorMessage>Không tải được bản mới nhất. {getErrorMessage(loadError)}</ErrorMessage>
            <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Thử lại
            </Button>
          </div>
        )}

        <div className={styles.columnRow}>
          <label htmlFor={`${formId}-column`} className={styles.columnLabel}>
            Cột
          </label>
          <select
            id={`${formId}-column`}
            className={styles.select}
            value={selectedColumnId}
            disabled={moving}
            onChange={(e) => setTargetColumnId(e.target.value)}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isDone ? ' (hoàn thành)' : ''}
              </option>
            ))}
          </select>
          {selectedColumnId !== task.columnId && (
            <Button variant="secondary" onClick={() => void handleMove()} loading={moving}>
              Chuyển
            </Button>
          )}
          {task.isOverdue && <span className={styles.overdueBadge}>Quá hạn</span>}
        </div>
        {moveError && <ErrorMessage>{moveError}</ErrorMessage>}

        {conflict && (
          <VersionConflict
            current={conflict}
            draft={draft.values}
            changes={pending}
            members={members}
            labels={labels}
            submitting={saving}
            onUseLatest={discardChanges}
            onResubmit={resubmit}
          />
        )}
        {changedElsewhere && (
          <p className={styles.notice} role="status">
            Công việc vừa được cập nhật ở nơi khác. Khi lưu, bạn sẽ được chọn giữ bản nào.
          </p>
        )}

        <form id={formId} onSubmit={handleSubmit} noValidate>
          <TaskFields
            values={draft.values}
            members={members}
            currentAssignee={task.assignee}
            labels={labels}
            titleError={titleError}
            disabled={saving || conflict !== null}
            onChange={draft.setField}
          />
        </form>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}

        <section className={styles.section} aria-labelledby={`${formId}-description`}>
          <h3 id={`${formId}-description`} className={styles.sectionTitle}>
            Mô tả
          </h3>
          <TaskDescriptionEditor taskId={task.id} descriptionText={task.descriptionText} />
        </section>

        <p className={styles.meta}>
          Tạo lúc {formatDateTime(task.createdAt)} · Cập nhật lúc {formatDateTime(task.updatedAt)}
        </p>
      </div>
    );
  }

  return (
    <>
      <Modal title={title} onClose={task ? requestClose : onClose} size="lg" footer={footer}>
        {body}
      </Modal>

      {task && confirming === 'delete' && (
        <ConfirmDialog
          title="Xóa công việc?"
          confirmLabel="Xóa"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await onDelete(task.id);
            onClose();
          }}
        >
          Công việc <strong>{task.title}</strong> cùng bình luận của nó sẽ bị xóa vĩnh viễn.
        </ConfirmDialog>
      )}
      {confirming === 'close' && (
        <ConfirmDialog
          title="Bỏ thay đổi chưa lưu?"
          confirmLabel="Bỏ thay đổi"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={async () => onClose()}
        >
          Các thay đổi bạn vừa sửa sẽ bị mất.
        </ConfirmDialog>
      )}
    </>
  );
}

/** Bản mới nhất server gửi kèm lỗi 409 (`error.details.current`). */
function conflictTask(err: ApiError): Task | null {
  const details = err.details as { current?: Task } | null | undefined;
  return details?.current ?? null;
}

/** Trong `mine` (các trường mình đã sửa), giữ những trường vẫn còn khác `latest`, với giá trị của bản nháp. */
function pendingChanges(draft: TaskDraft, mine: TaskChanges, latest: Task): TaskChanges {
  const differsFromLatest = changesBetween(draft, latest);
  const result: TaskChanges = {};
  for (const key of Object.keys(mine) as (keyof TaskChanges)[]) {
    if (key in differsFromLatest) Object.assign(result, { [key]: differsFromLatest[key] });
  }
  return result;
}
