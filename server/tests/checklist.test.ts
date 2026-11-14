import { prisma } from '../src/lib/prisma';
import { addMember, closeDb, createProject, emitted, resetDb, signUp, type Agent } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const SOCKET = 'socket-cua-nguoi-thao-tac';

async function setup() {
  const owner = await signUp('owner');
  const member = await signUp('member');
  const outsider = await signUp('ngoai');
  const { project, columns } = await createProject(owner.agent);
  await addMember(owner.agent, project.id, member);

  const res = await owner.agent
    .post(`/api/projects/${project.id}/tasks`)
    .send({ columnId: columns[0].id, title: 'Viết API' });
  const taskId = res.body.task.id as string;
  const base = `/api/projects/${project.id}/tasks/${taskId}/checklist`;
  return { owner, member, outsider, project, columns, taskId, base };
}

async function addItems(agent: Agent, base: string, contents: string[]) {
  const ids: string[] = [];
  for (const content of contents) {
    const res = await agent.post(base).send({ content });
    expect(res.status).toBe(201);
    ids.push(res.body.item.id);
  }
  return ids;
}

const contentsOf = (body: { items: { content: string }[] }) => body.items.map((i) => i.content);

describe('Checklist trong thẻ', () => {
  it('thêm mục, tick xong thì tiến độ thay đổi', async () => {
    const { owner, member, base } = await setup();
    const [first] = await addItems(owner.agent, base, ['Thiết kế bảng', 'Viết service', 'Viết test']);

    const tick = await member.agent.patch(`${base}/${first}`).send({ isDone: true });
    expect(tick.status).toBe(200);
    expect(tick.body).toMatchObject({ total: 3, done: 1, item: { id: first, isDone: true } });

    const list = await owner.agent.get(base);
    expect(contentsOf(list.body)).toEqual(['Thiết kế bảng', 'Viết service', 'Viết test']);
    expect(list.body).toMatchObject({ total: 3, done: 1 });
  });

  it('sửa chữ, bỏ tick, nội dung rỗng bị từ chối', async () => {
    const { owner, base } = await setup();
    const [id] = await addItems(owner.agent, base, ['Mục cũ']);

    const edit = await owner.agent.patch(`${base}/${id}`).send({ content: '  Mục mới  ' });
    expect(edit.body.item.content).toBe('Mục mới');

    await owner.agent.patch(`${base}/${id}`).send({ isDone: true });
    const undo = await owner.agent.patch(`${base}/${id}`).send({ isDone: false });
    expect(undo.body).toMatchObject({ done: 0, item: { isDone: false } });

    await owner.agent.post(base).send({ content: '   ' }).expect(400);
    await owner.agent.patch(`${base}/${id}`).send({}).expect(400);
  });

  it('kéo mục đổi thứ tự, xóa mục thì đánh số lại liền mạch', async () => {
    const { owner, base, taskId } = await setup();
    const [a, b, c] = await addItems(owner.agent, base, ['A', 'B', 'C']);

    const moved = await owner.agent.post(`${base}/${c}/move`).send({ toIndex: 0 });
    expect(contentsOf(moved.body)).toEqual(['C', 'A', 'B']);

    const removed = await owner.agent.delete(`${base}/${a}`);
    expect(removed.status).toBe(200);
    expect(contentsOf(removed.body)).toEqual(['C', 'B']);

    const rows = await prisma.checklistItem.findMany({ where: { taskId }, orderBy: { position: 'asc' } });
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [c, 0],
      [b, 1],
    ]);
  });

  it('mỗi thao tác phát checklist:updated kèm cả danh sách, trừ socket vừa thao tác', async () => {
    const { owner, project, taskId, base } = await setup();
    emitted.length = 0;

    await owner.agent.post(base).set('x-socket-id', SOCKET).send({ content: 'Một việc' }).expect(201);

    const events = emitted.filter((e) => e.kind === 'toProject' && e.args[1] === 'checklist:updated');
    expect(events).toHaveLength(1);
    const [projectId, , payload, except] = events[0].args;
    expect(projectId).toBe(project.id);
    expect(payload).toMatchObject({ taskId, items: [{ content: 'Một việc', isDone: false, position: 0 }] });
    expect(except).toBe(SOCKET);
  });

  it('tick được ghi vào lịch sử của thẻ, sửa chữ thì không', async () => {
    const { owner, project, taskId, base } = await setup();
    const [id] = await addItems(owner.agent, base, ['Làm gì đó']);

    await owner.agent.patch(`${base}/${id}`).send({ content: 'Đổi tên' });
    await owner.agent.patch(`${base}/${id}`).send({ isDone: true });

    const res = await owner.agent.get(`/api/projects/${project.id}/activity?taskId=${taskId}`);
    const actions = res.body.items.map((l: { action: string }) => l.action);
    expect(actions).toContain('checklist.added');
    expect(actions).toContain('checklist.checked');
    expect(actions.filter((a: string) => a.startsWith('checklist.'))).toHaveLength(2);
  });

  it('thêm đồng thời nhiều mục vẫn có vị trí khác nhau', async () => {
    const { owner, base, taskId } = await setup();
    const results = await Promise.all(
      ['1', '2', '3', '4', '5'].map((content) => owner.agent.post(base).send({ content })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);

    const rows = await prisma.checklistItem.findMany({ where: { taskId }, orderBy: { position: 'asc' } });
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('tối đa 50 mục mỗi thẻ', async () => {
    const { owner, base, taskId } = await setup();
    await prisma.checklistItem.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({ taskId, content: `Mục ${i}`, position: i })),
    });
    const res = await owner.agent.post(base).send({ content: 'Mục thứ 51' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('50');
  });

  it('người ngoài dự án và thẻ của dự án khác đều nhận 404', async () => {
    const { owner, outsider, base, taskId } = await setup();
    await outsider.agent.get(base).expect(404);
    await outsider.agent.post(base).send({ content: 'Lén thêm' }).expect(404);

    // Thẻ có thật nhưng gọi qua một dự án khác của chính chủ thì không tìm thấy
    const other = await createProject(owner.agent, 'Dự án khác');
    await owner.agent.get(`/api/projects/${other.project.id}/tasks/${taskId}/checklist`).expect(404);
  });

  it('xóa thẻ thì các mục checklist bị xóa theo', async () => {
    const { owner, project, taskId, base } = await setup();
    await addItems(owner.agent, base, ['A', 'B']);

    await owner.agent.delete(`/api/projects/${project.id}/tasks/${taskId}`).expect(204);
    expect(await prisma.checklistItem.count({ where: { taskId } })).toBe(0);
  });
});
