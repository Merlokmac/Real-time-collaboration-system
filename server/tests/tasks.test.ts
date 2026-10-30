import { addMember, closeDb, createProject, resetDb, signUp, type Agent } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

async function setup() {
  const a = await signUp('a');
  const b = await signUp('b');
  const { project, columns } = await createProject(a.agent);
  await addMember(a.agent, project.id, b);
  const base = `/api/projects/${project.id}`;
  return { a, b, project, columns, base };
}

async function newTask(agent: Agent, base: string, columnId: string, title: string, extra: object = {}) {
  const res = await agent.post(`${base}/tasks`).send({ columnId, title, ...extra });
  expect(res.status).toBe(201);
  return res.body.task as { id: string; version: number; position: number };
}

async function boardOrder(agent: Agent, base: string) {
  const res = await agent.get(`${base}/board`);
  return res.body.columns.map((c: { tasks: { id: string; position: number }[] }) => c.tasks);
}

describe('Công việc', () => {
  it('tạo thẻ nối vào cuối cột', async () => {
    const { a, columns, base } = await setup();
    const t1 = await newTask(a.agent, base, columns[0].id, 'Một');
    const t2 = await newTask(a.agent, base, columns[0].id, 'Hai');
    expect([t1.position, t2.position]).toEqual([0, 1]);
  });

  it('hai người sửa cùng version: người sau nhận 409 kèm bản hiện tại', async () => {
    const { a, b, columns, base } = await setup();
    const task = await newTask(a.agent, base, columns[0].id, 'Gốc');

    const r1 = await a.agent.patch(`${base}/tasks/${task.id}`).send({ version: task.version, title: 'Của A' });
    expect(r1.status).toBe(200);
    expect(r1.body.task.version).toBe(task.version + 1);

    const r2 = await b.agent.patch(`${base}/tasks/${task.id}`).send({ version: task.version, title: 'Của B' });
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('VERSION_CONFLICT');
    expect(r2.body.error.details.current.title).toBe('Của A');
  });

  it('gửi đồng thời cùng version chỉ một yêu cầu thành công', async () => {
    const { a, b, columns, base } = await setup();
    const task = await newTask(a.agent, base, columns[0].id, 'Gốc');

    const results = await Promise.all([
      a.agent.patch(`${base}/tasks/${task.id}`).send({ version: 1, title: 'A' }),
      b.agent.patch(`${base}/tasks/${task.id}`).send({ version: 1, title: 'B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('người phụ trách phải là thành viên, nhãn phải thuộc dự án', async () => {
    const { a, columns, base } = await setup();
    const outsider = await signUp('out');
    const other = await createProject(outsider.agent);
    const foreignLabel = await outsider.agent
      .post(`/api/projects/${other.project.id}/labels`)
      .send({ name: 'L', color: '#ff0000' });

    await a.agent
      .post(`${base}/tasks`)
      .send({ columnId: columns[0].id, title: 'x', assigneeId: outsider.user.id })
      .expect(400);
    await a.agent
      .post(`${base}/tasks`)
      .send({ columnId: columns[0].id, title: 'x', labelIds: [foreignLabel.body.label.id] })
      .expect(400);
  });

  it('kéo thẻ sang cột khác và đổi thứ tự', async () => {
    const { a, columns, base } = await setup();
    const t1 = await newTask(a.agent, base, columns[0].id, '1');
    const t2 = await newTask(a.agent, base, columns[0].id, '2');
    const t3 = await newTask(a.agent, base, columns[1].id, '3');

    const moved = await a.agent.post(`${base}/tasks/${t1.id}/move`).send({ toColumnId: columns[1].id, toIndex: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.columns).toEqual([
      { columnId: columns[0].id, taskIds: [t2.id] },
      { columnId: columns[1].id, taskIds: [t1.id, t3.id] },
    ]);

    await a.agent.post(`${base}/tasks/${t1.id}/move`).send({ toColumnId: columns[1].id, toIndex: 99 }).expect(200);
    const [col0, col1] = await boardOrder(a.agent, base);
    expect(col0.map((t: { id: string }) => t.id)).toEqual([t2.id]);
    expect(col1.map((t: { id: string; position: number }) => [t.id, t.position])).toEqual([
      [t3.id, 0],
      [t1.id, 1],
    ]);
  });

  it('nhiều lượt kéo đồng thời vẫn giữ thứ tự liền mạch, không mất thẻ', async () => {
    const { a, b, columns, base } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await newTask(a.agent, base, columns[0].id, `T${i}`)).id);

    await Promise.all(
      ids.map((id, i) =>
        (i % 2 ? a : b).agent.post(`${base}/tasks/${id}/move`).send({ toColumnId: columns[i % 3].id, toIndex: i % 2 }),
      ),
    );

    const cols = await boardOrder(a.agent, base);
    const all = cols
      .flat()
      .map((t: { id: string }) => t.id)
      .sort();
    expect(all).toEqual([...ids].sort());
    for (const tasks of cols) {
      expect(tasks.map((t: { position: number }) => t.position)).toEqual(tasks.map((_: unknown, i: number) => i));
    }
  });

  it('xóa thẻ dồn lại thứ tự cột', async () => {
    const { a, columns, base } = await setup();
    const t1 = await newTask(a.agent, base, columns[0].id, '1');
    const t2 = await newTask(a.agent, base, columns[0].id, '2');
    await a.agent.delete(`${base}/tasks/${t1.id}`).expect(204);
    const [col0] = await boardOrder(a.agent, base);
    expect(col0).toEqual([expect.objectContaining({ id: t2.id, position: 0 })]);
  });

  it('lọc theo tiêu đề, người phụ trách, nhãn và quá hạn', async () => {
    const { a, b, columns, base } = await setup();
    const label = (await a.agent.post(`${base}/labels`).send({ name: 'API', color: '#00aa00' })).body.label;
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    await newTask(a.agent, base, columns[0].id, 'Viết API đăng nhập', { labelIds: [label.id] });
    await newTask(a.agent, base, columns[0].id, 'Thiết kế', { assigneeId: b.user.id, dueDate: yesterday });
    await newTask(a.agent, base, columns[2].id, 'Xong rồi', { dueDate: yesterday });

    const count = async (qs: string) => {
      const res = await a.agent.get(`${base}/board?${qs}`);
      return res.body.columns.flatMap((c: { tasks: unknown[] }) => c.tasks).length;
    };
    expect(await count('q=api')).toBe(1);
    expect(await count(`assigneeId=${b.user.id}`)).toBe(1);
    expect(await count('assigneeId=none')).toBe(2);
    expect(await count(`labelId=${label.id}`)).toBe(1);
    // Thẻ ở cột hoàn thành không tính là quá hạn
    expect(await count('overdue=true')).toBe(1);
  });
});

describe('Cột', () => {
  it('thêm, đổi tên, sắp xếp, chỉ xóa cột trống', async () => {
    const { a, columns, base } = await setup();
    const extra = (await a.agent.post(`${base}/columns`).send({ name: 'Review' })).body.column;
    expect(extra.position).toBe(3);

    await a.agent.patch(`${base}/columns/${extra.id}`).send({ name: 'Kiểm tra' }).expect(200);

    const moved = await a.agent.post(`${base}/columns/${extra.id}/move`).send({ toIndex: 1 });
    expect(moved.body.columnIds).toEqual([columns[0].id, extra.id, columns[1].id, columns[2].id]);

    await newTask(a.agent, base, columns[0].id, 'còn việc');
    const blocked = await a.agent.delete(`${base}/columns/${columns[0].id}`);
    expect(blocked.body.error.code).toBe('COLUMN_NOT_EMPTY');

    await a.agent.delete(`${base}/columns/${extra.id}`).expect(204);
    const board = await a.agent.get(`${base}/board`);
    expect(board.body.columns.map((c: { position: number }) => c.position)).toEqual([0, 1, 2]);
  });
});
