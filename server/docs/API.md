# API backend

Tất cả đường dẫn bắt đầu bằng `/api`. Xác thực bằng cookie phiên `kanban.sid`, nên client phải gửi kèm cookie (`credentials: 'include'` với fetch, `withCredentials: true` với axios).

Client nên gửi header `x-socket-id: <socket.id>` khi gọi API. Khi có header này, server không phát lại sự kiện cho chính socket vừa thao tác (trừ `task:moved` và `column:reordered`, hai sự kiện này luôn gửi cho mọi socket).

## Định dạng lỗi

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Công việc đã được người khác cập nhật", "details": {} } }
```

| HTTP | code thường gặp                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` (details là lỗi theo từng trường), `BAD_REQUEST`, `BAD_JSON`                                 |
| 401  | `UNAUTHORIZED`, `INVALID_CREDENTIALS`                                                                           |
| 403  | `FORBIDDEN`                                                                                                     |
| 404  | `NOT_FOUND` (cũng trả khi không phải thành viên dự án)                                                          |
| 409  | `EMAIL_TAKEN`, `VERSION_CONFLICT`, `COLUMN_NOT_EMPTY`, `ALREADY_MEMBER`, `ALREADY_INVITED`, `DUPLICATE`, `BUSY` |
| 429  | `TOO_MANY_REQUESTS` (sai đăng nhập/đăng ký quá 10 lần trong 15 phút)                                            |

## Tài khoản

| Method | Path             | Body                              | Trả về         |
| ------ | ---------------- | --------------------------------- | -------------- |
| POST   | `/auth/register` | `{ email, password (>=8), name }` | 201 `{ user }` |
| POST   | `/auth/login`    | `{ email, password }`             | `{ user }`     |
| POST   | `/auth/logout`   |                                   | 204            |
| GET    | `/auth/me`       |                                   | `{ user }`     |
| PATCH  | `/users/me`      | `{ name?, avatarUrl? }`           | `{ user }`     |

## Dự án

| Method | Path                   | Quyền      | Body / Query                           | Trả về                                                                 |
| ------ | ---------------------- | ---------- | -------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/projects`            |            | `?q=`                                  | `{ items: [{ id, name, description, role, memberCount, updatedAt }] }` |
| POST   | `/projects`            |            | `{ name, description? }`               | 201 `{ project }` (kèm 3 cột mặc định)                                 |
| GET    | `/projects/:projectId` | thành viên |                                        | `{ project }` (có `role` của mình)                                     |
| PATCH  | `/projects/:projectId` | chủ        | `{ name?, description? }`              | `{ project }`                                                          |
| DELETE | `/projects/:projectId` | chủ        | `{ confirmName }` phải trùng tên dự án | 204                                                                    |

## Thành viên và lời mời

| Method | Path                                              | Quyền                       | Body                           | Trả về                                          |
| ------ | ------------------------------------------------- | --------------------------- | ------------------------------ | ----------------------------------------------- |
| GET    | `/projects/:projectId/members`                    | thành viên                  |                                | `{ items: [{ userId, role, joinedAt, user }] }` |
| DELETE | `/projects/:projectId/members/:userId`            | chủ                         |                                | 204                                             |
| POST   | `/projects/:projectId/members/leave`              | thành viên (không phải chủ) |                                | 204                                             |
| POST   | `/projects/:projectId/members/transfer-ownership` | chủ                         | `{ userId }`                   | `{ items }`                                     |
| GET    | `/projects/:projectId/invitations`                | chủ                         |                                | lời mời đang chờ                                |
| POST   | `/projects/:projectId/invitations`                | chủ                         | `{ email }` (email đã đăng ký) | 201 `{ invitation }`                            |
| DELETE | `/projects/:projectId/invitations/:invitationId`  | chủ                         |                                | 204                                             |
| GET    | `/invitations`                                    |                             |                                | lời mời đang chờ của mình                       |
| POST   | `/invitations/:id/accept`                         | người được mời              |                                | `{ projectId, status }`                         |
| POST   | `/invitations/:id/decline`                        | người được mời              |                                | `{ projectId, status }`                         |

Lời mời hết hạn sau 7 ngày.

## Bảng, cột, công việc (mọi thành viên)

| Method | Path                                          | Body / Query                                            | Trả về                                                         |
| ------ | --------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/projects/:projectId/board`                  | `?q=&assigneeId=<id hoặc none>&labelId=&overdue=true`   | `{ columns: [{ ...column, tasks: [...] }], labels, filtered }` |
| POST   | `/projects/:projectId/columns`                | `{ name, isDone? }`                                     | 201 `{ column }`                                               |
| PATCH  | `/projects/:projectId/columns/:columnId`      | `{ name?, isDone? }`                                    | `{ column }`                                                   |
| POST   | `/projects/:projectId/columns/:columnId/move` | `{ toIndex }`                                           | `{ columnIds }`                                                |
| DELETE | `/projects/:projectId/columns/:columnId`      |                                                         | 204, cột phải trống                                            |
| POST   | `/projects/:projectId/tasks`                  | `{ columnId, title, assigneeId?, dueDate?, labelIds? }` | 201 `{ task }`                                                 |
| GET    | `/projects/:projectId/tasks/:taskId`          |                                                         | `{ task }`                                                     |
| PATCH  | `/projects/:projectId/tasks/:taskId`          | `{ version, title?, assigneeId?, dueDate?, labelIds? }` | `{ task }` hoặc 409                                            |
| POST   | `/projects/:projectId/tasks/:taskId/move`     | `{ toColumnId, toIndex }`                               | `{ task, columns: [{ columnId, taskIds }] }`                   |
| DELETE | `/projects/:projectId/tasks/:taskId`          |                                                         | 204                                                            |

Một task trả về có dạng:

```json
{
  "id": "...",
  "projectId": "...",
  "columnId": "...",
  "title": "Viết API",
  "descriptionText": "bản text của mô tả Yjs",
  "position": 0,
  "assigneeId": "...",
  "assignee": { "id": "...", "name": "Bảo", "email": "...", "avatarUrl": null },
  "dueDate": "2026-10-20T00:00:00.000Z",
  "labels": [{ "id": "...", "name": "Backend", "color": "#10b981" }],
  "createdById": "...",
  "version": 3,
  "isOverdue": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Sửa thẻ:** luôn gửi `version` đang có. Nếu nhận 409 `VERSION_CONFLICT`, `error.details.current` là bản mới nhất trên server; client giữ bản nháp, cho người dùng xem bản mới rồi gửi lại với version mới.

**Kéo thẻ:** client có thể hiển thị tạm vị trí mới, nhưng phải lấy `columns` server trả về (hoặc sự kiện `task:moved`) làm chuẩn. Nếu lỗi thì hoàn lại vị trí cũ.

**Mô tả công việc** không sửa qua API này mà sửa qua Yjs. `descriptionText` chỉ để hiển thị trên thẻ.

## Nhãn

| Method | Path                                   | Body                                                                        |
| ------ | -------------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/labels`          |                                                                             |
| POST   | `/projects/:projectId/labels`          | `{ name, color: "#RRGGBB" }`                                                |
| PATCH  | `/projects/:projectId/labels/:labelId` | `{ name?, color? }`                                                         |
| DELETE | `/projects/:projectId/labels/:labelId` | Các thẻ đang gắn nhãn sẽ tăng `version` và được phát lại qua `task:updated` |

## Bình luận, chat, lịch sử

Các danh sách sắp xếp mới nhất trước, tải theo đợt: `?limit=30&cursor=<nextCursor của lần trước>`. Kết quả có dạng `{ items, nextCursor }`, `nextCursor = null` nghĩa là hết.

| Method | Path                                                     | Body                                 |
| ------ | -------------------------------------------------------- | ------------------------------------ |
| GET    | `/projects/:projectId/tasks/:taskId/comments`            |                                      |
| POST   | `/projects/:projectId/tasks/:taskId/comments`            | `{ content, clientId? }`             |
| PATCH  | `/projects/:projectId/tasks/:taskId/comments/:commentId` | `{ content }` (chỉ tác giả)          |
| DELETE | `/projects/:projectId/tasks/:taskId/comments/:commentId` | tác giả hoặc chủ dự án               |
| GET    | `/projects/:projectId/messages`                          |                                      |
| POST   | `/projects/:projectId/messages`                          | `{ content, clientId? }`             |
| GET    | `/projects/:projectId/activity`                          | `?taskId=` để lọc theo một công việc |

`clientId` là id do client tự sinh (ví dụ `crypto.randomUUID()`). Gửi lại cùng `clientId` sẽ trả về bản đã lưu (HTTP 200) thay vì tạo bản trùng. Client dùng giá trị này để khớp tin nhắn tạm với tin đã lưu.
