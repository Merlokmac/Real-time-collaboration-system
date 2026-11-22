/*
 * Hiện khi lưu thẻ nhận 409 VERSION_CONFLICT: người khác đã lưu thẻ này sau lúc mình bắt đầu sửa.
 *
 * Không ghi đè âm thầm theo bên nào. Bảng so sánh chỉ gồm các trường mình đã sửa:
 *   - "Bản mới nhất": giá trị đang có trên server (`current`, lấy từ error.details.current).
 *   - "Bản của bạn": giá trị trong bản nháp (vẫn được giữ nguyên).
 * Người dùng chọn:
 *   - Dùng bản mới: bỏ bản nháp.
 *   - Gửi lại bản của tôi: gửi các thay đổi của mình kèm version MỚI (`current.version`).
 */
import type { TaskChanges, TaskDraft } from '../../hooks/useTaskDraft';
import type { Label, ProjectMember, Task } from '../../types';
import { formatDate } from '../../utils/format';
import { Button } from '../common/Button';
import styles from './VersionConflict.module.css';

interface VersionConflictProps {
  current: Task;
  draft: TaskDraft;
  /** Các trường mình đã sửa mà vẫn còn khác bản mới nhất (trường hai bên đặt giống nhau thì không hiện) */
  changes: TaskChanges;
  members: ProjectMember[] | null;
  labels: Label[];
  submitting: boolean;
  onUseLatest: () => void;
  onResubmit: () => void;
}

const FIELD_NAMES: Record<keyof TaskChanges, string> = {
  title: 'Tiêu đề',
  assigneeId: 'Người phụ trách',
  dueDate: 'Hạn hoàn thành',
  labelIds: 'Nhãn',
};

export function VersionConflict({ current, draft, changes, members, labels, submitting, onUseLatest, onResubmit }: VersionConflictProps) {
  const personName = (userId: string | null) => {
    if (!userId) return 'Chưa giao';
    if (current.assignee?.id === userId) return current.assignee.name;
    return members?.find((m) => m.userId === userId)?.user.name ?? 'Người dùng khác';
  };
  const labelNames = (ids: string[]) =>
    ids.length === 0 ? 'Không có nhãn' : ids
      // Nhãn đã bị xóa (bản nháp còn id cũ) thì bỏ qua, không hiện "?"; TaskDetail cũng bỏ id đó khi gửi
      .flatMap((id) => labels.find((l) => l.id === id)?.name ?? [])
      .join(', ') || 'Không có nhãn';
  const dueText = (day: string | null) => (day ? formatDate(`${day}T00:00:00.000Z`) : 'Không có hạn');

  const rows = (Object.keys(changes) as (keyof TaskChanges)[]).map((key) => {
    switch (key) {
      case 'title':
        return { key, latest: current.title, mine: draft.title.trim() };
      case 'assigneeId':
        return { key, latest: personName(current.assigneeId), mine: personName(draft.assigneeId) };
      case 'dueDate':
        return { key, latest: dueText(current.dueDate?.slice(0, 10) ?? null), mine: dueText(draft.dueDate || null) };
      case 'labelIds':
        return { key, latest: labelNames(current.labels.map((l) => l.id)), mine: labelNames(draft.labelIds) };
    }
  });

  return (
    <section className={styles.conflict} role="alert" aria-labelledby="version-conflict-title">
      <h3 id="version-conflict-title" className={styles.title}>
        Công việc vừa được người khác cập nhật
      </h3>
      {rows.length === 0 ? (
        <p className={styles.text}>Bản mới nhất đã trùng với thay đổi của bạn, không còn gì cần gửi lại.</p>
      ) : (
        <p className={styles.text}>Thay đổi của bạn chưa được lưu và vẫn được giữ. Chọn bản muốn dùng:</p>
      )}

      {rows.length > 0 && <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Trường</th>
            <th scope="col">Bản mới nhất</th>
            <th scope="col">Bản của bạn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{FIELD_NAMES[row.key]}</th>
              <td>{row.latest}</td>
              <td className={styles.mine}>{row.mine}</td>
            </tr>
          ))}
        </tbody>
      </table>}

      <div className={styles.actions}>
        <Button variant={rows.length === 0 ? 'primary' : 'secondary'} onClick={onUseLatest} disabled={submitting}>
          Dùng bản mới
        </Button>
        {rows.length > 0 && (
          <Button onClick={onResubmit} loading={submitting}>
            Gửi lại bản của tôi
          </Button>
        )}
      </div>
    </section>
  );
}
