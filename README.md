# Real-time collaboration system

Hệ thống quản lý nhiều dự án bằng bảng Kanban, cộng tác thời gian thực: nhiều người cùng thao tác trên bảng, cùng soạn mô tả công việc, chat theo dự án và xem lịch sử hoạt động.

## Cấu trúc

```
.
├── docker-compose.yml   PostgreSQL cho môi trường dev
├── server/              backend: API, database, lưu tài liệu Yjs
│   ├── prisma/          schema database, migrations, dữ liệu mẫu
│   ├── src/             mã nguồn
│   ├── tests/           test API
│   └── docs/            tài liệu API và realtime
└── client/              frontend React (đang làm)
```

## Bắt đầu

- Cài đặt và chạy backend: xem [`server/README.md`](server/README.md)
- Danh sách API cho frontend: [`server/docs/API.md`](server/docs/API.md)
- Hợp đồng sự kiện realtime: [`server/docs/REALTIME.md`](server/docs/REALTIME.md)

Tóm tắt nhanh cho người đã có Node 20+ và Docker Desktop:

```bash
docker compose up -d db
cd server
cp .env.example .env            # rồi đổi SESSION_SECRET, xem server/README.md mục 2.3
cp .env.test.example .env.test
npm install
npx prisma migrate dev
npm run db:seed
npm run dev                     # http://localhost:4000/api/health
```