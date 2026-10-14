# Hợp đồng giữa backend và phần realtime

Phần này dành cho người làm Socket.IO và Yjs. Backend không tự mở socket; nó chỉ cung cấp các hàm dưới đây.

## 1. Xác thực kết nối

`getSessionUserId(req)` trong `src/lib/session.ts` đọc cookie phiên và trả về `userId` hoặc `null`. Hàm này dùng được cho cả Socket.IO handshake (`socket.request`) và upgrade request của WebSocket Yjs.

Với Socket.IO cũng có thể dùng trực tiếp `io.engine.use(sessionMiddleware)`.

## 2. Phát sự kiện từ API

API gọi `realtime.toProject(...)` sau khi ghi DB thành công. Khi khởi động, phần Socket.IO gắn cài đặt thật:

```ts
import { setRealtimeBridge } from './realtime/bridge';
import { projectRoom, userRoom } from './realtime/events';

setRealtimeBridge({
  toProject(projectId, event, payload, exceptSocketId) {
    const room = io.to(projectRoom(projectId));
    (exceptSocketId ? room.except(exceptSocketId) : room).emit(event, payload);
  },
  toUser(userId, event, payload) {
    io.to(userRoom(userId)).emit(event, payload);
  },
  revokeAccess(projectId, userId) {
    // rời phòng project:<id> cho mọi socket của user, đóng kết nối Yjs của các task thuộc dự án
  },
  closeProject(projectId) {
    // cho mọi socket rời phòng, đóng các tài liệu Yjs của dự án
  },
});
```

Khi một socket xin vào phòng dự án, phải kiểm tra membership (bảng `project_members`) trước khi `socket.join(projectRoom(id))`. Mỗi socket nên join `userRoom(userId)` ngay khi kết nối để nhận lời mời.

## 3. Danh sách sự kiện server phát (`src/realtime/events.ts`)

| Sự kiện | Payload |
| --- | --- |
| `project:updated` | project |
| `project:deleted` | `{ projectId }` |
| `member:joined` | `{ projectId, user, role }` |
| `member:removed` | `{ projectId, userId, user, unassignedTaskIds }` |
| `member:role_changed` | `{ projectId, changes: [{ userId, role }] }` |
| `invitation:received` | invitation (gửi vào phòng user) |
| `invitation:canceled` | `{ invitationId, projectId }` (gửi vào phòng user) |
| `column:created` / `column:updated` | column |
| `column:reordered` | `{ projectId, columnIds }` |
| `column:deleted` | `{ projectId, columnId, columnIds }` |
| `task:created` / `task:updated` | task |
| `task:moved` | `{ task, columns: [{ columnId, taskIds }] }` |
| `task:deleted` | `{ taskId, columnId, taskIds }` |
| `label:created` / `label:updated` | label |
| `label:deleted` | `{ labelId }` |
| `comment:created` / `comment:updated` | comment (có `taskId`) |
| `comment:deleted` | `{ taskId, commentId }` |
| `message:created` | message |
| `activity:created` | log hoạt động |

Các sự kiện chỉ mang tính tạm thời như online, đang chỉnh sửa, con trỏ bảng do phần realtime tự định nghĩa và không đi qua database.

## 4. Chat qua socket

Nếu muốn gửi chat bằng socket thay vì POST, gọi `createMessage({ userId, socketId }, projectId, { content, clientId })` trong `src/modules/messages/messages.service.ts`. Có thể dùng `messageBody` trong `messages.routes.ts` để kiểm tra dữ liệu. Hàm này tự lưu rồi tự phát `message:created`.

## 5. Yjs (mô tả công việc)

Mọi thứ nằm trong `src/collab`:

- Tên tài liệu: `docNameOf(taskId)` cho ra `task:<taskId>`. Client kết nối `wss://<host>/yjs/task:<taskId>`.
- Kiểu văn bản: `doc.getText(DESCRIPTION_FIELD)` với `DESCRIPTION_FIELD = 'description'`. y-quill phía client phải bind vào đúng Y.Text này.
- Quyền: `authorizeDocument(userId, docName)` trả `{ taskId, projectId }` hoặc `null`. Gọi khi upgrade; nếu null thì đóng kết nối.
- Lưu trữ: `yjsPersistence` có `bindState` / `writeState`, dùng được với `setPersistence(yjsPersistence)` của y-websocket.
  - Mỗi update nhị phân được ghi vào `document_updates`.
  - Khi đủ 200 update, hoặc khi người cuối cùng rời tài liệu, các update được gom thành snapshot trong `task_documents`, và `tasks.description_text` được cập nhật.
- Lịch sử: khi một người đã sửa mô tả rời tài liệu, gọi `recordDescriptionSession(projectId, taskId, userId)`. Hàm này ghi một dòng lịch sử cho cả phiên, không ghi từng ký tự.
- Awareness (con trỏ, tên người đang gõ) chỉ đi qua y-websocket và không lưu.
