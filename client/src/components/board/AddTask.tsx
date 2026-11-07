// Ô "+ Thêm thẻ" ở cuối mỗi cột: gõ tiêu đề rồi Enter để tạo thẻ (thẻ mới nằm cuối cột).
import { LIMITS, validateTaskTitle } from '../../utils/validation';
import { AddItemForm } from './AddItemForm';

interface AddTaskProps {
  columnName: string;
  onCreate: (title: string) => Promise<unknown>;
}

export function AddTask({ columnName, onCreate }: AddTaskProps) {
  return (
    <AddItemForm
      openLabel="Thêm thẻ"
      inputLabel={`Tiêu đề thẻ mới trong cột ${columnName}`}
      placeholder="Nhập tiêu đề rồi nhấn Enter"
      submitLabel="Thêm thẻ"
      maxLength={LIMITS.taskTitleMax}
      multiline
      validate={validateTaskTitle}
      onSubmit={onCreate}
      serverField="title"
    />
  );
}
