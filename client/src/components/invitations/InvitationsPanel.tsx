import { useEffect, useState } from 'react';

import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
  type Invitation,
} from '../../api/invitations';

import { getErrorMessage } from '../../api/client';
import { socket } from '../../realtime/socket';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';

import styles from './InvitationsPanel.module.css';

export interface InvitationsPanelProps {
  onAccepted?: () => void;
}

export function InvitationsPanel({
  onAccepted,
}: InvitationsPanelProps) {
  const [items, setItems] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    listMyInvitations()
      .then(setItems)
      .catch((err: unknown) => {
        setError(getErrorMessage(err));
      });

    const onReceived = (invitation: Invitation) => {
      setItems((current) => {
        if (
          current.some(
            (item) => item.id === invitation.id,
          )
        ) {
          return current;
        }

        return [invitation, ...current];
      });
    };

    const onCanceled = (payload: {
      invitationId: string;
    }) => {
      setItems((current) =>
        current.filter(
          (item) =>
            item.id !== payload.invitationId,
        ),
      );
    };

    socket.on(
      'invitation:received',
      onReceived,
    );

    socket.on(
      'invitation:canceled',
      onCanceled,
    );

    return () => {
      socket.off(
        'invitation:received',
        onReceived,
      );

      socket.off(
        'invitation:canceled',
        onCanceled,
      );
    };
  }, []);

  async function handleAccept(
    invitationId: string,
  ) {
    try {
      setProcessingId(invitationId);
      setError(null);

      await acceptInvitation(invitationId);

      setItems((current) =>
        current.filter(
          (item) =>
            item.id !== invitationId,
        ),
      );

      onAccepted?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDecline(
    invitationId: string,
  ) {
    try {
      setProcessingId(invitationId);
      setError(null);

      await declineInvitation(invitationId);

      setItems((current) =>
        current.filter(
          (item) =>
            item.id !== invitationId,
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  }

  if (items.length === 0 && !error) {
    return null;
  }

  return (
    <section
      className={styles.placeholder}
      aria-label="Lời mời tham gia dự án"
    >
      <strong>
        Lời mời tham gia dự án
      </strong>

      {error && (
        <ErrorMessage>
          {error}
        </ErrorMessage>
      )}

      {items.map((invitation) => (
        <div key={invitation.id}>
          <p>
            <strong>
              {invitation.project.name}
            </strong>

            {' — '}

            {invitation.inviter.name}
            {' mời bạn tham gia'}
          </p>

          <Button
            loading={
              processingId === invitation.id
            }
            onClick={() =>
              handleAccept(invitation.id)
            }
          >
            Chấp nhận
          </Button>

          {' '}

          <Button
            variant="secondary"
            disabled={
              processingId === invitation.id
            }
            onClick={() =>
              handleDecline(invitation.id)
            }
          >
            Từ chối
          </Button>
        </div>
      ))}
    </section>
  );
}