import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { uploadsRoot } from '../src/lib/uploads';
import { app, closeDb, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(async () => {
  fs.rmSync(uploadsRoot, { recursive: true, force: true });
  await closeDb();
});

// Ảnh PNG 1x1 hợp lệ
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const fileOf = (url: string) => path.join(uploadsRoot, 'avatars', path.basename(url));

describe('Ảnh đại diện', () => {
  it('tải ảnh lên, xem được qua đường dẫn trả về', async () => {
    const { agent } = await signUp('anh');
    const res = await agent.post('/api/users/me/avatar').attach('avatar', PNG, 'mat-cuoi.png');

    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toMatch(/^\/api\/uploads\/avatars\/.+\.png$/);

    const img = await request(app).get(res.body.user.avatarUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await agent.get('/api/auth/me')).body.user.avatarUrl).toBe(res.body.user.avatarUrl);
  });

  it('đổi ảnh mới thì xóa file ảnh cũ', async () => {
    const { agent } = await signUp('doi');
    const first = (await agent.post('/api/users/me/avatar').attach('avatar', PNG, 'a.png')).body.user.avatarUrl;
    const second = (await agent.post('/api/users/me/avatar').attach('avatar', PNG, 'b.png')).body.user.avatarUrl;

    expect(second).not.toBe(first);
    expect(fs.existsSync(fileOf(first))).toBe(false);
    expect(fs.existsSync(fileOf(second))).toBe(true);
  });

  it('xóa ảnh đại diện', async () => {
    const { agent } = await signUp('xoa');
    const url = (await agent.post('/api/users/me/avatar').attach('avatar', PNG, 'a.png')).body.user.avatarUrl;

    const res = await agent.delete('/api/users/me/avatar');
    expect(res.body.user.avatarUrl).toBeNull();
    expect(fs.existsSync(fileOf(url))).toBe(false);
  });

  it('file giả ảnh, file quá lớn, thiếu file đều bị từ chối', async () => {
    const { agent } = await signUp('sai');

    const fake = await agent
      .post('/api/users/me/avatar')
      .attach('avatar', Buffer.from('day khong phai anh'), { filename: 'gia.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_IMAGE');

    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await agent.post('/api/users/me/avatar').attach('avatar', big, 'to.png');
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');

    await agent.post('/api/users/me/avatar').expect(400);
  });

  it('chưa đăng nhập không tải ảnh được', async () => {
    await request(app).post('/api/users/me/avatar').attach('avatar', PNG, 'a.png').expect(401);
  });
});
