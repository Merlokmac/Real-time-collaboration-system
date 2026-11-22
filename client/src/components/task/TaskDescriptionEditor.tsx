/*
 * Vùng mô tả công việc trong chi tiết thẻ.
 *
 * Mô tả không sửa qua REST mà qua Yjs (cộng tác thời gian thực, Người 3 tích hợp):
 *   - Tài liệu Yjs: `task:<taskId>`, kết nối `/yjs/task:<taskId>`, văn bản là `doc.getText('description')`.
 *   - Server tự cập nhật `descriptionText` từ tài liệu Yjs, nên thẻ trên bảng vẫn hiện đúng nội dung.
 *
 * Hiện tại component chỉ hiển thị `descriptionText` (chỉ đọc). Khi gắn y-quill, chỉ cần thay phần thân
 * component này; props giữ nguyên để TaskDetail không phải sửa.
 */
import styles from './TaskDescriptionEditor.module.css';

interface TaskDescriptionEditorProps {
  /** Dùng để mở tài liệu Yjs `task:<taskId>` */
  taskId: string;
  /** Bản text server lưu sẵn, hiển thị khi chưa có trình soạn thảo cộng tác */
  descriptionText: string;
}

export function TaskDescriptionEditor({ taskId, descriptionText }: TaskDescriptionEditorProps) {
  const text = descriptionText.trim();

  return (
    <div className={styles.editor} data-task-id={taskId}>
      {text ? <p className={styles.text}>{descriptionText}</p> : <p className={styles.empty}>Chưa có mô tả.</p>}
      <p className={styles.note}>Chỉ xem. Soạn thảo cộng tác sẽ có khi tích hợp Yjs.</p>
    </div>
  );
}
