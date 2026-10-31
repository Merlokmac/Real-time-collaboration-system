import request from 'supertest';
import { app, closeDb, resetDb, signUp } from './helpers';

beforeAll(resetDb);
afterAll(closeDb);

describe('Lỗi HTTP chung', () => {
  it('health báo cả trạng thái database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });

  it('JSON sai cú pháp trả 400 BAD_JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.vn",');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  it('body quá 1MB trả 413 thay vì lỗi máy chủ', async () => {
    const { agent } = await signUp('big');
    const res = await agent.post('/api/projects').send({ name: 'x', description: 'a'.repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
