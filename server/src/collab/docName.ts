// Tên phòng Yjs của mô tả công việc: "task:<taskId>"
const PREFIX = 'task:';

export const docNameOf = (taskId: string) => `${PREFIX}${taskId}`;

export function taskIdOf(docName: string): string | null {
  if (!docName.startsWith(PREFIX)) return null;
  const id = docName.slice(PREFIX.length);
  return id.length > 0 ? id : null;
}

// Tên kiểu Y.Text dùng cho mô tả, client y-quill phải dùng đúng tên này
export const DESCRIPTION_FIELD = 'description';
