import "server-only";

import { Client } from "pg";

import { NOTIFICATION_CHANNEL } from "@/lib/server/services/notifications";

type WakeHandler = () => void;

type ListenerState = {
  client: Client | null;
  connecting: Promise<void> | null;
  reconnectTimer: NodeJS.Timeout | null;
  subscribers: Set<WakeHandler>;
};

const globalForNotifications = globalThis as unknown as {
  chezcarNotificationListener?: ListenerState;
};

function listenerState() {
  globalForNotifications.chezcarNotificationListener ??= {
    client: null,
    connecting: null,
    reconnectTimer: null,
    subscribers: new Set(),
  };

  return globalForNotifications.chezcarNotificationListener;
}

export function subscribeToNotificationWakeups(handler: WakeHandler) {
  const state = listenerState();
  state.subscribers.add(handler);
  void ensureNotificationListener(state);

  return () => {
    state.subscribers.delete(handler);
  };
}

async function ensureNotificationListener(state = listenerState()) {
  if (state.client || state.connecting) return state.connecting;
  if (!process.env.DATABASE_URL) return;

  state.connecting = startListener(state).catch((error) => {
    console.warn("Notification listener unavailable; polling fallback remains active", error);
    scheduleReconnect(state);
  }).finally(() => {
    state.connecting = null;
  });

  return state.connecting;
}

async function startListener(state: ListenerState) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  client.on("notification", () => {
    for (const subscriber of state.subscribers) subscriber();
  });

  client.on("error", (error) => {
    console.warn("Notification listener connection failed", error);
    restartListener(state, client);
  });

  client.on("end", () => {
    restartListener(state, client);
  });

  await client.connect();
  await client.query(`LISTEN ${NOTIFICATION_CHANNEL}`);
  state.client = client;
}

function restartListener(state: ListenerState, client: Client) {
  if (state.client !== client) return;
  state.client = null;
  scheduleReconnect(state);
}

function scheduleReconnect(state: ListenerState) {
  if (state.reconnectTimer || state.subscribers.size === 0) return;

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void ensureNotificationListener(state);
  }, 2_000);
}
