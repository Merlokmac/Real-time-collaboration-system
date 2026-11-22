import request from 'supertest';
import { app, closeDb, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const OLD = 'matkhau123';
const NEW = 'matkhaumoi456';

// Đăng nhập thêm một "thiết bị" nữa cho cùng tài khoản
async function loginAgain(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: OLD }).expect(200);
  return agent;
}

describe('Đổi mật khẩu', () => {
  it('đổi được, mật khẩu cũ hết dùng, phiên đang dùng giữ nguyên', async () => {
    const { agent, user } = await signUp('an');
    const res = await agent.patch('/api/auth/password').send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);

    await request(app).post('/api/auth/login').send({ email: user.email, password: OLD }).expect(401);
    await request(app).post('/api/auth/login').send({ email: user.email, password: NEW }).expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('từ chối khi sai mật khẩu hiện tại, mật khẩu mới trùng cũ hoặc quá ngắn', async () => {
    const { agent, user } = await signUp('binh');

    const wrong = await agent.patch('/api/auth/password').send({ currentPassword: 'saimatkhau', newPassword: NEW });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');

    const same = await agent.patch('/api/auth/password').send({ currentPassword: OLD, newPassword: OLD });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('SAME_PASSWORD');

    const short = await agent.patch('/api/auth/password').send({ currentPassword: OLD, newPassword: '123' });
    expect(short.status).toBe(400);
    expect(short.body.error.details).toHaveProperty('newPassword');

    // Mật khẩu cũ vẫn dùng được vì chưa đổi gì
    await request(app).post('/api/auth/login').send({ email: user.email, password: OLD }).expect(200);
  });

  it('chưa đăng nhập thì 401', async () => {
    await request(app).patch('/api/auth/password').send({ currentPassword: OLD, newPassword: NEW }).expect(401);
  });

  it('đăng xuất các thiết bị khác nhưng giữ thiết bị đang dùng', async () => {
    const { agent, user } = await signUp('cuong');
    const phone = await loginAgain(user.email);
    const laptop = await loginAgain(user.email);
    await phone.get('/api/auth/me').expect(200);

    const res = await agent.patch('/api/auth/password').send({ currentPassword: OLD, newPassword: NEW });
    expect(res.body).toEqual({ revokedSessions: 2 });

    await phone.get('/api/auth/me').expect(401);
    await laptop.get('/api/auth/me').expect(401);
    await agent.get('/api/auth/me').expect(200);
  });

  it('không đụng tới phiên của người khác', async () => {
    const { agent } = await signUp('dung');
    const other = await signUp('em');

    await agent.patch('/api/auth/password').send({ currentPassword: OLD, newPassword: NEW }).expect(200);
    await other.agent.get('/api/auth/me').expect(200);
  });
});

describe('Đăng xuất các thiết bị khác', () => {
  it('xóa các phiên khác, giữ phiên đang dùng, mật khẩu không đổi', async () => {
    const { agent, user } = await signUp('giang');
    const phone = await loginAgain(user.email);

    const res = await agent.post('/api/auth/logout-all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revokedSessions: 1 });

    await phone.get('/api/auth/me').expect(401);
    await agent.get('/api/auth/me').expect(200);
    await request(app).post('/api/auth/login').send({ email: user.email, password: OLD }).expect(200);
  });
});
