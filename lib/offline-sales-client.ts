export type OfflineSalePayload = {
  customerId?: string;
  locationId?: string;
  receiptBooklet?: string;
  manualReceiptNumber: string;
  paymentMethod: string;
  discountAmount: number;
  amountPaid: number;
  notes?: string;
  lines: Array<{ productId: string; quantity: number; unitPrice: number }>;
};

export type QueuedOfflineSale = {
  idempotencyKey: string;
  deviceId: string;
  occurredAt: string;
  payload: OfflineSalePayload;
  status: "PENDING_SYNC" | "SYNCED" | "NEEDS_REVIEW" | "REJECTED" | "CONFLICT";
  resultMessage?: string;
  updatedAt: string;
};

export type OfflineSnapshot = {
  deviceId: string;
  locationId: string;
  authorizedAt: string;
  expiresAt: string;
  products: Array<{ id: string; itemCode: string; name: string; price: number; available: number; balanceVersion: number }>;
};

type OfflineSyncServerStatus = "ACCEPTED" | "ALREADY_ACCEPTED" | "REJECTED" | "NEEDS_REVIEW" | "CONFLICT" | "PENDING";

const DB_NAME = "chezcar-offline";
const DB_VERSION = 1;
const DEVICE_KEY = "chezcar-offline-device-id";
const SALE_STORE = "offline-sales";
const SNAPSHOT_STORE = "snapshots";

export function offlineSupported() {
  return typeof window !== "undefined" && "indexedDB" in window && "crypto" in window && "randomUUID" in window.crypto;
}

export function shouldAttemptOfflineSync(input: {
  role: string | null;
  online: boolean;
  pendingCount: number;
  inFlight: boolean;
}) {
  return input.role === "BRANCH_STAFF" && input.online && input.pendingCount > 0 && !input.inFlight;
}

export function getOfflineDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const deviceId = window.crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, deviceId);
  return deviceId;
}

export async function queueOfflineSale(payload: OfflineSalePayload) {
  const sale: QueuedOfflineSale = {
    idempotencyKey: window.crypto.randomUUID(),
    deviceId: getOfflineDeviceId(),
    occurredAt: new Date().toISOString(),
    payload,
    status: "PENDING_SYNC",
    updatedAt: new Date().toISOString(),
  };
  await putRecord(SALE_STORE, sale);
  await requestBackgroundSync();
  return sale;
}

export async function listQueuedOfflineSales() {
  return getAllRecords<QueuedOfflineSale>(SALE_STORE);
}

export async function refreshOfflineSnapshot() {
  const deviceId = getOfflineDeviceId();
  const response = await fetch(`/api/offline/snapshot?deviceId=${encodeURIComponent(deviceId)}`, { credentials: "same-origin" });
  if (!response.ok) return null;
  const json = (await response.json()) as { data: OfflineSnapshot };
  await putRecord(SNAPSHOT_STORE, json.data);
  return json.data;
}

export async function readOfflineSnapshot() {
  return getRecord<OfflineSnapshot>(SNAPSHOT_STORE, getOfflineDeviceId());
}

export async function syncQueuedOfflineSales() {
  const queued = (await listQueuedOfflineSales()).filter((sale) => sale.status === "PENDING_SYNC");
  const results: QueuedOfflineSale[] = [];

  for (const sale of queued) {
    try {
      const response = await fetch("/api/offline/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: sale.deviceId,
          idempotencyKey: sale.idempotencyKey,
          occurredAt: sale.occurredAt,
          operationType: "DIRECT_SALE",
          payload: sale.payload,
        }),
      });
      const json = await response.json().catch(() => null) as { data?: { status?: OfflineSyncServerStatus; result?: { message?: string } }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Offline sync failed");
      const status = mapSyncStatus(json?.data?.status);
      const updated = { ...sale, status, resultMessage: json?.data?.result?.message, updatedAt: new Date().toISOString() } satisfies QueuedOfflineSale;
      await putRecord(SALE_STORE, updated);
      results.push(updated);
    } catch {
      results.push(sale);
    }
  }

  return results;
}

async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    await sync?.register("chezcar-offline-sales");
  } catch {
    // The POS page still retries on reconnect when Background Sync is unavailable.
  }
}

function mapSyncStatus(status: OfflineSyncServerStatus | undefined): QueuedOfflineSale["status"] {
  if (status === "ACCEPTED" || status === "ALREADY_ACCEPTED") return "SYNCED";
  if (status === "NEEDS_REVIEW" || status === "REJECTED" || status === "CONFLICT") return status;
  return "PENDING_SYNC";
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SALE_STORE)) db.createObjectStore(SALE_STORE, { keyPath: "idempotencyKey" });
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: "deviceId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putRecord<T>(storeName: string, value: T) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getRecord<T>(storeName: string, key: string) {
  const db = await openDatabase();
  const record = await new Promise<T | null>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function getAllRecords<T>(storeName: string) {
  const db = await openDatabase();
  const records = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records;
}
