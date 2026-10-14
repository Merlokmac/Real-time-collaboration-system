import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { pgPool } from '../src/lib/session';
import { setRealtimeBridge, type RealtimeBridge } from '../src/realtime/bridge';

export const app = createApp();

export type Emitted = { kind: keyof RealtimeBridge; args: unknown[] };
export const emitted: Emitted[] = [];

setRealtimeBridge({
  toProject: (...args) => emitted.push({ kind: 'toProject', args }),
  toUser: (...args) => emitted.push({ kind: 'toUser', args }),
  revokeAccess: (...args) => emitted.push({ kind: 'revokeAccess', args }),
  closeProject: (...args) => emitted.push({ kind: 'closeProject', args }),
});

export async function resetDb() {
  emitted.length = 0;
  await prisma.$executeRawUnsafe('TRUNCATE users, projects, user_sessions RESTART IDENTITY CASCADE');
}

export async function closeDb() {
  await prisma.$disconnect();
  await pgPool.end();
}

let counter = 0;

export async function signUp(name = 'user') {
  counter += 1;
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email: `${name}${counter}@test.vn`, password: 'matkhau123', name });
  if (res.status !== 201) throw new Error(`Đăng ký lỗi: ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: string; email: string; name: string } };
}

export type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

export async function createProject(agent: Agent, name = 'Dự án test') {
  const res = await agent.post('/api/projects').send({ name });
  if (res.status !== 201) throw new Error(`Tạo dự án lỗi: ${JSON.stringify(res.body)}`);
  const board = await agent.get(`/api/projects/${res.body.project.id}/board`);
  return {
    project: res.body.project as { id: string; name: string },
    columns: board.body.columns as { id: string; name: string; isDone: boolean }[],
  };
}

export async function addMember(owner: Agent, projectId: string, member: { agent: Agent; user: { email: string } }) {
  const inv = await owner.post(`/api/projects/${projectId}/invitations`).send({ email: member.user.email });
  if (inv.status !== 201) throw new Error(`Mời lỗi: ${JSON.stringify(inv.body)}`);
  const acc = await member.agent.post(`/api/invitations/${inv.body.invitation.id}/accept`);
  if (acc.status !== 200) throw new Error(`Chấp nhận lỗi: ${JSON.stringify(acc.body)}`);
}
