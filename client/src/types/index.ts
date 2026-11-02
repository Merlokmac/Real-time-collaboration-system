/*
 * Kiểu dữ liệu khớp server/docs/API.md và code backend (prisma/schema.prisma, lib/selects.ts).
 * Mọi mốc thời gian là chuỗi ISO 8601 (JSON không có kiểu Date), ví dụ "2026-10-20T00:00:00.000Z".
 */

/** Chuỗi thời gian ISO 8601 do server trả về */
export type IsoDateString = string;

// ---------- Người dùng ----------

/** Thông tin công khai của người dùng (publicUser ở backend) */
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

// ---------- Dự án ----------

export type ProjectRole = 'OWNER' | 'MEMBER';

/** Một dòng trong GET /projects */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  role: ProjectRole;
  memberCount: number;
  updatedAt: IsoDateString;
}

/** GET /projects/:projectId — có role của người đang đăng nhập */
export interface Project {
  id: string;
  name: string;
  description: string;
  createdById: string;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  memberCount: number;
  role: ProjectRole;
}

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  joinedAt: IsoDateString;
  user: User;
}

// ---------- Bảng ----------

export interface Column {
  id: string;
  projectId: string;
  name: string;
  position: number;
  /** Cột "hoàn thành": thẻ trong cột này không bị tính là quá hạn */
  isDone: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  /** Dạng "#RRGGBB" */
  color: string;
  createdAt: IsoDateString;
}

export interface Task {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  /** Bản text của mô tả Yjs, chỉ để hiển thị. Không sửa qua REST. */
  descriptionText: string;
  position: number;
  assigneeId: string | null;
  assignee: User | null;
  dueDate: IsoDateString | null;
  labels: Label[];
  createdById: string;
  /** Tăng mỗi lần sửa; phải gửi kèm khi PATCH để phát hiện xung đột */
  version: number;
  /** Server tính: quá hạn và chưa nằm trong cột isDone */
  isOverdue: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface BoardColumn extends Column {
  tasks: Task[];
}

/** GET /projects/:projectId/board */
export interface Board {
  columns: BoardColumn[];
  labels: Label[];
  /** true nếu đang áp dụng bộ lọc (danh sách thẻ không đầy đủ) */
  filtered: boolean;
}

/** Thứ tự thẻ trong từng cột, trả về sau khi kéo thẻ */
export interface ColumnTaskOrder {
  columnId: string;
  taskIds: string[];
}

// ---------- Bình luận ----------

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  author: User;
  content: string;
  clientId: string | null;
  editedAt: IsoDateString | null;
  createdAt: IsoDateString;
}

/** Danh sách phân trang cursor: mới nhất trước, nextCursor = null là hết */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------- Lỗi ----------

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'BAD_JSON'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'VERSION_CONFLICT'
  | 'COLUMN_NOT_EMPTY'
  | 'ALREADY_MEMBER'
  | 'ALREADY_INVITED'
  | 'DUPLICATE'
  | 'BUSY'
  | 'INTERNAL';

/**
 * Với VALIDATION_ERROR, details là lỗi theo từng trường (zod flatten().fieldErrors),
 * ví dụ { "email": ["Email không hợp lệ"], "password": ["Mật khẩu tối thiểu 8 ký tự"] }
 */
export type FieldErrors = Record<string, string[] | undefined>;

/** Thân phản hồi lỗi của server */
export interface ApiErrorBody {
  error: {
    // Giữ `string` để không vỡ khi backend thêm mã lỗi mới
    code: ApiErrorCode | (string & {});
    message: string;
    details?: unknown;
  };
}
