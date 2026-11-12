import { addMember, closeDb, createProject, resetDb, signUp, type Agent } from './helpers';
import { buildStats } from '../src/modules/stats/stats.format';

describe('buildStats (tính toán thuần)', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const day = (n: number) => new Date(now.getTime() + n * 86400000);
  const columns = [
    { id: 'c1', name: 'Cần làm', isDone: false },
    { id: 'c2', name: 'Xong', isDone: true },
  ];
  const members = [
    { id: 'u1', name: 'An', avatarUrl: null },
    { id: 'u2', name: 'Bình', avatarUrl: null },
  ];

  it('dự án chưa có thẻ thì mọi số đều bằng 0', () => {
    const s = buildStats(columns, [], members, now);
    expect(s).toMatchObject({ total: 0, done: 0, overdue: 0, dueSoon: 0, unassigned: 0, completionRate: 0 });
    expect(s.byColumn.map((c) => c.count)).toEqual([0, 0]);
  });

  it('thẻ trong cột xong không bao giờ tính là quá hạn hay sắp đến hạn', () => {
    const tasks = [
      { columnId: 'c1', assigneeId: 'u1', dueDate: day(-1) }, // quá hạn
      { columnId: 'c1', assigneeId: 'u1', dueDate: day(3) }, // sắp đến hạn
      { columnId: 'c1', assigneeId: 'u1', dueDate: day(20) }, // còn xa
      { columnId: 'c2', assigneeId: 'u2', dueDate: day(-5) }, // đã xong
      { columnId: 'c1', assigneeId: null, dueDate: null },
    ];
    const s = buildStats(columns, tasks, members, now);

    expect(s).toMatchObject({ total: 5, done: 1, overdue: 1, dueSoon: 1, unassigned: 1, completionRate: 20 });
    expect(s.byColumn.map((c) => c.count)).toEqual([4, 1]);
    expect(s.byAssignee).toEqual([
      expect.objectContaining({ userId: 'u1', total: 3, done: 0, overdue: 1 }),
      expect.objectContaining({ userId: 'u2', total: 1, done: 1, overdue: 0 }),
    ]);
  });
});

describe('GET /projects/:id/stats', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  const DAY = 24 * 60 * 60 * 1000;
  async function newTask(agent: Agent, projectId: string, columnId: string, title: string, extra: object = {}) {
    const res = await agent.post(`/api/projects/${projectId}/tasks`).send({ columnId, title, ...extra });
    expect(res.status).toBe(201);
  }

  it('thành viên xem được số liệu của dự án, người ngoài nhận 404', async () => {
    const a = await signUp('a');
    const b = await signUp('b');
    const outsider = await signUp('ngoai');
    const { project, columns } = await createProject(a.agent);
    await addMember(a.agent, project.id, b);

    const past = new Date(Date.now() - 2 * DAY).toISOString();
    await newTask(a.agent, project.id, columns[0].id, 'Quá hạn', { assigneeId: a.user.id, dueDate: past });
    await newTask(a.agent, project.id, columns[2].id, 'Đã xong', { assigneeId: b.user.id, dueDate: past });
    await newTask(a.agent, project.id, columns[1].id, 'Chưa giao');

    const res = await b.agent.get(`/api/projects/${project.id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ total: 3, done: 1, overdue: 1, unassigned: 1, completionRate: 33 });
    expect(res.body.stats.byColumn.map((c: { count: number }) => c.count)).toEqual([1, 1, 1]);
    expect(res.body.stats.byAssignee).toEqual([
      expect.objectContaining({ userId: a.user.id, total: 1, overdue: 1 }),
      expect.objectContaining({ userId: b.user.id, total: 1, done: 1 }),
    ]);

    await outsider.agent.get(`/api/projects/${project.id}/stats`).expect(404);
  });
});
