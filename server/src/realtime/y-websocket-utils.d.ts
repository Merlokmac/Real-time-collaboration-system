
declare module 'y-websocket/bin/utils' {
  import type { IncomingMessage } from 'node:http';
  import type { WebSocket } from 'ws';
  import type * as Y from 'yjs';

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: {
      docName?: string;
      gc?: boolean;
    },
  ): void;

  export function setPersistence(
    persistence: {
      bindState: (docName: string, doc: Y.Doc) => Promise<void>;
      writeState: (docName: string, doc: Y.Doc) => Promise<void>;
    },
  ): void;
}
