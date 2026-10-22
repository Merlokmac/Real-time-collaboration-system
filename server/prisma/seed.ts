import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = 'matkhau123';

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function main() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, projects, user_sessions RESTART IDENTITY CASCADE',
  );

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [huan, bao, toan] = await Promise.all(
    [
      { email: 'huan@demo.vn', name: 'Huân' },
      { email: 'bao@demo.vn', name: 'Bảo' },
      { email: 'toan@demo.vn', name: 'Toàn' },
    ].map((u) => prisma.user.create({ data: { ...u, passwordHash } })),
  );

  const web = await prisma.project.create({
    data: {
      name: 'Đồ án Công nghệ Web',
      description: 'Hệ thống Kanban cộng tác thời gian thực',
      createdById: bao.id,
      members: {
        create: [
          { userId: bao.id, role: 'OWNER' },
          { userId: huan.id, role: 'MEMBER' },
          { userId: toan.id, role: 'MEMBER' },
        ],
      },
      columns: {
        create: [
          { name: 'Cần làm', position: 0 },
          { name: 'Đang làm', position: 1 },
          { name: 'Hoàn thành', position: 2, isDone: true },
        ],
      },
      labels: {
        create: [
          { name: 'Frontend', color: '#3b82f6' },
          { name: 'Backend', color: '#10b981' },
          { name: 'Realtime', color: '#f59e0b' },
        ],
      },
    },
    include: { columns: { orderBy: { position: 'asc' } }, labels: true },
  });

  const [todo, doing, done] = web.columns;
  const label = (name: string) => web.labels.find((l) => l.name === name)!.id;

  const tasks = [
    { columnId: todo.id, title: 'Làm chat', assigneeId: toan.id, dueDate: days(7), labels: ['Realtime'] },
    { columnId: todo.id, title: 'Kiểm thử hệ thống', assigneeId: huan.id, dueDate: days(12), labels: [] },
    { columnId: doing.id, title: 'Thiết kế giao diện', assigneeId: huan.id, dueDate: days(2), labels: ['Frontend'] },
    { columnId: doing.id, title: 'Viết API', assigneeId: bao.id, dueDate: days(-1), labels: ['Backend'] },
    { columnId: done.id, title: 'Tạo GitHub nhóm', assigneeId: bao.id, dueDate: null, labels: [] },
    { columnId: done.id, title: 'Mô tả đề tài', assigneeId: toan.id, dueDate: null, labels: [] },
  ];

  const position = new Map<string, number>();
  for (const t of tasks) {
    const pos = position.get(t.columnId) ?? 0;
    position.set(t.columnId, pos + 1);
    await prisma.task.create({
      data: {
        projectId: web.id,
        columnId: t.columnId,
        title: t.title,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
        createdById: bao.id,
        position: pos,
        labels: { create: t.labels.map((name) => ({ labelId: label(name) })) },
      },
    });
  }

  await prisma.message.createMany({
    data: [
      { projectId: web.id, authorId: bao.id, content: 'API đăng nhập xong rồi nhé' },
      { projectId: web.id, authorId: huan.id, content: 'Ok mình nối giao diện luôn' },
    ],
  });

  // Dự án thứ hai chỉ có Huân, dùng để kiểm tra tách quyền giữa các dự án
  await prisma.project.create({
    data: {
      name: 'Dự án riêng của Huân',
      createdById: huan.id,
      members: { create: { userId: huan.id, role: 'OWNER' } },
      columns: {
        create: [
          { name: 'Cần làm', position: 0 },
          { name: 'Đang làm', position: 1 },
          { name: 'Hoàn thành', position: 2, isDone: true },
        ],
      },
    },
  });

  console.log(`Đã tạo dữ liệu mẫu. Đăng nhập bằng huan@demo.vn / bao@demo.vn / toan@demo.vn, mật khẩu ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
