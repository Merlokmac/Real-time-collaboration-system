// Ô "+ Thêm cột" ở cuối bảng (cột mới luôn nằm cuối).
import { LIMITS, validateColumnName } from '../../utils/validation';
import { AddItemForm } from './AddItemForm';

export function AddColumn({ onCreate }: { onCreate: (name: string) => Promise<unknown> }) {
  return (
    <AddItemForm
      openLabel="Thêm cột"
      inputLabel="Tên cột mới"
      placeholder="Tên cột, ví dụ: Đang kiểm thử"
      submitLabel="Thêm cột"
      maxLength={LIMITS.columnNameMax}
      validate={validateColumnName}
      onSubmit={onCreate}
      serverField="name"
      variant="board"
    />
  );
}
