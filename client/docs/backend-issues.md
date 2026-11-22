# Khác biệt / đề xuất với backend

Ghi lại chỗ tài liệu `server/docs/API.md` khác code backend, hoặc API còn thiếu. Huân chuyển cho Người 2.
Frontend đang làm theo **code backend**.

| # | Endpoint | Hiện tại (code) | Mong muốn | Lý do | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| 1 | `PATCH /projects/:projectId` | Trả `{ project }` là bản ghi thô, **không có** `role` và `memberCount` (khác `GET /projects/:projectId`) | Trả cùng dạng với GET (có `role`, `memberCount`), hoặc ghi rõ trong API.md | Frontend phải gộp tay với dữ liệu cũ; sự kiện `project:updated` cũng mang bản thiếu 2 trường này | Chưa báo |
| 2 | `PATCH /users/me` | `avatarUrl` chỉ kiểm tra `z.string().url()`, nên nhận cả `javascript:...`, `data:...` | Chỉ nhận `http://` / `https://` | An toàn khi người khác hiển thị ảnh/đường dẫn này. Frontend đã chặn ở form hồ sơ nhưng server vẫn nên chặn | Chưa báo |
| 3 | `DELETE /projects/:projectId/columns/:columnId` | Xóa cột cuối cùng của dự án trả 400 `BAD_REQUEST` "Dự án cần ít nhất một cột" | Ghi vào API.md (bảng mã lỗi / mục cột) | API.md chỉ nói "cột phải trống"; frontend đã hiện message của server trong hộp thoại xóa | Chưa báo |
| 4 | `POST/PATCH /projects/:projectId/labels` | Tên nhãn trùng → 409 `DUPLICATE` với message chung "Dữ liệu đã tồn tại" (không nói là nhãn hay tên) | Message riêng, ví dụ "Đã có nhãn tên này" | Frontend tự đổi thành "Đã có nhãn tên này" theo mã `DUPLICATE`; nếu sau này endpoint khác cũng trả `DUPLICATE` thì câu này sẽ sai ngữ cảnh | Chưa báo |
| 5 | `DELETE /projects/:projectId/labels/:labelId` | Không có cách biết có bao nhiêu thẻ đang dùng nhãn (chỉ ghi `taskCount` vào log hoạt động) | Trả số thẻ ở `GET /labels` (ví dụ `taskCount`) hoặc endpoint đếm | Hộp xác nhận xóa nhãn hiện số thẻ; client chỉ đếm được trên thẻ đang có (khi đang lọc ghi "ít nhất N thẻ") | Chưa báo |
| 6 | `POST/PATCH /projects/:projectId/labels` | Lỗi `VALIDATION_ERROR` có `details.name` là câu tiếng Anh của zod ("String must contain at most 30 character(s)") | Message tiếng Việt | Frontend đã kiểm tra tên nhãn 1–30 ký tự trước khi gửi nên ít khi gặp, nhưng nếu gặp sẽ hiện nguyên câu tiếng Anh | Chưa báo |
