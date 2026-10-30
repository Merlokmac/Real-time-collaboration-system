# Khác biệt / đề xuất với backend

Ghi lại chỗ tài liệu `server/docs/API.md` khác code backend, hoặc API còn thiếu. Huân chuyển cho Người 2.
Frontend đang làm theo **code backend**.

| # | Endpoint | Hiện tại (code) | Mong muốn | Lý do | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| 1 | `PATCH /projects/:projectId` | Trả `{ project }` là bản ghi thô, **không có** `role` và `memberCount` (khác `GET /projects/:projectId`) | Trả cùng dạng với GET (có `role`, `memberCount`), hoặc ghi rõ trong API.md | Frontend phải gộp tay với dữ liệu cũ; sự kiện `project:updated` cũng mang bản thiếu 2 trường này | Chưa báo |
| 2 | `PATCH /users/me` | `avatarUrl` chỉ kiểm tra `z.string().url()`, nên nhận cả `javascript:...`, `data:...` | Chỉ nhận `http://` / `https://` | An toàn khi người khác hiển thị ảnh/đường dẫn này. Frontend đã chặn ở form hồ sơ nhưng server vẫn nên chặn | Chưa báo |
