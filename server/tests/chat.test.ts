import { closeDb, createProject, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

describe('Chat, bình luận, lịch sử', () => {
  it('gửi lại cùng clientId không tạo tin nhắn trùng', async () => {
    const a = await signUp('a');
    const { project } = await createProject(a.agent);
    const base = `/api/projects/${project.id}`;

    const first = await a.agent.post(`${base}/messages`).send({ content: 'xin chào', clientId: 'm-1' });
    const retry = await a.agent.post(`${base}/messages`).send({ content: 'xin chào', clientId: 'm-1' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.message.id).toBe(first.body.message.id);

    const list = await a.agent.get(`${base}/messages`);
    expect(list.body.items).toHaveLength(1);
  });

  it('tải lịch sử chat theo từng đợt', async () => {
    const a = await signUp('a');
    const { project } = await createProject(a.agent);
    const base = `/api/projects/${project.id}`;
    for (let i = 0; i < 5; i++) {
      await a.agent.post(`${base}/messages`).send({ content: `m${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }

    const page1 = await a.agent.get(`${base}/messages?limit=3`);
    expect(page1.body.items.map((m: { content: string }) => m.content)).toEqual(['m4', 'm3', 'm2']);
    const page2 = await a.agent.get(`${base}/messages?limit=3&cursor=${page1.body.nextCursor}`);
    expect(page2.body.items.map((m: { content: string }) => m.content)).toEqual(['m1', 'm0']);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('bình luận theo công việc và lịch sử hoạt động được ghi', async () => {
    const a = await signUp('a');
    const { project, columns } = await createProject(a.agent);
    const base = `/api/projects/${project.id}`;
    const task = (await a.agent.post(`${base}/tasks`).send({ columnId: columns[0].id, title: 'Việc' })).body.task;

    await a.agent.post(`${base}/tasks/${task.id}/comments`).send({ content: 'ok' }).expect(201);
    const comments = await a.agent.get(`${base}/tasks/${task.id}/comments`);
    expect(comments.body.items).toHaveLength(1);

    const activity = await a.agent.get(`${base}/activity`);
    const actions = activity.body.items.map((l: { action: string }) => l.action);
    expect(actions.sort()).toEqual(['comment.created', 'project.created', 'task.created']);

    const taskActivity = await a.agent.get(`${base}/activity?taskId=${task.id}`);
    expect(taskActivity.body.items).toHaveLength(2);
  });
});
