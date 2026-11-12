import request from 'supertest';
import { addMember, app, closeDb, createProject, resetDb, signUp, type Agent } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const titles = (res: { body: { items: { title: string }[] } }) => res.body.items.map((t) => t.title);

async function newTask(agent: Agent, projectId: string, columnId: string, title: string, extra: object = {}) {
  const res = await agent.post(`/api/projects/${projectId}/tasks`).send({ columnId, title, ...extra });
  expect(res.status).toBe(201);
  return res.body.task as { id: string };
}

// a làm chủ hai dự án, b chỉ ở dự án 1
async function setup() {
  const a = await signUp('a');
  const b = await signUp('b');
  const p1 = await createProject(a.agent, 'Dự án 1');
  const p2 = await createProject(a.agent, 'Dự án 2');
  await addMember(a.agent, p1.project.id, b);

  const me = { assigneeId: a.user.id };
  await newTask(a.agent, p1.project.id, p1.columns[0].id, 'Có hạn xa', { ...me, dueDate: inDays(10) });
  await newTask(a.agent, p1.project.id, p1.columns[0].id, 'Quá hạn', { ...me, dueDate: inDays(-2) });
  await newTask(a.agent, p1.project.id, p1.columns[2].id, 'Đã xong', { ...me, dueDate: inDays(1) });
  await newTask(a.agent, p2.project.id, p2.columns[0].id, 'Không hạn', me);
  await newTask(a.agent, p1.project.id, p1.columns[0].id, 'Của b', { assigneeId: b.user.id });
  return { a, b, p1, p2 };
}

describe('Việc của tôi', () => {
  it('gom việc của mình ở mọi dự án, chưa xong, gần hạn lên đầu, không hạn xếp cuối', async () => {
    const { a, p1 } = await setup();
    const res = await a.agent.get('/api/users/me/tasks');

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Quá hạn', 'Có hạn xa', 'Không hạn']);
    expect(res.body.items[0]).toMatchObject({
      isOverdue: true,
      project: { id: p1.project.id, name: 'Dự án 1' },
      column: { name: 'Cần làm', isDone: false },
    });
  });

  it('không lẫn việc của người khác', async () => {
    const { b } = await setup();
    const res = await b.agent.get('/api/users/me/tasks');
    expect(titles(res)).toEqual(['Của b']);
  });

  it('lọc theo trạng thái và quá hạn', async () => {
    const { a } = await setup();

    expect(titles(await a.agent.get('/api/users/me/tasks?status=done'))).toEqual(['Đã xong']);
    expect((await a.agent.get('/api/users/me/tasks?status=all')).body.items).toHaveLength(4);
    expect(titles(await a.agent.get('/api/users/me/tasks?overdue=true'))).toEqual(['Quá hạn']);
    expect(await a.agent.get('/api/users/me/tasks?limit=2').then((r) => r.body.items)).toHaveLength(2);
  });

  it('tham số sai bị từ chối, chưa đăng nhập thì 401', async () => {
    const { a } = await setup();
    const bad = await a.agent.get('/api/users/me/tasks?status=abc');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    await request(app).get('/api/users/me/tasks').expect(401);
  });
});
