/*
 * CHỖ CHỪA SẴN cho Người 3 (giao diện lời mời) — Huân không làm phần này.
 *
 * Gợi ý cho Người 3:
 *   - Dữ liệu: GET /invitations (lời mời đang chờ của mình), POST /invitations/:id/accept | decline.
 *   - Realtime: invitation:received / invitation:canceled gửi vào phòng user.
 *   - Chấp nhận xong gọi `onAccepted()` để ProjectsPage tải lại danh sách dự án (dự án mới sẽ hiện ra).
 *   - Không có lời mời nào thì nên render null để không chiếm chỗ.
 */
import styles from './InvitationsPanel.module.css';

export interface InvitationsPanelProps {
  /** Gọi sau khi chấp nhận lời mời, để trang Dự án của tôi tải lại danh sách */
  onAccepted?: () => void;
}

export function InvitationsPanel(props: InvitationsPanelProps) {
  void props; // props để sẵn cho Người 3, bản tạm chưa dùng
  return (
    <section className={styles.placeholder} aria-label="Lời mời tham gia dự án">
      <strong>Lời mời tham gia dự án</strong>
      <span>Người 3 làm giao diện lời mời.</span>
    </section>
  );
}
