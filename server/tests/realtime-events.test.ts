import { addMember, closeDb, createProject, emitted, resetDb, signUp, type Agent } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const SOCKET = 'socket-cua-nguoi-thao-tac';

function sent(event: string) {
  return emitted.filter((e) => e.kind === 'toProject' && e.args[1] === event).map((e) => e.args);
}

async function setup() {
  const owner = await signUp('owner');
  const { project, columns } = await createProject(owner.agent);
  const base = `/api/projects/${project.id}`;
  emitted.length = 0;
  return { owner, project, columns, base };
}

async function newTask(agent: Agent, base: string, columnId: string, title: string, extra: object = {}) {
  const res = await agent
    .post(`${base}/tasks`)
    .set('x-socket-id', SOCKET)
    .send({ columnId, title, ...extra });
  expect(res.status).toBe(201);
  return res.body.task as { id: string; version: number };
}

describe('Sự kiện realtime phát từ API', () => {
  it('tạo và sửa thẻ: gửi cả phòng trừ socket vừa thao tác', async () => {
    const { owner, project, columns, base } = await setup();
    const task = await newTask(owner.agent, base, columns[0].id, 'Một');

    const [[pid, , payload, except]] = sent('task:created');
    expect(pid).toBe(project.id);
    expect(payload).toMatchObject({ id: task.id, title: 'Một', columnId: columns[0].id, isOverdue: false });
    expect(except).toBe(SOCKET);

    await owner.agent
      .patch(`${base}/tasks/${task.id}`)
      .set('x-socket-id', SOCKET)
      .send({ version: task.version, title: 'Hai' });
    const [[, , updated, exceptUpdate]] = sent('task:updated');
    expect(updated).toMatchObject({ id: task.id, title: 'Hai', version: task.version + 1 });
    expect(exceptUpdate).toBe(SOCKET);
  });

  it('kéo thẻ: gửi cho cả người kéo, kèm bố cục mới của các cột', async () => {
    const { owner, columns, base } = await setup();
    const a = await newTask(owner.agent, base, columns[0].id, 'A');
    const b = await newTask(owner.agent, base, columns[0].id, 'B');
    emitted.length = 0;

    await owner.agent
      .post(`${base}/tasks/${a.id}/move`)
      .set('x-socket-id', SOCKET)
      .send({ toColumnId: columns[1].id, toIndex: 0 })
      .expect(200);

    const [[, , payload, except]] = sent('task:moved');
    expect(except).toBeUndefined();
    expect(payload).toMatchObject({
      task: { id: a.id, columnId: columns[1].id },
      columns: [
        { columnId: columns[0].id, taskIds: [b.id] },
        { columnId: columns[1].id, taskIds: [a.id] },
      ],
    });
  });

  it('xóa thẻ: gửi thứ tự còn lại của cột', async () => {
    const { owner, columns, base } = await setup();
    const a = await newTask(owner.agent, base, columns[0].id, 'A');
    const b = await newTask(owner.agent, base, columns[0].id, 'B');
    emitted.length = 0;

    await owner.agent.delete(`${base}/tasks/${a.id}`).expect(204);
    const [[, , payload]] = sent('task:deleted');
    expect(payload).toEqual({ taskId: a.id, columnId: columns[0].id, taskIds: [b.id] });
  });

  it('cột: tạo, sắp xếp và xóa đều có sự kiện', async () => {
    const { owner, project, columns, base } = await setup();
    const col = (await owner.agent.post(`${base}/columns`).send({ name: 'Review' })).body.column;
    await owner.agent.post(`${base}/columns/${col.id}/move`).send({ toIndex: 0 }).expect(200);
    await owner.agent.delete(`${base}/columns/${col.id}`).expect(204);

    expect(sent('column:created')[0][2]).toMatchObject({ id: col.id, name: 'Review' });
    expect(sent('column:reordered')[0][2]).toEqual({
      projectId: project.id,
      columnIds: [col.id, ...columns.map((c) => c.id)],
    });
    expect(sent('column:deleted')[0][2]).toEqual({
      projectId: project.id,
      columnId: col.id,
      columnIds: columns.map((c) => c.id),
    });
  });

  it('thao tác lỗi không phát sự kiện nào', async () => {
    const { owner, base } = await setup();
    await owner.agent.post(`${base}/tasks`).send({ columnId: 'khong-ton-tai', title: 'x' }).expect(404);
    expect(emitted.filter((e) => e.kind === 'toProject')).toEqual([]);
  });

  it('xóa thành viên: phát lại các thẻ bị bỏ giao với version mới', async () => {
    const { owner, project, columns, base } = await setup();
    const member = await signUp('member');
    await addMember(owner.agent, project.id, member);
    const task = await newTask(owner.agent, base, columns[0].id, 'Của member', { assigneeId: member.user.id });
    emitted.length = 0;

    await owner.agent.delete(`${base}/members/${member.user.id}`).expect(204);

    expect(sent('member:removed')[0][2]).toMatchObject({ userId: member.user.id, unassignedTaskIds: [task.id] });
    expect(sent('task:updated')[0][2]).toMatchObject({ id: task.id, assigneeId: null, version: task.version + 1 });
  });
});

describe('Không thao tác chéo giữa các dự án', () => {
  async function twoProjects() {
    const a = await signUp('a');
    const p1 = await createProject(a.agent, 'P1');
    const p2 = await createProject(a.agent, 'P2');
    return { a, p1, p2, base1: `/api/projects/${p1.project.id}`, base2: `/api/projects/${p2.project.id}` };
  }

  it('không kéo thẻ sang cột của dự án khác, kể cả khi là thành viên cả hai', async () => {
    const { a, p1, p2, base1 } = await twoProjects();
    const task = await newTask(a.agent, base1, p1.columns[0].id, 'Việc P1');

    const res = await a.agent.post(`${base1}/tasks/${task.id}/move`).send({ toColumnId: p2.columns[0].id, toIndex: 0 });
    expect(res.status).toBe(404);

    const after = (await a.agent.get(`${base1}/tasks/${task.id}`)).body.task;
    expect(after.columnId).toBe(p1.columns[0].id);
  });

  it('không tạo thẻ vào cột, không sửa cột, không xem thẻ qua đường dẫn của dự án khác', async () => {
    const { a, p1, p2, base1, base2 } = await twoProjects();
    const task = await newTask(a.agent, base1, p1.columns[0].id, 'Việc P1');

    await a.agent.post(`${base1}/tasks`).send({ columnId: p2.columns[0].id, title: 'x' }).expect(404);
    await a.agent.patch(`${base1}/columns/${p2.columns[0].id}`).send({ name: 'Đổi' }).expect(404);
    await a.agent.get(`${base2}/tasks/${task.id}`).expect(404);
    await a.agent.delete(`${base2}/tasks/${task.id}`).expect(404);
  });
});
