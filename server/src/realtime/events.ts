// Tên sự kiện server phát qua Socket.IO, cần thống nhất với client
export const ServerEvents = {
  projectUpdated: 'project:updated',
  projectDeleted: 'project:deleted',

  memberJoined: 'member:joined',
  memberRemoved: 'member:removed',
  memberRoleChanged: 'member:role_changed',

  invitationReceived: 'invitation:received',
  invitationCanceled: 'invitation:canceled',

  columnCreated: 'column:created',
  columnUpdated: 'column:updated',
  columnsReordered: 'column:reordered',
  columnDeleted: 'column:deleted',

  taskCreated: 'task:created',
  taskUpdated: 'task:updated',
  taskMoved: 'task:moved',
  taskDeleted: 'task:deleted',

  labelCreated: 'label:created',
  labelUpdated: 'label:updated',
  labelDeleted: 'label:deleted',

  commentCreated: 'comment:created',
  commentUpdated: 'comment:updated',
  commentDeleted: 'comment:deleted',

  messageCreated: 'message:created',
  activityCreated: 'activity:created',
} as const;

export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];

export const projectRoom = (projectId: string) => `project:${projectId}`;
export const userRoom = (userId: string) => `user:${userId}`;
