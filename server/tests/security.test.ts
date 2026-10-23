import request from 'supertest';
import { app, closeDb, resetDb, signUp } from './helpers';

beforeAll(resetDb);
afterAll(closeDb);

describe('Bảo mật', () => {
  it('có các header bảo mật, không lộ Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('khóa tạm sau 10 lần đăng nhập sai, đăng nhập đúng trước đó không bị tính', async () => {
    const { user } = await signUp('limit');
    const login = (password: string) => request(app).post('/api/auth/login').send({ email: user.email, password });

    await login('matkhau123').expect(200);
    for (let i = 0; i < 10; i++) await login('saimatkhau').expect(401);

    const blocked = await login('matkhau123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
