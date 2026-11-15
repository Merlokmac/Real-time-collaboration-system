import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  listMessages,
  sendMessage,
} from '../../api/messages';

import { getErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { socket } from '../../realtime/socket';

import type { Message } from '../../types';

interface ChatPanelProps {
  projectId: string;
}

interface PresenceUser {
  id: string;
  name: string;
}

interface PresencePayload {
  projectId: string;
  users: PresenceUser[];
}

interface TypingPayload {
  projectId: string;
  userId: string;
  name: string;
  typing: boolean;
}

export function ChatPanel({
  projectId,
}: ChatPanelProps) {
  const { user } = useAuth();

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [content, setContent] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [onlineUsers, setOnlineUsers] =
    useState<PresenceUser[]>([]);

  const [typingUsers, setTypingUsers] =
    useState<PresenceUser[]>([]);

  const bottomRef =
    useRef<HTMLDivElement | null>(null);

  const typingStopTimer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const remoteTypingTimers =
    useRef(
      new Map<
        string,
        ReturnType<typeof setTimeout>
      >(),
    );

  // Thêm message nếu chưa tồn tại
  function addMessage(message: Message) {
    setMessages((current) => {
      if (
        current.some(
          (item) => item.id === message.id,
        )
      ) {
        return current;
      }

      return [...current, message];
    });
  }

  // Load lịch sử và đăng ký các event realtime
  useEffect(() => {
    const controller =
      new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const page =
          await listMessages(
            projectId,
            {
              signal: controller.signal,
            },
          );

        if (
          controller.signal.aborted
        ) {
          return;
        }

        setMessages(
          [...page.items].reverse(),
        );
      } catch (err) {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          getErrorMessage(err),
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    void load();

    const onMessageCreated = (
      message: Message,
    ) => {
      if (
        message.projectId !==
        projectId
      ) {
        return;
      }

      addMessage(message);
    };

    const onPresenceUpdated = (
      payload: PresencePayload,
    ) => {
      if (
        payload.projectId !==
        projectId
      ) {
        return;
      }

      setOnlineUsers(
        payload.users,
      );
    };

    const onTyping = (
      payload: TypingPayload,
    ) => {
      if (
        payload.projectId !==
          projectId ||
        payload.userId ===
          user?.id
      ) {
        return;
      }

      const oldTimer =
        remoteTypingTimers.current.get(
          payload.userId,
        );

      if (oldTimer) {
        clearTimeout(oldTimer);

        remoteTypingTimers.current.delete(
          payload.userId,
        );
      }

      if (!payload.typing) {
        setTypingUsers(
          (current) =>
            current.filter(
              (item) =>
                item.id !==
                payload.userId,
            ),
        );

        return;
      }

      setTypingUsers(
        (current) => {
          if (
            current.some(
              (item) =>
                item.id ===
                payload.userId,
            )
          ) {
            return current;
          }

          return [
            ...current,
            {
              id: payload.userId,
              name: payload.name,
            },
          ];
        },
      );

      // Tự xóa typing nếu mất event typing:false
      const timer =
        setTimeout(() => {
          setTypingUsers(
            (current) =>
              current.filter(
                (item) =>
                  item.id !==
                  payload.userId,
              ),
          );

          remoteTypingTimers.current.delete(
            payload.userId,
          );
        }, 3000);

      remoteTypingTimers.current.set(
        payload.userId,
        timer,
      );
    };

    const onReconnect = () => {
      void load();
    };

    socket.on(
      'message:created',
      onMessageCreated,
    );

    socket.on(
      'presence:updated',
      onPresenceUpdated,
    );

    socket.on(
      'chat:typing',
      onTyping,
    );

    socket.on(
      'connect',
      onReconnect,
    );

    return () => {
      controller.abort();

      socket.off(
        'message:created',
        onMessageCreated,
      );

      socket.off(
        'presence:updated',
        onPresenceUpdated,
      );

      socket.off(
        'chat:typing',
        onTyping,
      );

      socket.off(
        'connect',
        onReconnect,
      );

      if (
        typingStopTimer.current
      ) {
        clearTimeout(
          typingStopTimer.current,
        );
      }

      for (
        const timer
        of remoteTypingTimers.current.values()
      ) {
        clearTimeout(timer);
      }

      remoteTypingTimers.current.clear();

      socket.emit(
        'chat:typing',
        {
          projectId,
          typing: false,
        },
      );
    };
  }, [
    projectId,
    user?.id,
  ]);

  // Tự cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages]);

  // Phát trạng thái đang nhập
  function handleContentChange(
    value: string,
  ) {
    setContent(value);

    if (
      typingStopTimer.current
    ) {
      clearTimeout(
        typingStopTimer.current,
      );

      typingStopTimer.current =
        null;
    }

    if (!value.trim()) {
      socket.emit(
        'chat:typing',
        {
          projectId,
          typing: false,
        },
      );

      return;
    }

    socket.emit(
      'chat:typing',
      {
        projectId,
        typing: true,
      },
    );

    typingStopTimer.current =
      setTimeout(() => {
        socket.emit(
          'chat:typing',
          {
            projectId,
            typing: false,
          },
        );

        typingStopTimer.current =
          null;
      }, 1200);
  }

  // Gửi tin nhắn và thêm response REST vào UI người gửi
  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    const text =
      content.trim();

    if (
      !text ||
      sending
    ) {
      return;
    }

    if (
      typingStopTimer.current
    ) {
      clearTimeout(
        typingStopTimer.current,
      );

      typingStopTimer.current =
        null;
    }

    socket.emit(
      'chat:typing',
      {
        projectId,
        typing: false,
      },
    );

    try {
      setSending(true);
      setError(null);

      const clientId =
        crypto.randomUUID();

      const message =
        await sendMessage(
          projectId,
          text,
          clientId,
        );

      addMessage(message);

      setContent('');
    } catch (err) {
      setError(
        getErrorMessage(err),
      );
    } finally {
      setSending(false);
    }
  }

  const typingText =
    typingUsers.length > 0
      ? `${typingUsers
          .map(
            (item) => item.name,
          )
          .join(', ')} đang nhập...`
      : null;

  return (
    <section
      style={{
        marginTop: 24,
        border:
          '1px solid #d1d5db',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 12,
          borderBottom:
            '1px solid #d1d5db',
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <strong>
          Chat dự án
        </strong>

        <span
          style={{
            fontSize: 12,
            opacity: 0.7,
          }}
        >
          {onlineUsers.length}{' '}
          người online
        </span>
      </div>

      <div
        style={{
          height: 320,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {loading && (
          <p>
            Đang tải tin nhắn...
          </p>
        )}

        {!loading &&
          messages.length === 0 && (
            <p>
              Chưa có tin nhắn.
            </p>
          )}

        {messages.map(
          (message) => {
            const mine =
              message.authorId ===
              user?.id;

            return (
              <div
                key={message.id}
                style={{
                  alignSelf: mine
                    ? 'flex-end'
                    : 'flex-start',
                  maxWidth: '75%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: mine
                    ? '#dbeafe'
                    : '#f3f4f6',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {mine
                    ? 'Bạn'
                    : message.author
                        .name}
                </div>

                <div>
                  {message.content}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.6,
                    marginTop: 4,
                  }}
                >
                  {new Date(
                    message.createdAt,
                  ).toLocaleTimeString(
                    'vi-VN',
                    {
                      hour: '2-digit',
                      minute:
                        '2-digit',
                    },
                  )}
                </div>
              </div>
            );
          },
        )}

        <div ref={bottomRef} />
      </div>

      <div
        style={{
          minHeight: 24,
          padding: '2px 12px',
          fontSize: 12,
          opacity: 0.7,
          fontStyle: 'italic',
        }}
      >
        {typingText ?? ''}
      </div>

      {error && (
        <p
          style={{
            color: 'crimson',
            padding: '0 12px',
          }}
        >
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: 8,
          padding: 12,
          borderTop:
            '1px solid #d1d5db',
        }}
      >
        <input
          type="text"
          value={content}
          maxLength={2000}
          disabled={sending}
          placeholder="Nhập tin nhắn..."
          onChange={(event) =>
            handleContentChange(
              event.target.value,
            )
          }
          style={{
            flex: 1,
            padding: 10,
          }}
        />

        <button
          type="submit"
          disabled={
            sending ||
            !content.trim()
          }
        >
          {sending
            ? 'Đang gửi...'
            : 'Gửi'}
        </button>
      </form>
    </section>
  );
}