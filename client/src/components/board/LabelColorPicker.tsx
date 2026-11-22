/*
 * Chọn màu nhãn: bảng màu định sẵn (nhóm radio, mũi tên / Space chọn được bằng bàn phím) + một ô màu tự chọn.
 * Ô radio thật nằm trong từng ô màu (ẩn khỏi mắt) nên trình đọc màn hình đọc được tên màu.
 */
import { useId } from 'react';
import { LABEL_PALETTE } from '../../utils/labelColors';
import styles from './LabelColorPicker.module.css';

interface LabelColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function LabelColorPicker({ value, onChange, disabled }: LabelColorPickerProps) {
  const name = useId();
  const current = value.toLowerCase();
  const isCustom = !LABEL_PALETTE.some((c) => c.color === current);

  return (
    <div className={styles.picker}>
      <div role="radiogroup" aria-label="Màu nhãn" className={styles.palette}>
        {LABEL_PALETTE.map((c) => (
          <label
            key={c.color}
            className={`${styles.swatch} ${current === c.color ? styles.selected : ''}`}
            style={{ background: c.color }}
          >
            <input
              type="radio"
              name={name}
              value={c.color}
              checked={current === c.color}
              disabled={disabled}
              aria-label={c.name}
              onChange={() => onChange(c.color)}
            />
            <span aria-hidden="true">{current === c.color ? '✓' : ''}</span>
          </label>
        ))}
      </div>
      <label className={`${styles.custom} ${isCustom ? styles.customSelected : ''}`}>
        <input type="color" value={current} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        <span>Màu khác</span>
      </label>
    </div>
  );
}
