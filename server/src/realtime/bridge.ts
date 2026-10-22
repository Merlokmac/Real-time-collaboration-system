import type { ServerEvent } from './events';

/**
 * Cầu nối giữa API và phần realtime.
 * Backend chỉ gọi các hàm này sau khi đã ghi DB thành công.
 * Phần Socket.IO / Yjs gọi setRealtimeBridge() khi khởi động để gắn cài đặt thật.
 */
export interface RealtimeBridge {
  toProject(projectId: string, event: ServerEvent, payload: unknown, exceptSocketId?: string): void;
  toUser(userId: string, event: ServerEvent, payload: unknown): void;
  /** Ngắt socket của user khỏi phòng dự án và đóng các tài liệu Yjs của dự án đó */
  revokeAccess(projectId: string, userId: string): void;
  /** Đóng toàn bộ phòng và tài liệu khi dự án bị xóa */
  closeProject(projectId: string): void;
}

const noop: RealtimeBridge = {
  toProject() {},
  toUser() {},
  revokeAccess() {},
  closeProject() {},
};

let current: RealtimeBridge = noop;

export function setRealtimeBridge(bridge: RealtimeBridge) {
  current = bridge;
}

export const realtime: RealtimeBridge = {
  toProject: (projectId, event, payload, exceptSocketId) =>
    current.toProject(projectId, event, payload, exceptSocketId),
  toUser: (userId, event, payload) => current.toUser(userId, event, payload),
  revokeAccess: (projectId, userId) => current.revokeAccess(projectId, userId),
  closeProject: (projectId) => current.closeProject(projectId),
};
