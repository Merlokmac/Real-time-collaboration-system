/*
 * Trang hồ sơ: đổi tên hiển thị và đường dẫn ảnh đại diện (PATCH /users/me).
 *   - Gọi updateMe() của AuthContext → context lưu user mới → Header (đọc cùng context) đổi ngay, không cần tải lại.
 *   - Chỉ gửi trường đã thay đổi. Ô ảnh để trống nghĩa là xóa ảnh → gửi avatarUrl: null.
 *   - Ảnh xem trước dùng giá trị đang gõ (nếu hợp lệ) để người dùng thấy trước khi lưu.
 *   - Email không đổi được (backend không có API), chỉ hiển thị.
 */
import { useState, type FormEvent } from 'react';
import { getErrorMessage, getFieldErrors } from '../api/client';
import type { UpdateMeInput } from '../api/auth';
import { Avatar } from '../components/common/Avatar';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { TextField } from '../components/common/TextField';
import { PageContainer } from '../components/layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { compactErrors, LIMITS, validateAvatarUrl, validateName } from '../utils/validation';
import styles from './ProfilePage.module.css';

type Field = 'name' | 'avatarUrl';
type Errors = Partial<Record<Field, string>>;

export function ProfilePage() {
  const { user, updateMe } = useAuth();
  // Trang nằm trong ProtectedRoute nên user luôn có; giá trị ban đầu lấy từ user lúc mở trang
  const [name, setName] = useState(user?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const trimmedName = name.trim();
  const trimmedUrl = avatarUrl.trim();
  const changes: UpdateMeInput = {};
  if (trimmedName !== user.name) changes.name = trimmedName;
  if (trimmedUrl !== (user.avatarUrl ?? '')) changes.avatarUrl = trimmedUrl || null;
  const dirty = Object.keys(changes).length > 0;

  const previewSrc = trimmedUrl && !validateAvatarUrl(trimmedUrl) ? trimmedUrl : null;

  function clearFieldError(field: Field) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !dirty) return;

    const clientErrors = compactErrors({ name: validateName(name), avatarUrl: validateAvatarUrl(avatarUrl) });
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await updateMe(changes);
      // Đồng bộ ô nhập với dữ liệu server đã lưu (server có thể đã trim)
      setName(updated.name);
      setAvatarUrl(updated.avatarUrl ?? '');
      setSaved(true);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setName(user!.name);
    setAvatarUrl(user!.avatarUrl ?? '');
    setErrors({});
    setFormError(null);
    setSaved(false);
  }

  return (
    <PageContainer>
      <div className={styles.page}>
        <h1>Hồ sơ</h1>

        <section className={styles.card}>
          <div className={styles.identity}>
            <Avatar name={trimmedName || user.name} id={user.id} src={previewSrc} size="lg" />
            <div className={styles.identityText}>
              <strong>{trimmedName || user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            {saved && (
              <p className={styles.success} role="status">
                Đã lưu thay đổi.
              </p>
            )}

            <TextField
              label="Tên hiển thị"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError('name');
              }}
              error={errors.name}
              maxLength={LIMITS.nameMax}
            />
            <TextField
              label="Đường dẫn ảnh đại diện"
              name="avatarUrl"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://…"
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                clearFieldError('avatarUrl');
              }}
              error={errors.avatarUrl}
              hint="Để trống để dùng chữ cái đầu của tên."
              maxLength={LIMITS.avatarUrlMax}
            />
            <TextField label="Email" name="email" value={user.email} disabled hint="Không thể đổi email." />

            <div className={styles.actions}>
              <Button variant="secondary" onClick={handleReset} disabled={!dirty || submitting}>
                Hoàn tác
              </Button>
              <Button type="submit" loading={submitting} disabled={!dirty}>
                {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </PageContainer>
  );
}
