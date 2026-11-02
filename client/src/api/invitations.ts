import { api } from './client';
import type { User } from '../types';

export interface Invitation {
  id: string;
  projectId: string;
  inviteeId: string;
  inviterId: string;
  status: string;
  createdAt: string;
  expiresAt: string;

  project: {
    id: string;
    name: string;
    description: string;
  };

  inviter: User;
  invitee: User;
}

export async function listMyInvitations(): Promise<Invitation[]> {
  const { items } = await api.get<{
    items: Invitation[];
  }>('/invitations');

  return items;
}

export async function inviteMember(
  projectId: string,
  email: string,
): Promise<Invitation> {
  const { invitation } = await api.post<{
    invitation: Invitation;
  }>(`/projects/${projectId}/invitations`, {
    email,
  });

  return invitation;
}

export async function acceptInvitation(
  invitationId: string,
) {
  return api.post<{
    projectId: string;
    status: string;
  }>(`/invitations/${invitationId}/accept`);
}

export async function declineInvitation(
  invitationId: string,
) {
  return api.post<{
    projectId: string;
    status: string;
  }>(`/invitations/${invitationId}/decline`);
}