import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getBoard } from '../api/projects';
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
  const { projectId } =
    useParams<{ projectId: string }>();

  const [board, setBoard] =
    useState<Board | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  // -------------------------
  // Load board ban đầu
  // -------------------------

  useEffect(() => {
    if (!projectId) return;

    const controller = new AbortController();

    setLoading(true);
    setError(null);

    getBoard(projectId, {
      signal: controller.signal,
    })
      .then(setBoard)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        console.error(err);
        setError('Không tải được bảng dự án');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [projectId]);

  // -------------------------
  // Socket.IO realtime
  // -------------------------

  useEffect(() => {
    if (!projectId) return;

    const joinProject = () => {
      socket.emit('project:join', projectId);

      console.log(
        'Join project room:',
        projectId,
      );
    };

    // Reconnect xong thì tải lại board
    // để không mất event xảy ra lúc mất mạng.
    const handleConnect = () => {
      joinProject();

      getBoard(projectId)
        .then(setBoard)
        .catch(console.error);
    };

    // CREATE
    const onTaskCreated = (task: Task) => {
      console.log(
        'REALTIME task:created',
        task,
      );

      setBoard((current) => {
        if (!current) return current;

        return {
          ...current,
          columns: current.columns.map(
            (column) => {
              if (
                column.id !== task.columnId
              ) {
                return column;
              }

              // tránh bị duplicate event
              if (
                column.tasks.some(
                  (item) =>
                    item.id === task.id,
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

    // UPDATE
    const onTaskUpdated = (task: Task) => {
      console.log(
        'REALTIME task:updated',
        task,
      );

      setBoard((current) => {
        if (!current) return current;

        return {
          ...current,
          columns: current.columns.map(
            (column) => ({
              ...column,
              tasks: column.tasks.map(
                (item) =>
                  item.id === task.id
                    ? task
                    : item,
              ),
            }),
          ),
        };
      });
    };

    // MOVE
    const onTaskMoved = (
      payload: TaskMovedPayload,
    ) => {
      console.log(
        'REALTIME task:moved',
        payload,
      );

      setBoard((current) => {
        if (!current) return current;

        const tasksById = new Map<
          string,
          Task
        >();

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

        // task vừa move là bản mới nhất
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

          columns: current.columns.map(
            (column) => {
              const taskIds =
                orders.get(column.id);

              if (!taskIds) {
                return column;
              }

              const tasks = taskIds
                .map((taskId, index) => {
                  const task =
                    tasksById.get(taskId);

                  if (!task) return null;

                  return {
                    ...task,
                    columnId: column.id,
                    position: index,
                  };
                })
                .filter(
                  (task): task is Task =>
                    task !== null,
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

    // DELETE
    const onTaskDeleted = (
      payload: TaskDeletedPayload,
    ) => {
      console.log(
        'REALTIME task:deleted',
        payload,
      );

      setBoard((current) => {
        if (!current) return current;

        return {
          ...current,

          columns: current.columns.map(
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
                    .map((task) => [
                      task.id,
                      task,
                    ]),
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
                      task !== null,
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

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1>Bảng dự án</h1>

        <p className={styles.muted}>
          Mã dự án:{' '}
          <span className={styles.code}>
            {projectId}
          </span>
        </p>

        <p className={styles.muted}>
          Socket:{' '}
          {socket.connected
            ? 'Đã kết nối'
            : 'Chưa kết nối'}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
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
                        marginBottom: 10,
                        border:
                          '1px solid #ccc',
                        borderRadius: 6,
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

        {firstTask && (
          <>
            <hr />

            <YjsTest
              taskId={firstTask.id}
            />
          </>
        )}

        <p>
          <Link to="/projects">
            ← Về Dự án của tôi
          </Link>
        </p>
      </div>
    </main>
  );
}