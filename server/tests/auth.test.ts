import request from 'supertest';
import { app, closeDb, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

describe('Tài khoản', () => {
  it('đăng ký, xem thông tin, đăng xuất', async () => {
    const { agent, user } = await signUp('an');
    expect(user).not.toHaveProperty('passwordHash');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('không cho đăng ký trùng email, email không phân biệt hoa thường', async () => {
    const { user } = await signUp('binh');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: user.email.toUpperCase(), password: 'matkhau123', name: 'X' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('kiểm tra dữ liệu đầu vào', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'sai', password: '123', name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('email');
    expect(res.body.error.details).toHaveProperty('password');
  });

  it('sai mật khẩu trả 401, đúng thì đăng nhập được', async () => {
    const { user } = await signUp('cuong');
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'saimatkhau' }).expect(401);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password: 'matkhau123' }).expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('đổi tên và ảnh đại diện', async () => {
    const { agent } = await signUp('dung');
    const res = await agent.patch('/api/users/me').send({ name: 'Dũng', avatarUrl: 'https://example.com/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Dũng', avatarUrl: 'https://example.com/a.png' });
  });
});
