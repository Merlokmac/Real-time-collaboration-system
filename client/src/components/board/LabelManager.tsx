/*
 * Hộp "Quản lý nhãn" (mở từ nút "Nhãn" trên thanh công cụ bảng; mọi thành viên dùng được, không chỉ chủ dự án).
 *
 *   - Trên cùng: form tạo nhãn (tên + màu). Tạo xong ô tên được xóa và giữ focus để thêm tiếp.
 *   - Danh sách nhãn: chip màu + tên, nút Sửa (sửa tại chỗ, Enter lưu / Esc hủy) và Xóa (có xác nhận).
 *   - Hộp nhận `labels` mới nhất qua props, nên khi người khác tạo/đổi/xóa nhãn (realtime) danh sách đổi ngay.
 *     Nhãn đang sửa mà bị người khác xóa → thoát chế độ sửa và báo ngắn.
 *   - Xóa nhãn: số thẻ đang dùng chỉ đếm được trên các thẻ client đang có (server không có API đếm). Khi bảng đang
 *     lọc thì client thiếu thẻ nên ghi "ít nhất N thẻ".
 */
import { useState } from 'react';
import type { BoardColumn, Label } from '../../types';
import { textColorOn } from '../../utils/color';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { LabelForm } from './LabelForm';
import styles from './LabelManager.module.css';

interface LabelManagerProps {
  labels: Label[];
  /** Để đếm số thẻ đang dùng mỗi nhãn */
  columns: BoardColumn[];
  /** Bảng đang hiện có thể thiếu thẻ (đang lọc) → số thẻ đếm được chỉ là "ít nhất" */
  partial: boolean;
  onCreate: (name: string, color: string) => Promise<unknown>;
  onUpdate: (labelId: string, input: { name: string; color: string }) => Promise<unknown>;
  onDelete: (labelId: string) => Promise<void>;
  onClose: () => void;
}

export function LabelManager({ labels, columns, partial, onCreate, onUpdate, onDelete, onClose }: LabelManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Nhãn đang sửa bị người khác xóa → thoát chế độ sửa và báo (đổi state ngay lúc render là cách React khuyến nghị
  // cho state dẫn xuất từ props)
  if (editingId && !labels.some((l) => l.id === editingId)) {
    setEditingId(null);
    setNotice('Nhãn bạn đang sửa vừa bị người khác xóa.');
  }

  const deleting = labels.find((l) => l.id === deletingId);
  const usage = (labelId: string) =>
    columns.reduce((sum, c) => sum + c.tasks.filter((t) => t.labels.some((l) => l.id === labelId)).length, 0);

  return (
    <>
      <Modal title="Quản lý nhãn" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
        <div className={styles.content}>
          <section aria-labelledby="label-create-title">
            <h3 id="label-create-title" className={styles.sectionTitle}>
              Nhãn mới
            </h3>
            <LabelForm
              labels={labels}
              submitLabel="Thêm nhãn"
              resetOnSuccess
              onSubmit={async (name, color) => {
                setNotice(null);
                await onCreate(name, color);
              }}
            />
          </section>

          <section aria-labelledby="label-list-title">
            <h3 id="label-list-title" className={styles.sectionTitle}>
              Nhãn của dự án
            </h3>
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            {labels.length === 0 ? (
              <p className={styles.empty}>Dự án chưa có nhãn nào.</p>
            ) : (
              <ul className={styles.list}>
                {labels.map((label) => (
                  <li key={label.id} className={styles.item}>
                    {editingId === label.id ? (
                      <LabelForm
                        labels={labels}
                        editing={label}
                        submitLabel="Lưu"
                        autoFocus
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (name, color) => {
                          await onUpdate(label.id, { name, color });
                          setEditingId(null);
                        }}
                      />
                    ) : (
                      <div className={styles.row}>
                        <span className={styles.chip} style={{ background: label.color, color: textColorOn(label.color) }}>
                          {label.name}
                        </span>
                        <div className={styles.rowActions}>
                          <Button variant="ghost" onClick={() => { setNotice(null); setEditingId(label.id); }} aria-label={`Sửa nhãn ${label.name}`}>
                            Sửa
                          </Button>
                          <Button variant="ghost" className={styles.delete} onClick={() => setDeletingId(label.id)} aria-label={`Xóa nhãn ${label.name}`}>
                            Xóa
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>

      {deleting && (
        <ConfirmDialog
          title="Xóa nhãn?"
          confirmLabel="Xóa nhãn"
          danger
          onCancel={() => setDeletingId(null)}
          onConfirm={async () => {
            await onDelete(deleting.id);
            setDeletingId(null);
          }}
        >
          {(() => {
            const count = usage(deleting.id);
            return (
              <>
                Nhãn <strong>{deleting.name}</strong>
                {count > 0
                  ? ` đang được dùng ở ${partial ? 'ít nhất ' : ''}${count} thẻ. `
                  : partial
                    ? ' không có ở thẻ nào đang hiện (bộ lọc có thể đang ẩn một số thẻ). '
                    : ' chưa gắn vào thẻ nào. '}
                Nhãn sẽ bị gỡ khỏi mọi thẻ.
              </>
            );
          })()}
        </ConfirmDialog>
      )}
    </>
  );
}
