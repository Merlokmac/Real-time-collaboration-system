import * as Y from 'yjs';
import { authorizeDocument, compactDocument, docNameOf, loadDocumentState, yjsPersistence } from '../src/collab';
import { prisma } from '../src/lib/prisma';
import { closeDb, createProject, resetDb, signUp } from './helpers';

beforeEach(resetDb);
afterAll(closeDb);

const flush = () => new Promise((r) => setTimeout(r, 300));

async function setupTask() {
  const a = await signUp('a');
  const outsider = await signUp('out');
  const { project, columns } = await createProject(a.agent);
  const task = (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ columnId: columns[0].id, title: 'Doc' }))
    .body.task;
  return { a, outsider, project, task };
}

describe('Lưu tài liệu Yjs', () => {
  it('chỉ thành viên dự án được mở tài liệu', async () => {
    const { a, outsider, project, task } = await setupTask();
    expect(await authorizeDocument(a.user.id, docNameOf(task.id))).toEqual({ taskId: task.id, projectId: project.id });
    expect(await authorizeDocument(outsider.user.id, docNameOf(task.id))).toBeNull();
    expect(await authorizeDocument(a.user.id, 'khac:123')).toBeNull();
  });

  it('hai bản cùng gõ được hợp nhất, mở lại vẫn còn nội dung', async () => {
    const { task } = await setupTask();
    const name = docNameOf(task.id);

    const server = new Y.Doc();
    await yjsPersistence.bindState(name, server);

    // Hai client gõ song song khi chưa thấy thay đổi của nhau
    const c1 = new Y.Doc();
    const c2 = new Y.Doc();
    c1.getText('description').insert(0, 'Xin ');
    c2.getText('description').insert(0, 'chào');
    Y.applyUpdate(server, Y.encodeStateAsUpdate(c1));
    Y.applyUpdate(server, Y.encodeStateAsUpdate(c2));
    await flush();

    const expected = server.getText('description').toString();
    expect(expected).toHaveLength('Xin chào'.length);

    // Giả lập server khởi động lại: dựng tài liệu mới từ database
    const reloaded = new Y.Doc();
    await yjsPersistence.bindState(name, reloaded);
    expect(reloaded.getText('description').toString()).toBe(expected);

    await yjsPersistence.writeState(name, server);
    expect(await prisma.documentUpdate.count({ where: { taskId: task.id } })).toBe(0);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.descriptionText).toBe(expected);
  });

  it('gom snapshot không làm mất cập nhật', async () => {
    const { task } = await setupTask();
    const doc = new Y.Doc();
    await yjsPersistence.bindState(docNameOf(task.id), doc);
    for (let i = 0; i < 10; i++) doc.getText('description').insert(i, String(i));
    await flush();

    await compactDocument(task.id);
    doc.getText('description').insert(10, '!');
    await flush();

    const state = await loadDocumentState(task.id);
    const check = new Y.Doc();
    Y.applyUpdate(check, state!);
    expect(check.getText('description').toString()).toBe('0123456789!');
  });
});
