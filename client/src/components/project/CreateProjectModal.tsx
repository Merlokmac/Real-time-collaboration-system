/*
 * Hộp thoại tạo dự án. Tạo thành công thì gọi onCreated(project) — trang cha chuyển vào /projects/:id.
 * Trong lúc đang gửi không cho đóng (Esc / bấm nền / Hủy) để tránh tưởng đã hủy mà thực ra dự án vẫn được tạo.
 */
import { useState, type FormEvent } from 'react';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { createProject } from '../../api/projects';
import type { Project } from '../../types';
import { compactErrors, LIMITS, validateProjectDescription, validateProjectName } from '../../utils/validation';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { Modal } from '../common/Modal';
import { TextAreaField } from '../common/TextAreaField';
import { TextField } from '../common/TextField';
import styles from './CreateProjectModal.module.css';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type Field = 'name' | 'description';
type Errors = Partial<Record<Field, string>>;

const FORM_ID = 'create-project-form';

export function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const clientErrors = compactErrors({
      name: validateProjectName(name),
      description: validateProjectDescription(description),
    });
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const desc = description.trim();
      const project = await createProject({ name: name.trim(), ...(desc ? { description: desc } : {}) });
      onCreated(project);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Tạo dự án"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Hủy
          </Button>
          {/* Nút nằm ngoài <form> (ở chân hộp thoại) nên nối vào form bằng thuộc tính form */}
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {submitting ? 'Đang tạo…' : 'Tạo dự án'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}
        <TextField
          label="Tên dự án"
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          error={errors.name}
          maxLength={LIMITS.projectNameMax}
          placeholder="Ví dụ: Đồ án Công nghệ Web"
          required
        />
        <TextAreaField
          label="Mô tả (không bắt buộc)"
          name="description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setErrors((prev) => ({ ...prev, description: undefined }));
          }}
          error={errors.description}
          hint={`${description.trim().length}/${LIMITS.projectDescriptionMax} ký tự`}
          maxLength={LIMITS.projectDescriptionMax}
        />
      </form>
    </Modal>
  );
}
