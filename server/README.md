# Backend

Node.js + Express + TypeScript + Prisma + PostgreSQL.

- [1. Cần cài trước](#1-cần-cài-trước)
- [2. Cài đặt lần đầu](#2-cài-đặt-lần-đầu)
- [3. Mỗi lần làm việc](#3-mỗi-lần-làm-việc)
- [4. Lệnh hay dùng](#4-lệnh-hay-dùng)
- [5. Lỗi thường gặp](#5-lỗi-thường-gặp)
- [6. Tài liệu cho frontend và realtime](#6-tài-liệu-cho-frontend-và-realtime)

## 1. Cần cài trước

| Phần mềm | Phiên bản | Kiểm tra |
| --- | --- | --- |
| Node.js | 20 trở lên | `node -v` |
| Docker Desktop | bản mới | `docker -v` (Docker Desktop phải đang mở) |
| Git | bất kỳ | `git --version` |

Không có Docker thì có thể cài PostgreSQL 16 trực tiếp lên máy, xem mục [2.2](#22-bật-database).

## 2. Cài đặt lần đầu

### 2.1. Lấy code

```bash
git clone https://github.com/Merlokmac/Real-time-collaboration-system.git
cd Real-time-collaboration-system
```

### 2.2. Bật database

Ở **thư mục gốc repo** (nơi có `docker-compose.yml`):

```bash
docker compose up -d db
```

Lệnh này chạy PostgreSQL ở cổng `5432` và tự tạo sẵn hai database:

- `kanban`: dữ liệu khi chạy server
- `kanban_test`: dữ liệu khi chạy test (bị xóa sạch mỗi lần test)

Tài khoản database là `kanban` / `kanban`. Đây chỉ là mật khẩu cho database trên máy mình, không phải bí mật.

> **Máy đã có PostgreSQL khác dùng cổng 5432?** Mở `docker-compose.yml`, đổi `"5432:5432"` thành `"5433:5432"`, rồi ở bước 2.3 đổi `localhost:5432` thành `localhost:5433` trong cả `.env` và `.env.test`.
>
> **Không dùng Docker?** Cài PostgreSQL 16, tạo user `kanban` mật khẩu `kanban`, rồi tạo hai database `kanban` và `kanban_test` thuộc user đó.

### 2.3. Tạo file `.env` và `.env.test`

Hai file này chứa cấu hình riêng của từng máy nên **không có trên GitHub**. Mỗi người tự tạo từ file mẫu:

```bash
cd server

# macOS / Linux / Git Bash
cp .env.example .env
cp .env.test.example .env.test

# Windows PowerShell
Copy-Item .env.example .env
Copy-Item .env.test.example .env.test
```

Sau đó mở `.env` và sửa theo bảng dưới. Thường **chỉ cần đổi `SESSION_SECRET`**, các biến còn lại để nguyên nếu dùng Docker như bước 2.2.

| Biến | Ý nghĩa | Cần sửa? |
| --- | --- | --- |
| `NODE_ENV` | Môi trường chạy | Để `development` |
| `PORT` | Cổng của server | Để `4000`, trừ khi bị trùng |
| `DATABASE_URL` | Địa chỉ database, dạng `postgresql://user:matkhau@host:cong/tendb?schema=public` | Chỉ sửa nếu đổi cổng hoặc không dùng Docker |
| `SESSION_SECRET` | Chuỗi bí mật để ký cookie đăng nhập, dài tối thiểu 16 ký tự | **Có**, xem bên dưới |
| `CLIENT_ORIGIN` | Địa chỉ frontend được phép gọi API. Nhiều địa chỉ thì cách nhau bằng dấu phẩy | Để `http://localhost:5173` nếu frontend chạy Vite mặc định |
| `COOKIE_SAMESITE` | Chính sách cookie | Để `lax` khi chạy trên máy |
| `SESSION_MAX_AGE_DAYS` | Số ngày giữ đăng nhập | Để `7` |

**Tạo `SESSION_SECRET`:** chạy lệnh sau, rồi dán kết quả vào sau dấu `=`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
SESSION_SECRET=9f2c...chuỗi-vừa-tạo...
```

Mỗi người tự tạo chuỗi riêng cho máy mình, **không cần và không nên gửi cho nhau**. Bản online sẽ đặt một chuỗi khác trên trang quản lý hosting.

File `.env.test` để nguyên là chạy được. Lưu ý `DATABASE_URL` trong file này bắt buộc trỏ tới database có chữ `test` trong tên, để test không xóa nhầm dữ liệu thật.

### 2.4. Cài thư viện và tạo bảng

Vẫn ở thư mục `server`:

```bash
npm install
npx prisma migrate dev   # tạo bảng trong database kanban + sinh Prisma Client
npm run db:seed          # thêm dữ liệu mẫu
```

Dữ liệu mẫu gồm 3 tài khoản, cùng mật khẩu `matkhau123`:

| Email | Vai trò |
| --- | --- |
| `bao@demo.vn` | Chủ dự án "Đồ án Công nghệ Web" |
| `huan@demo.vn` | Thành viên dự án trên, và là chủ "Dự án riêng của Huân" |
| `toan@demo.vn` | Thành viên dự án "Đồ án Công nghệ Web" |

### 2.5. Chạy và kiểm tra

```bash
npm run dev
```

Mở trình duyệt vào http://localhost:4000/api/health. Thấy `{"ok":true}` là xong.

Vào http://localhost:4000 sẽ thấy lỗi `NOT_FOUND`. Đây là bình thường vì mọi API đều nằm dưới `/api`.

Kiểm tra lần cuối bằng test tự động (mở terminal khác, vẫn ở thư mục `server`):

```bash
npm test
```

Kết quả đúng là `Tests: 28 passed` (con số có thể tăng khi thêm test).

## 3. Mỗi lần làm việc

```bash
# ở thư mục gốc repo
git pull
docker compose up -d db

cd server
npm install              # phòng khi có thư viện mới
npx prisma migrate dev   # phòng khi có thay đổi bảng
npm run dev
```

Khi **chính mình** sửa `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name mo-ta-ngan   # ví dụ: --name them-cot-priority
```

Lệnh này sinh thư mục mới trong `prisma/migrations/`. Thư mục đó **phải commit lên GitHub** để người khác chạy `migrate dev` là có bảng mới.

**Không bao giờ commit:** `.env`, `.env.test`, `node_modules/`, `dist/`, `cookie*.txt`. Trước khi commit nên chạy `git status` để kiểm tra lại.

## 4. Lệnh hay dùng

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy server, tự khởi động lại khi sửa code |
| `npm test` | Chạy toàn bộ test |
| `npx jest tests/tasks.test.ts` | Chạy một file test |
| `npm run typecheck` | Kiểm tra lỗi kiểu TypeScript |
| `npm run db:seed` | Xóa sạch và tạo lại dữ liệu mẫu (cần đăng nhập lại sau đó) |
| `npm run db:studio` | Xem và sửa dữ liệu trên trình duyệt tại http://localhost:5555 |
| `npx prisma migrate reset` | Xóa database, tạo lại bảng từ đầu và chạy seed |
| `npm run build` rồi `npm start` | Build và chạy bản production |

## 5. Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| `Thiếu hoặc sai biến môi trường` khi chạy server | Chưa tạo `.env`, hoặc `SESSION_SECRET` ngắn hơn 16 ký tự. Làm lại bước 2.3 |
| `Can't reach database server at localhost:5432` | Docker Desktop chưa mở hoặc chưa chạy `docker compose up -d db`. Kiểm tra bằng `docker compose ps` |
| `port is already allocated` khi bật Docker | Cổng 5432 đã bị chiếm, đổi sang 5433 như hướng dẫn ở bước 2.2 |
| `database "kanban_test" does not exist` khi chạy test | Volume Docker được tạo trước khi có file tạo DB test. Chạy `docker compose exec db psql -U kanban -c "CREATE DATABASE kanban_test;"` ở thư mục gốc |
| `EADDRINUSE :::4000` | Đã có một server khác đang chạy ở cổng 4000. Tắt nó đi, hoặc đổi `PORT` trong `.env` |
| `@prisma/client did not initialize yet` | Chạy `npx prisma generate` |
| VS Code báo đỏ (ví dụ ở `tx`) nhưng `npm run typecheck` không lỗi | VS Code còn nhớ kiểu cũ. Bấm `Cmd/Ctrl + Shift + P` → **TypeScript: Restart TS Server**. Vẫn đỏ thì chọn **TypeScript: Select TypeScript Version** → **Use Workspace Version** |
| Frontend gọi API bị lỗi CORS, hoặc đã đăng nhập mà vẫn báo `UNAUTHORIZED` | Kiểm tra `CLIENT_ORIGIN` khớp đúng địa chỉ frontend (cả cổng). Phía frontend phải gửi kèm cookie: `credentials: 'include'` với fetch, `withCredentials: true` với axios |

## 6. Tài liệu cho frontend và realtime

- `docs/API.md`: toàn bộ endpoint, dạng dữ liệu, mã lỗi. Dành cho frontend.
- `docs/REALTIME.md`: các hàm và tên sự kiện mà phần Socket.IO / Yjs cần dùng.