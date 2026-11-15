import {
  useEffect,
  useRef,
  useState,
} from 'react';

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

type Props = {
  taskId: string;
};

export function YjsTest({ taskId }: Props) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('disconnected');

  const docRef = useRef<Y.Doc | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();

    const provider = new WebsocketProvider(
      'ws://localhost:4000/yjs',
      `task:${taskId}`,
      doc,
    );

    const text = doc.getText('description');

    const updateText = () => {
      setValue(text.toString());
    };

    text.observe(updateText);

    provider.on(
      'status',
      (event: { status: string }) => {
        console.log('Yjs:', event.status);
        setStatus(event.status);
      },
    );

    docRef.current = doc;

    updateText();

    return () => {
      text.unobserve(updateText);
      provider.destroy();
      doc.destroy();

      docRef.current = null;
    };
  }, [taskId]);

  const handleChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const newValue = event.target.value;

    const doc = docRef.current;

    if (!doc) return;

    const text = doc.getText('description');

    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, newValue);
    });
  };

  return (
    <section>
      <h2>Yjs Test</h2>

      <p>
        WebSocket: <strong>{status}</strong>
      </p>

      <textarea
        rows={8}
        cols={60}
        value={value}
        onChange={handleChange}
        placeholder="Gõ ở Chrome, xem Edge..."
      />
    </section>
  );
}