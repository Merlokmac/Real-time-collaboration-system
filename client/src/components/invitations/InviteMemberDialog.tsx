/*
 * Hộp thoại mời thành viên vào dự án (chỉ chủ dự án thấy nút mở). Logic gửi lời mời lấy từ bản thử của Người 3
 * trên trang bảng (inviteMember), đưa vào hộp thoại để trang bảng gọn.
 * Server kiểm tra quyền và báo lỗi: email chưa đăng ký, đã là thành viên (ALREADY_MEMBER), đã mời (ALREADY_INVITED).
 * Gửi xong giữ hộp thoại mở để mời tiếp người khác.
 */
import { useState, type FormEvent } from 'react';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { inviteMember } from '../../api/invitations';
import { validateEmail } from '../../utils/validation';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { Modal } from '../common/Modal';
import { TextField } from '../common/TextField';
import styles from './InviteMemberDialog.module.css';

interface InviteMemberDialogProps {
  projectId: string;
  onClose: () => void;
}

export function InviteMemberDialog({ projectId, onClose }: InviteMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    const invalid = validateEmail(value);
    setFieldError(invalid);
    setError(null);
    setSentTo(null);
    if (invalid) return;

    setSending(true);
    try {
      await inviteMember(projectId, value);
      setSentTo(value);
      setEmail('');
    } catch (err) {
      setFieldError(getFieldErrors(err).email);
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      title="Mời thành viên"
      onClose={() => !sending && onClose()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Đóng
          </Button>
          <Button type="submit" form="invite-member-form" loading={sending}>
            Gửi lời mời
          </Button>
        </>
      }
    >
      <form id="invite-member-form" className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Email người được mời"
          type="email"
          value={email}
          error={fieldError}
          hint="Người được mời phải có tài khoản. Lời mời hết hạn sau 7 ngày."
          disabled={sending}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {sentTo && (
          <p className={styles.success} role="status">
            Đã gửi lời mời tới {sentTo}.
          </p>
        )}
      </form>
    </Modal>
  );
}
