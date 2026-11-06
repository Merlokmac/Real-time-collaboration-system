import { api } from './client';
import type {
  Message,
  Paginated,
} from '../types';

export async function listMessages(
  projectId: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<Paginated<Message>> {
  return api.get<Paginated<Message>>(
    `/projects/${projectId}/messages`,
    {
      query: {
        limit: 50,
      },
      signal: options?.signal,
    },
  );
}

export async function sendMessage(
  projectId: string,
  content: string,
  clientId: string,
): Promise<Message> {
  const { message } = await api.post<{
    message: Message;
  }>(
    `/projects/${projectId}/messages`,
    {
      content,
      clientId,
    },
  );

  return message;
}