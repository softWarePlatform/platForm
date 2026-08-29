type NotificationClient = {
  id: string;
  write: (payload: string) => void;
};

const clientsByUser = new Map<string, Map<string, NotificationClient>>();

function writeEvent(client: NotificationClient, event: string, data: unknown) {
  client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function addNotificationClient(userId: string, client: NotificationClient) {
  let clients = clientsByUser.get(userId);
  if (!clients) {
    clients = new Map();
    clientsByUser.set(userId, clients);
  }
  clients.set(client.id, client);
  writeEvent(client, "ready", { ok: true });

  return () => {
    const current = clientsByUser.get(userId);
    current?.delete(client.id);
    if (current?.size === 0) clientsByUser.delete(userId);
  };
}

export function emitNotificationToUsers(userIds: Iterable<string>) {
  for (const userId of new Set(userIds)) {
    const clients = clientsByUser.get(userId);
    if (!clients) continue;
    for (const client of clients.values()) {
      writeEvent(client, "notify", { at: new Date().toISOString() });
    }
  }
}

export function emitNotificationToUser(userId: string) {
  emitNotificationToUsers([userId]);
}
