import { addMember, closeDb, createProject, emitted, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

describe('Dự án, thành viên và quyền', () => {
  it('tạo dự án có sẵn 3 cột mặc định, cột cuối là hoàn thành', async () => {
    const owner = await signUp('owner');
    const { columns } = await createProject(owner.agent);
    expect(columns.map((c) => c.name)).toEqual(['Cần làm', 'Đang làm', 'Hoàn thành']);
    expect(columns[2].isDone).toBe(true);
  });

  it('ba tài khoản, hai dự án: dữ liệu và quyền tách đúng', async () => {
    const a = await signUp('a');
    const b = await signUp('b');
    const c = await signUp('c');

    const p1 = await createProject(a.agent, 'P1');
    const p2 = await createProject(c.agent, 'P2');
    await addMember(a.agent, p1.project.id, b);

    const listB = await b.agent.get('/api/projects');
    expect(listB.body.items.map((p: { name: string }) => p.name)).toEqual(['P1']);
    expect(listB.body.items[0]).toMatchObject({ role: 'MEMBER', memberCount: 2 });

    // Biết link vẫn không xem được dự án mình không tham gia
    await c.agent.get(`/api/projects/${p1.project.id}/board`).expect(404);
    await c.agent.get(`/api/projects/${p1.project.id}/messages`).expect(404);
    await a.agent.get(`/api/projects/${p2.project.id}`).expect(404);
    await b.agent
      .post(`/api/projects/${p2.project.id}/tasks`)
      .send({ columnId: p2.columns[0].id, title: 'x' })
      .expect(404);
  });

  it('thành viên không được đổi thông tin, mời hay xóa dự án', async () => {
    const owner = await signUp('owner');
    const member = await signUp('member');
    const outsider = await signUp('outsider');
    const { project } = await createProject(owner.agent);
    await addMember(owner.agent, project.id, member);

    await member.agent.patch(`/api/projects/${project.id}`).send({ name: 'Mới' }).expect(403);
    await member.agent.post(`/api/projects/${project.id}/invitations`).send({ email: outsider.user.email }).expect(403);
    await member.agent.delete(`/api/projects/${project.id}`).send({ confirmName: project.name }).expect(403);
  });

  it('mời trùng và mời người đã là thành viên bị từ chối', async () => {
    const owner = await signUp('owner');
    const member = await signUp('member');
    const { project } = await createProject(owner.agent);

    await owner.agent.post(`/api/projects/${project.id}/invitations`).send({ email: member.user.email }).expect(201);
    const dup = await owner.agent.post(`/api/projects/${project.id}/invitations`).send({ email: member.user.email });
    expect(dup.body.error.code).toBe('ALREADY_INVITED');

    const inv = await member.agent.get('/api/invitations');
    await member.agent.post(`/api/invitations/${inv.body.items[0].id}/accept`).expect(200);
    await member.agent.post(`/api/invitations/${inv.body.items[0].id}/accept`).expect(400);

    const again = await owner.agent.post(`/api/projects/${project.id}/invitations`).send({ email: member.user.email });
    expect(again.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('từ chối lời mời thì không thành thành viên', async () => {
    const owner = await signUp('owner');
    const member = await signUp('member');
    const { project } = await createProject(owner.agent);
    const inv = await owner.agent.post(`/api/projects/${project.id}/invitations`).send({ email: member.user.email });
    await member.agent.post(`/api/invitations/${inv.body.invitation.id}/decline`).expect(200);
    await member.agent.get(`/api/projects/${project.id}`).expect(404);
  });

  it('xóa thành viên: thu hồi quyền, bỏ giao việc', async () => {
    const owner = await signUp('owner');
    const member = await signUp('member');
    const { project, columns } = await createProject(owner.agent);
    await addMember(owner.agent, project.id, member);

    const task = await owner.agent
      .post(`/api/projects/${project.id}/tasks`)
      .send({ columnId: columns[0].id, title: 'Việc', assigneeId: member.user.id });

    emitted.length = 0;
    await owner.agent.delete(`/api/projects/${project.id}/members/${member.user.id}`).expect(204);

    expect(emitted).toContainEqual({ kind: 'revokeAccess', args: [project.id, member.user.id] });
    await member.agent.get(`/api/projects/${project.id}/board`).expect(404);

    const after = await owner.agent.get(`/api/projects/${project.id}/tasks/${task.body.task.id}`);
    expect(after.body.task.assigneeId).toBeNull();
  });

  it('chủ dự án phải chuyển quyền trước khi rời', async () => {
    const owner = await signUp('owner');
    const member = await signUp('member');
    const { project } = await createProject(owner.agent);
    await addMember(owner.agent, project.id, member);

    await owner.agent.post(`/api/projects/${project.id}/members/leave`).expect(403);
    await owner.agent
      .post(`/api/projects/${project.id}/members/transfer-ownership`)
      .send({ userId: member.user.id })
      .expect(200);
    await owner.agent.post(`/api/projects/${project.id}/members/leave`).expect(204);

    const list = await member.agent.get('/api/projects');
    expect(list.body.items[0]).toMatchObject({ role: 'OWNER', memberCount: 1 });
  });

  it('xóa dự án cần nhập đúng tên', async () => {
    const owner = await signUp('owner');
    const { project, columns } = await createProject(owner.agent, 'Xóa tôi');
    await owner.agent.post(`/api/projects/${project.id}/tasks`).send({ columnId: columns[0].id, title: 'a' });

    await owner.agent.delete(`/api/projects/${project.id}`).send({ confirmName: 'sai' }).expect(400);
    await owner.agent.delete(`/api/projects/${project.id}`).send({ confirmName: 'Xóa tôi' }).expect(204);
    await owner.agent.get(`/api/projects/${project.id}`).expect(404);
  });
});
