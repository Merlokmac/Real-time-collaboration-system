import { addMember, closeDb, createProject, emitted, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

async function setup() {
  const owner = await signUp('owner');
  const { project, columns } = await createProject(owner.agent);
  const base = `/api/projects/${project.id}`;
  const label = (await owner.agent.post(`${base}/labels`).send({ name: 'Gấp', color: '#ff0000' })).body.label;
  return { owner, project, columns, base, label };
}

const actions = async (agent: Awaited<ReturnType<typeof signUp>>['agent'], base: string) =>
  (await agent.get(`${base}/activity`)).body.items.map((l: { action: string }) => l.action);

describe('Nhãn', () => {
  it('trùng tên trong cùng dự án bị từ chối', async () => {
    const { owner, base } = await setup();
    const dup = await owner.agent.post(`${base}/labels`).send({ name: 'Gấp', color: '#00ff00' });
    expect(dup.status).toBe(409);
  });

  it('sửa nhãn được ghi lịch sử kèm tên cũ', async () => {
    const { owner, base, label } = await setup();
    await owner.agent.patch(`${base}/labels/${label.id}`).send({ name: 'Rất gấp' }).expect(200);

    const logs = (await owner.agent.get(`${base}/activity`)).body.items;
    expect(logs[0]).toMatchObject({ action: 'label.updated', meta: { name: 'Rất gấp', previousName: 'Gấp' } });
  });

  it('xóa nhãn làm tăng version các thẻ đang gắn và phát task:updated', async () => {
    const { owner, columns, base, label, project } = await setup();
    const task = (
      await owner.agent.post(`${base}/tasks`).send({ columnId: columns[0].id, title: 'Việc', labelIds: [label.id] })
    ).body.task;

    emitted.length = 0;
    await owner.agent.delete(`${base}/labels/${label.id}`).expect(204);

    const after = (await owner.agent.get(`${base}/tasks/${task.id}`)).body.task;
    expect(after.version).toBe(task.version + 1);
    expect(after.labels).toEqual([]);

    const updated = emitted.find((e) => e.kind === 'toProject' && e.args[1] === 'task:updated');
    expect(updated?.args[0]).toBe(project.id);
    expect(updated?.args[2]).toMatchObject({ id: task.id, labels: [] });

    // Bản nháp cũ còn giữ version trước khi xóa nhãn phải bị chặn
    const stale = await owner.agent.patch(`${base}/tasks/${task.id}`).send({ version: task.version, title: 'cũ' });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('Lịch sử còn thiếu', () => {
  it('sửa và xóa bình luận được ghi lại', async () => {
    const { owner, columns, base } = await setup();
    const task = (await owner.agent.post(`${base}/tasks`).send({ columnId: columns[0].id, title: 'Việc' })).body.task;
    const url = `${base}/tasks/${task.id}/comments`;
    const comment = (await owner.agent.post(url).send({ content: 'a' })).body.comment;

    await owner.agent.patch(`${url}/${comment.id}`).send({ content: 'b' }).expect(200);
    await owner.agent.delete(`${url}/${comment.id}`).expect(204);

    const taskLogs = (await owner.agent.get(`${base}/activity?taskId=${task.id}`)).body.items;
    expect(taskLogs.map((l: { action: string }) => l.action)).toEqual(
      expect.arrayContaining(['comment.created', 'comment.updated', 'comment.deleted']),
    );
  });

  it('chủ dự án xóa bình luận của thành viên', async () => {
    const { owner, columns, base, project } = await setup();
    const member = await signUp('member');
    await addMember(owner.agent, project.id, member);
    const task = (await owner.agent.post(`${base}/tasks`).send({ columnId: columns[0].id, title: 'Việc' })).body.task;
    const url = `${base}/tasks/${task.id}/comments`;
    const comment = (await member.agent.post(url).send({ content: 'của member' })).body.comment;

    await owner.agent.patch(`${url}/${comment.id}`).send({ content: 'sửa hộ' }).expect(403);
    await owner.agent.delete(`${url}/${comment.id}`).expect(204);
  });

  it('hủy lời mời được ghi lại và báo cho người được mời', async () => {
    const { owner, base } = await setup();
    const invitee = await signUp('invitee');
    const inv = (await owner.agent.post(`${base}/invitations`).send({ email: invitee.user.email })).body.invitation;

    emitted.length = 0;
    await owner.agent.delete(`${base}/invitations/${inv.id}`).expect(204);

    expect(await actions(owner.agent, base)).toContain('invitation.canceled');
    expect(emitted).toContainEqual(
      expect.objectContaining({ kind: 'toUser', args: [invitee.user.id, 'invitation:canceled', expect.anything()] }),
    );
    expect((await invitee.agent.get('/api/invitations')).body.items).toEqual([]);
  });
});
