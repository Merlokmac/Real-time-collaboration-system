/*
 * Vùng bảng: các cột xếp ngang, cuối cùng là ô "Thêm cột". Vùng này cuộn ngang khi nhiều cột
 * (trên điện thoại mỗi cột rộng ~85% màn hình, vuốt ngang sẽ dừng đúng mép từng cột).
 *
 * Kéo thả (dnd-kit) — một DndContext cho cả thẻ lẫn cột, phân biệt bằng `data.type`:
 *
 *   Trong lúc kéo (chưa gọi API):
 *     - Kéo thẻ trong cùng cột: SortableContext tự dịch các thẻ khác bằng transform, state không đổi.
 *     - Kéo thẻ sang cột khác: onDragOver chuyển thẻ sang cột mới trong một bản nháp `dragBoard`
 *       (moveTaskLocal), để cột đích mở chỗ trống cho thẻ. Bảng thật (prop `board`) chưa đổi.
 *     - Esc / hủy kéo: bỏ bản nháp, mọi thứ về như cũ.
 *   Khi thả:
 *     - Tính cột đích + vị trí cuối cùng từ bản nháp rồi gọi onMoveTask / onMoveColumn (useBoard).
 *       useBoard mới là nơi cập nhật tạm (optimistic), gọi API, lấy kết quả server làm chuẩn hoặc hoàn lại.
 *
 *   Cảm biến:
 *     - Chuột (MouseSensor): phải di ≥ 5px mới tính là kéo, nên click bình thường vẫn mở thẻ.
 *     - Cảm ứng (TouchSensor): phải GIỮ YÊN ngón tay 250ms mới nhấc thẻ. Vuốt ngay thì trình duyệt cuộn bảng như
 *       bình thường → không vô tình kéo thẻ khi cuộn ngang trên điện thoại.
 *       Không dùng PointerSensor vì nó nhận cả chạm lẫn chuột với cùng một điều kiện; tách hai sensor để chuột
 *       nhạy (theo khoảng cách) còn cảm ứng chậm (theo thời gian giữ).
 *     - Bàn phím (KeyboardSensor): Tab tới thẻ / tay nắm cột, Space nhấc, mũi tên di chuyển, Space/Enter thả, Esc hủy.
 */
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useRef, useState } from 'react';
import type { Board as BoardData } from '../../types';
import { findTask, moveTaskLocal } from '../../utils/boardState';
import { AddColumn } from './AddColumn';
import { BoardColumn, type ColumnActions } from './BoardColumn';
import { TaskCard } from './TaskCard';
import styles from './Board.module.css';

interface BoardProps extends ColumnActions {
  board: BoardData;
  savingTaskIds: ReadonlySet<string>;
  savingColumnIds: ReadonlySet<string>;
  onCreateColumn: (name: string) => Promise<unknown>;
  onMoveTask: (taskId: string, toColumnId: string, toIndex: number) => void;
  onMoveColumn: (columnId: string, toIndex: number) => void;
}

type DragType = 'task' | 'column';

const typeOf = (data: { current?: { type?: DragType } } | undefined): DragType | undefined => data?.current?.type;

/** Cột đang chứa thẻ `taskId`, hoặc chính cột nếu `id` là id cột. */
function columnOf(board: BoardData, id: UniqueIdentifier) {
  return board.columns.find((c) => c.id === id || c.tasks.some((t) => t.id === id));
}

export function Board({
  board,
  savingTaskIds,
  savingColumnIds,
  onCreateColumn,
  onMoveTask,
  onMoveColumn,
  ...columnActions
}: BoardProps) {
  const [active, setActive] = useState<{ id: string; type: DragType } | null>(null);
  // Bản nháp của bảng trong lúc kéo thẻ sang cột khác; null = không kéo, hiển thị bảng thật
  const [dragBoard, setDragBoard] = useState<BoardData | null>(null);
  const shown = dragBoard ?? board;

  // Đích va chạm gần nhất, dùng lại khi vừa chuyển thẻ sang cột mới mà layout chưa kịp đo lại (tránh nhấp nháy)
  const lastOverId = useRef<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Mặc định dnd-kit nhấc bằng cả Space lẫn Enter; chừa Enter để mở thẻ
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  /*
   * Chọn đích thả:
   *   - Kéo cột: chỉ xét các cột, lấy cột có tâm gần nhất.
   *   - Kéo thẻ: tìm cột dưới con trỏ (hoặc giao nhau nhiều nhất khi dùng bàn phím), rồi trong cột đó lấy thẻ
   *     gần nhất. Cột trống / con trỏ ở khoảng trống dưới thẻ cuối → đích là chính cột (thả xuống cuối).
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const activeType = typeOf(args.active.data);
      if (activeType === 'column') {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => typeOf(c.data) === 'column'),
        });
      }

      const byPointer = pointerWithin(args);
      const hits = byPointer.length > 0 ? byPointer : rectIntersection(args);
      const firstHit = hits[0];
      if (!firstHit) return lastOverId.current ? [{ id: lastOverId.current }] : [];

      const column = columnOf(shown, firstHit.id);
      if (!column) return [firstHit];
      const taskIds = new Set(column.tasks.map((t) => t.id));
      const tasksHere = args.droppableContainers.filter((c) => taskIds.has(String(c.id)));
      const closest = tasksHere.length > 0 ? closestCenter({ ...args, droppableContainers: tasksHere }) : [];
      const result = closest.length > 0 ? closest : [{ id: column.id }];
      lastOverId.current = result[0].id;
      return result;
    },
    [shown],
  );

  function handleDragStart({ active }: DragStartEvent) {
    const type = typeOf(active.data);
    if (!type) return;
    setActive({ id: String(active.id), type });
    lastOverId.current = null;
  }

  /** Thẻ đi qua cột khác: chuyển nó sang cột đó trong bản nháp để cột đích mở chỗ. */
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || typeOf(active.data) !== 'task') return;
    const current = dragBoard ?? board;
    const fromColumn = columnOf(current, active.id);
    const toColumn = columnOf(current, over.id);
    if (!fromColumn || !toColumn || fromColumn.id === toColumn.id) return;

    let toIndex = toColumn.tasks.length; // mặc định: cuối cột
    if (typeOf(over.data) === 'task') {
      const overIndex = toColumn.tasks.findIndex((t) => t.id === over.id);
      // Thẻ đang kéo nằm dưới nửa thẻ `over` → chèn sau nó, ngược lại chèn trước
      const activeRect = active.rect.current.translated;
      const below = activeRect && activeRect.top + activeRect.height / 2 > over.rect.top + over.rect.height / 2;
      toIndex = overIndex + (below ? 1 : 0);
    }
    setDragBoard(moveTaskLocal(current, String(active.id), toColumn.id, toIndex));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const type = typeOf(active.data);
    const current = dragBoard ?? board;
    setActive(null);
    setDragBoard(null);
    if (!over) return;

    if (type === 'column') {
      const toIndex = board.columns.findIndex((c) => c.id === over.id);
      if (toIndex >= 0) onMoveColumn(String(active.id), toIndex);
      return;
    }

    // Thẻ: cột đích là cột đang chứa thẻ trong bản nháp (onDragOver đã chuyển sang nếu khác cột)
    const column = columnOf(current, active.id);
    if (!column) return;
    let toIndex = column.tasks.findIndex((t) => t.id === active.id);
    // Thả lên một thẻ cùng cột → lấy đúng chỗ của thẻ đó (giống arrayMove của SortableContext)
    if (typeOf(over.data) === 'task' && column.tasks.some((t) => t.id === over.id)) {
      toIndex = column.tasks.findIndex((t) => t.id === over.id);
    }
    // toIndex tính sau khi bỏ thẻ khỏi cột cũ — đúng cách server hiểu (moveInList ở backend)
    onMoveTask(String(active.id), column.id, toIndex);
  }

  function handleDragCancel() {
    setActive(null);
    setDragBoard(null);
  }

  const activeTask = active?.type === 'task' ? findTask(shown, active.id) : undefined;
  const activeColumn = active?.type === 'column' ? shown.columns.find((c) => c.id === active.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements: makeAnnouncements(shown), screenReaderInstructions }}
    >
      <div className={`${styles.scroller} ${active ? styles.dragging : ''}`}>
        <ol className={styles.columns} aria-label="Các cột">
          <SortableContext items={shown.columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {shown.columns.map((column) => (
              <li key={column.id} className={styles.columnItem}>
                <BoardColumn
                  column={column}
                  savingTaskIds={savingTaskIds}
                  saving={savingColumnIds.has(column.id)}
                  {...columnActions}
                />
              </li>
            ))}
          </SortableContext>
          <li className={styles.addColumn}>
            <AddColumn onCreate={onCreateColumn} />
          </li>
        </ol>
      </div>

      {/* Bản "bay" theo con trỏ; chỗ cũ trong cột chỉ còn bóng mờ */}
      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} overlay />}
        {activeColumn && (
          <div className={styles.columnOverlay}>
            <strong>{activeColumn.name}</strong>
            <span>{activeColumn.tasks.length} thẻ</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ---------- Bàn phím ----------

/*
 * ↑/↓ (và mọi phím khi kéo cột): dùng cách tính sẵn của dnd-kit.
 * ←/→ khi kéo thẻ: nhảy thẳng sang cột kề bên (đặt thẻ ở đầu cột đó). Cách tính sẵn tìm "phần tử gần nhất
 * bên phải" nên hay chọn nhầm thẻ trong cùng cột; ở đây chỉ dựa vào vị trí các cột trên màn hình.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, collisionRect, droppableRects, droppableContainers } = args.context;
  const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  if (!horizontal || !active || !collisionRect || typeOf(active.data) !== 'task') {
    return sortableKeyboardCoordinates(event, args);
  }
  event.preventDefault();

  const columnRects = droppableContainers
    .getEnabled()
    .filter((c) => typeOf(c.data) === 'column')
    .map((c) => droppableRects.get(c.id))
    .filter((r) => r !== undefined)
    .sort((a, b) => a.left - b.left);
  const centerX = collisionRect.left + collisionRect.width / 2;
  const currentIndex = columnRects.findIndex((r) => centerX >= r.left && centerX <= r.right);
  const target = columnRects[currentIndex + (event.code === 'ArrowRight' ? 1 : -1)];
  if (currentIndex < 0 || !target) return undefined;

  // Tọa độ là góc trên-trái của thẻ đang kéo: căn giữa cột đích, ngay dưới tiêu đề cột
  return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 48 };
};

// ---------- Thông báo cho trình đọc màn hình (tiếng Việt) ----------

const screenReaderInstructions = {
  draggable:
    'Nhấn Space để nhấc lên. Dùng phím mũi tên để di chuyển, nhấn Space hoặc Enter để thả, Esc để hủy.',
};

function makeAnnouncements(board: BoardData): Announcements {
  const nameOf = (id: UniqueIdentifier) => {
    const column = board.columns.find((c) => c.id === id);
    if (column) return `cột ${column.name}`;
    const task = findTask(board, String(id));
    return task ? `thẻ ${task.title}` : 'mục';
  };
  /** "cột Đang làm, vị trí 2 trên 3" cho thẻ; "vị trí 2 trên 4" cho cột */
  const placeOf = (activeId: UniqueIdentifier, overId: UniqueIdentifier) => {
    const columnIndex = board.columns.findIndex((c) => c.id === activeId);
    if (columnIndex >= 0) {
      const overIndex = board.columns.findIndex((c) => c.id === overId);
      return `vị trí ${overIndex + 1} trên ${board.columns.length}`;
    }
    const column = columnOf(board, activeId);
    if (!column) return '';
    const overIndex = column.tasks.findIndex((t) => t.id === overId);
    const index = overIndex >= 0 ? overIndex : column.tasks.findIndex((t) => t.id === activeId);
    return `cột ${column.name}, vị trí ${index + 1} trên ${column.tasks.length}`;
  };
  return {
    onDragStart: ({ active }) => `Đã nhấc ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)}: ${placeOf(active.id, over.id)}.` : `${nameOf(active.id)} không ở trên vùng thả nào.`,
    onDragEnd: ({ active, over }) =>
      over ? `Đã thả ${nameOf(active.id)} vào ${placeOf(active.id, over.id)}. Đang lưu.` : `Đã thả ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Đã hủy kéo ${nameOf(active.id)}, trở về chỗ cũ.`,
  };
}
