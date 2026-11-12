import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError, getErrorMessage } from '../api/client';
import { inviteMember } from '../api/invitations';
import { getBoard } from '../api/projects';
import { ChatPanel } from '../components/chat/ChatPanel';
import { socket } from '../realtime/socket';
import { YjsTest } from '../realtime/YjsTest';

import type {
  Board,
  ColumnTaskOrder,
  Task,
} from '../types';

import styles from './placeholder.module.css';

type TaskMovedPayload = {
  task: Task;
  columns: ColumnTaskOrder[];
};

type TaskDeletedPayload = {
  taskId: string;
  columnId: string;
  taskIds: string[];
};

export function BoardPage() {
  const navigate = useNavigate();

  const { projectId } =
    useParams<{ projectId: string }>();

  const [board, setBoard] =
    useState<Board | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [inviteEmail, setInviteEmail] =
    useState('');

  const [inviteMessage, setInviteMessage] =
    useState<string | null>(null);

  const [inviting, setInviting] =
    useState(false);

 
  // LOAD BOARD BAN ĐẦU


  useEffect(() => {
    if (!projectId) return;

    const controller =
      new AbortController();

    setLoading(true);
    setError(null);

    getBoard(projectId, {
      signal: controller.signal,
    })
      .then(setBoard)
      .catch((err: unknown) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        if (
          err instanceof ApiError &&
          err.status === 404
        ) {
          navigate('/projects', { replace: true });
          return;
        }

        console.error(err);

        setError('Không tải được bảng dự án');
      })
      .finally(() => {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  },[projectId, navigate]);



  // Xử lý khi bị thu hồi quyền truy cập project
  useEffect(() => {
    if (!projectId) return;

    const handleAccessRevoked = (
      payload: { projectId: string },
    ) => {
      if (payload.projectId !== projectId) return;

      console.log('Project access revoked:', projectId);

      navigate('/projects', {
        replace: true,
      });
    };

    socket.on(
      'project:access_revoked',
      handleAccessRevoked,
    );

    return () => {
      socket.off(
        'project:access_revoked',
        handleAccessRevoked,
      );
    };
  }, [projectId, navigate]);


 
  // SOCKET.IO REALTIME KANBAN



  useEffect(() => {
    if (!projectId) return;

    const joinProject = () => {
      socket.emit(
        'project:join',
        projectId,
      );

      console.log(
        'Join project room:',
        projectId,
      );
    };

    // Socket reconnect thì join room lại
    // và tải board mới nhất.
    const handleConnect = () => {
      joinProject();

      getBoard(projectId)
        .then(setBoard)
        .catch(console.error);
    };

   
    // TASK CREATED
   

    const onTaskCreated = (
      task: Task,
    ) => {
      console.log(
        'REALTIME task:created',
        task,
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          columns:
            current.columns.map(
              (column) => {
                if (
                  column.id !==
                  task.columnId
                ) {
                  return column;
                }

                // Tránh duplicate
                if (
                  column.tasks.some(
                    (item) =>
                      item.id ===
                      task.id,
                  )
                ) {
                  return column;
                }

                return {
                  ...column,

                  tasks: [
                    ...column.tasks,
                    task,
                  ],
                };
              },
            ),
        };
      });
    };

   
    // TASK UPDATED
    

    const onTaskUpdated = (
      task: Task,
    ) => {
      console.log(
        'REALTIME task:updated',
        task,
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          columns:
            current.columns.map(
              (column) => ({
                ...column,

                tasks:
                  column.tasks.map(
                    (item) =>
                      item.id ===
                      task.id
                        ? task
                        : item,
                  ),
              }),
            ),
        };
      });
    };

    // TASK MOVED


    const onTaskMoved = (
      payload: TaskMovedPayload,
    ) => {
      console.log(
        'REALTIME task:moved',
        payload,
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        const tasksById =
          new Map<string, Task>();

        current.columns.forEach(
          (column) => {
            column.tasks.forEach(
              (task) => {
                tasksById.set(
                  task.id,
                  task,
                );
              },
            );
          },
        );

        // Bản task từ server là mới nhất
        tasksById.set(
          payload.task.id,
          payload.task,
        );

        const orders = new Map(
          payload.columns.map(
            (column) => [
              column.columnId,
              column.taskIds,
            ],
          ),
        );

        return {
          ...current,

          columns:
            current.columns.map(
              (column) => {
                const taskIds =
                  orders.get(
                    column.id,
                  );

                if (!taskIds) {
                  return column;
                }

                const tasks =
                  taskIds
                    .map(
                      (
                        taskId,
                        index,
                      ) => {
                        const task =
                          tasksById.get(
                            taskId,
                          );

                        if (!task) {
                          return null;
                        }

                        return {
                          ...task,

                          columnId:
                            column.id,

                          position:
                            index,
                        };
                      },
                    )
                    .filter(
                      (
                        task,
                      ): task is Task =>
                        task !==
                        null,
                    );

                return {
                  ...column,
                  tasks,
                };
              },
            ),
        };
      });
    };

    
    // TASK DELETED


    const onTaskDeleted = (
      payload: TaskDeletedPayload,
    ) => {
      console.log(
        'REALTIME task:deleted',
        payload,
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          columns:
            current.columns.map(
              (column) => {
                if (
                  column.id !==
                  payload.columnId
                ) {
                  return column;
                }

                const tasksById =
                  new Map(
                    column.tasks
                      .filter(
                        (task) =>
                          task.id !==
                          payload.taskId,
                      )
                      .map(
                        (task) => [
                          task.id,
                          task,
                        ],
                      ),
                  );

                const tasks =
                  payload.taskIds
                    .map(
                      (
                        taskId,
                        index,
                      ) => {
                        const task =
                          tasksById.get(
                            taskId,
                          );

                        if (!task) {
                          return null;
                        }

                        return {
                          ...task,
                          position:
                            index,
                        };
                      },
                    )
                    .filter(
                      (
                        task,
                      ): task is Task =>
                        task !==
                        null,
                    );

                return {
                  ...column,
                  tasks,
                };
              },
            ),
        };
      });
    };

    // Nếu socket đang kết nối
    // thì join project ngay.
    if (socket.connected) {
      joinProject();
    }

    socket.on(
      'connect',
      handleConnect,
    );

    socket.on(
      'task:created',
      onTaskCreated,
    );

    socket.on(
      'task:updated',
      onTaskUpdated,
    );

    socket.on(
      'task:moved',
      onTaskMoved,
    );

    socket.on(
      'task:deleted',
      onTaskDeleted,
    );

    return () => {
      socket.emit(
        'project:leave',
        projectId,
      );

      socket.off(
        'connect',
        handleConnect,
      );

      socket.off(
        'task:created',
        onTaskCreated,
      );

      socket.off(
        'task:updated',
        onTaskUpdated,
      );

      socket.off(
        'task:moved',
        onTaskMoved,
      );

      socket.off(
        'task:deleted',
        onTaskDeleted,
      );
    };
  }, [projectId]);

 
  // MỜI THÀNH VIÊN
 

  async function handleInvite() {
    if (!projectId) return;

    const email =
      inviteEmail.trim();

    if (!email) {
      setInviteMessage(
        'Nhập email người muốn mời',
      );

      return;
    }

    try {
      setInviting(true);
      setInviteMessage(null);

      await inviteMember(
        projectId,
        email,
      );

      setInviteEmail('');

      setInviteMessage(
        `Đã gửi lời mời tới ${email}`,
      );
    } catch (err) {
      setInviteMessage(
        getErrorMessage(err),
      );
    } finally {
      setInviting(false);
    }
  }

  
  // LOADING / ERROR


  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          Đang tải bảng...
        </div>
      </main>
    );
  }

  if (error || !board) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          {error ??
            'Không tìm thấy bảng'}
        </div>
      </main>
    );
  }

  const firstTask =
    board.columns
      .flatMap(
        (column) => column.tasks,
      )
      .at(0);


  // UI


  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1>Bảng dự án</h1>

        <p className={styles.muted}>
          Mã dự án:{' '}
          <span
            className={styles.code}
          >
            {projectId}
          </span>
        </p>

        <p className={styles.muted}>
          Socket:{' '}
          {socket.connected
            ? 'Đã kết nối'
            : 'Chưa kết nối'}
        </p>

        {/* 
            MỜI THÀNH VIÊN
        */}

        <hr />

        <section>
          <h2>Mời thành viên</h2>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="email"
              placeholder="bao@demo.vn"
              value={inviteEmail}
              disabled={inviting}
              onChange={(event) =>
                setInviteEmail(
                  event.target
                    .value,
                )
              }
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                  'Enter'
                ) {
                  void handleInvite();
                }
              }}
              style={{
                padding: 8,
                minWidth: 240,
              }}
            />

            <button
              type="button"
              disabled={inviting}
              onClick={() =>
                void handleInvite()
              }
            >
              {inviting
                ? 'Đang gửi...'
                : 'Mời'}
            </button>
          </div>

          {inviteMessage && (
            <p
              className={
                styles.muted
              }
            >
              {inviteMessage}
            </p>
          )}
        </section>

        <hr />

        {/*
            KANBAN
         */}

        <div
          style={{
            display: 'flex',
            alignItems:
              'flex-start',
            gap: 16,
            overflowX: 'auto',
            marginTop: 20,
            paddingBottom: 16,
          }}
        >
          {board.columns.map(
            (column) => (
              <section
                key={column.id}
                style={{
                  minWidth: 250,
                  width: 250,
                  padding: 12,

                  border:
                    '1px solid #ddd',

                  borderRadius: 8,
                }}
              >
                <h2>
                  {column.name}
                </h2>

                <p>
                  {
                    column.tasks
                      .length
                  }{' '}
                  công việc
                </p>

                {column.tasks.map(
                  (task) => (
                    <article
                      key={task.id}
                      style={{
                        padding: 12,

                        marginBottom:
                          10,

                        border:
                          '1px solid #ccc',

                        borderRadius:
                          6,
                      }}
                    >
                      <strong>
                        {task.title}
                      </strong>

                      <div>
                        Version:{' '}
                        {
                          task.version
                        }
                      </div>

                      {task.assignee && (
                        <div>
                          Người làm:{' '}
                          {
                            task
                              .assignee
                              .name
                          }
                        </div>
                      )}
                    </article>
                  ),
                )}

                {column.tasks
                  .length === 0 && (
                  <p
                    className={
                      styles.muted
                    }
                  >
                    Chưa có công việc
                  </p>
                )}
              </section>
            ),
          )}
        </div>

        {/* 
            YJS
         */}

        {firstTask && (
          <>
            <hr />

            <YjsTest
              taskId={
                firstTask.id
              }
            />
          </>
        )}

        {/* 
            LIVE CHAT
        */}

        {projectId && (
          <ChatPanel
            projectId={projectId}
          />
        )}

        <p
          style={{
            marginTop: 20,
          }}
        >
          <Link to="/projects">
            ← Về Dự án của tôi
          </Link>
        </p>
      </div>
    </main>
  );
}