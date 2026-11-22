/*
 * Thanh tìm kiếm + bộ lọc của bảng: ô tìm theo tiêu đề, người làm (có "Chưa giao"), nhãn, "Quá hạn", "Xóa lọc".
 *
 * Component này KHÔNG giữ bộ lọc: BoardPage đọc/ghi URL (nguồn sự thật) rồi truyền `filter` xuống, còn
 * mỗi thay đổi đi ngược lên qua `onChange`. Riêng ô tìm kiếm có `searchText` (chữ đang gõ, chưa ghi URL) vì
 * URL chỉ được cập nhật sau khi ngừng gõ 300ms.
 *
 * Trạng thái hiển thị:
 *   - Dòng role="status": "Đang lọc, X thẻ" (X = tổng thẻ trong mọi cột của bảng đang hiện).
 *   - Lọc ra 0 thẻ: "Không có thẻ khớp bộ lọc" + nút Xóa lọc (các cột vẫn hiện bên dưới).
 *   - Lần tải mới lỗi (`error`): thanh lỗi + Thử lại / Xóa lọc; bảng cũ vẫn còn, thanh lọc không biến mất.
 *   - Id lạ trên URL (nhãn đã xóa, người đã rời dự án): ô chọn hiện "Không rõ", kết quả 0 thẻ, người dùng bấm Xóa lọc.
 *   - Điện thoại (≤ 640px): các ô lọc thu vào nút "Lọc" (kèm số tiêu chí đang bật).
 */
import { useEffect, useId, useState } from 'react';
import type { BoardFilter } from '../../api/board';
import { getErrorMessage } from '../../api/client';
import { listMembers } from '../../api/members';
import type { Label, ProjectMember } from '../../types';
import { countActive, MAX_SEARCH_LENGTH } from '../../utils/boardFilter';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import styles from './BoardFilters.module.css';

interface BoardFiltersProps {
  projectId: string;
  /** Bộ lọc đang áp dụng (từ URL) */
  filter: BoardFilter;
  /** Chữ đang gõ trong ô tìm kiếm (có thể chưa được ghi lên URL) */
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** Đổi một hoặc vài tiêu chí khác ngoài ô tìm kiếm */
  onChange: (patch: Pick<BoardFilter, 'assigneeId' | 'labelId' | 'overdue'>) => void;
  onClear: () => void;
  labels: Label[];
  /** Tổng số thẻ trong mọi cột của bảng đang hiện */
  cardCount: number;
  /** Đang có request tải bảng */
  loading: boolean;
  /** Lỗi của lần tải bảng gần nhất (bảng cũ vẫn hiện) */
  error: unknown;
  onRetry: () => void;
  /** Thông báo ngắn (ví dụ "Đã tạo thẻ. Thẻ có thể đang bị bộ lọc ẩn.") */
  notice: string | null;
}

type MembersState = { projectId: string; items: ProjectMember[] | null };

export function BoardFilters({
  projectId,
  filter,
  searchText,
  onSearchTextChange,
  onChange,
  onClear,
  labels,
  cardCount,
  loading,
  error,
  onRetry,
  notice,
}: BoardFiltersProps) {
  const id = useId();
  const [open, setOpen] = useState(false); // chỉ có tác dụng ở điện thoại
  // Bộ lọc ĐÃ áp dụng (theo URL), dùng cho trạng thái rỗng / số thẻ: không tính chữ đang gõ dở (chưa debounce xong)
  const applied = countActive(filter) > 0;
  // Có gì đó để xóa (kể cả chữ đang gõ dở): quyết định nút "Xóa lọc"
  const active = applied || searchText.trim() !== '';

  // Thành viên để chọn người làm. Lỗi tải thì các bộ lọc khác vẫn dùng được (ô người làm chỉ còn Tất cả / Chưa giao)
  const [membersState, setMembersState] = useState<MembersState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listMembers(projectId, { signal: controller.signal })
      .then((items) => setMembersState({ projectId, items }))
      .catch(() => {
        if (!controller.signal.aborted) setMembersState({ projectId, items: [] });
      });
    return () => controller.abort();
  }, [projectId]);
  const members = membersState?.projectId === projectId ? membersState.items : null;

  const assigneeValue = filter.assigneeId ?? '';
  const knownAssignee =
    assigneeValue === '' || assigneeValue === 'none' || (members ?? []).some((m) => m.userId === assigneeValue);
  const labelValue = filter.labelId ?? '';
  const knownLabel = labelValue === '' || labels.some((l) => l.id === labelValue);

  const showEmpty = applied && !loading && !error && cardCount === 0;

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={`${id}-fields`}
          onClick={() => setOpen((v) => !v)}
        >
          Lọc
          {countActive(filter) > 0 && <span className={styles.badge}>{countActive(filter)}</span>}
        </button>

        <div id={`${id}-fields`} className={`${styles.fields} ${open ? styles.fieldsOpen : ''}`}>
          <div className={styles.search}>
            <label htmlFor={`${id}-q`} className={styles.srOnly}>
              Tìm thẻ theo tiêu đề
            </label>
            <input
              id={`${id}-q`}
              type="search"
              className={styles.input}
              placeholder="Tìm theo tiêu đề…"
              value={searchText}
              maxLength={MAX_SEARCH_LENGTH}
              onChange={(e) => onSearchTextChange(e.target.value)}
              autoComplete="off"
            />
            {searchText && (
              <button type="button" className={styles.clearSearch} onClick={() => onSearchTextChange('')} aria-label="Xóa nội dung tìm kiếm">
                ×
              </button>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={`${id}-assignee`} className={styles.label}>
              Người làm
            </label>
            <select
              id={`${id}-assignee`}
              className={styles.select}
              value={assigneeValue}
              onChange={(e) => onChange({ assigneeId: e.target.value || undefined, labelId: filter.labelId, overdue: filter.overdue })}
            >
              <option value="">Tất cả</option>
              <option value="none">Chưa giao</option>
              {(members ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name}
                </option>
              ))}
              {!knownAssignee && <option value={assigneeValue}>{members ? 'Không rõ' : 'Đang tải…'}</option>}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor={`${id}-label`} className={styles.label}>
              Nhãn
            </label>
            <select
              id={`${id}-label`}
              className={styles.select}
              value={labelValue}
              onChange={(e) => onChange({ assigneeId: filter.assigneeId, labelId: e.target.value || undefined, overdue: filter.overdue })}
            >
              <option value="">Tất cả</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              {!knownLabel && <option value={labelValue}>Không rõ</option>}
            </select>
          </div>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={!!filter.overdue}
              onChange={(e) => onChange({ assigneeId: filter.assigneeId, labelId: filter.labelId, overdue: e.target.checked || undefined })}
            />
            Quá hạn
          </label>

          {active && (
            <Button variant="ghost" onClick={onClear}>
              Xóa lọc
            </Button>
          )}
        </div>
      </div>

      {/* Luôn có mặt trong cây để trình đọc màn hình thông báo khi nội dung đổi */}
      <p className={styles.status} role="status" aria-live="polite">
        {applied && !error && (loading ? 'Đang lọc…' : `Đang lọc, ${cardCount} thẻ`)}
        {notice && (
          <>
            {applied && !error ? ' · ' : ''}
            {notice}
          </>
        )}
      </p>

      {showEmpty && (
        <div className={styles.empty}>
          <span>Không có thẻ khớp bộ lọc</span>
          <Button variant="secondary" onClick={onClear}>
            Xóa lọc
          </Button>
        </div>
      )}

      {error !== null && error !== undefined && (
        <div className={styles.error}>
          {/* Lỗi tải lại bảng cũng đi qua đường này (ví dụ sau khi kết nối lại), nên câu chữ phụ thuộc có đang lọc không */}
          <ErrorMessage>
            {applied ? 'Không áp dụng được bộ lọc.' : 'Không tải lại được bảng.'} {getErrorMessage(error)}
          </ErrorMessage>
          <div className={styles.errorActions}>
            <Button variant="secondary" onClick={onRetry}>
              Thử lại
            </Button>
            {active && (
              <Button variant="ghost" onClick={onClear}>
                Xóa lọc
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
