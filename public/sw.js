const SHELL_CACHE = "chezcar-shell-v2";
const SHELL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/chezcar-logo.png",
  "/chezcar-logo.svg",
];
const OFFLINE_ROUTES = new Set(["/pos"]);
const OFFLINE_DB_NAME = "chezcar-offline";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_SALE_STORE = "offline-sales";
const OFFLINE_SNAPSHOT_STORE = "snapshots";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("chezcar-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "WARM_OFFLINE_SHELL") return;
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(["/pos", ...SHELL_ASSETS].map((url) =>
        fetch(new Request(url, { credentials: "include" }))
          .then((response) => {
            if (response.ok) return cache.put(url, response.clone());
            return undefined;
          })
          .catch(() => undefined),
      )),
    ),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "chezcar-offline-sales") return;
  event.waitUntil(syncOfflineSales());
});

async function syncOfflineSales() {
  const sales = await getPendingOfflineSales();
  let shouldRetry = false;

  for (const sale of sales) {
    try {
      const response = await fetch("/api/offline/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: sale.deviceId,
          idempotencyKey: sale.idempotencyKey,
          occurredAt: sale.occurredAt,
          operationType: "DIRECT_SALE",
          payload: sale.payload,
        }),
      });

      if (!response.ok) {
        shouldRetry = true;
        continue;
      }

      const json = await response.json();
      const status = json?.data?.status;
      if (status === "PENDING") {
        shouldRetry = true;
        continue;
      }

      await putOfflineSale({
        ...sale,
        status: mapOfflineSyncStatus(status),
        resultMessage: json?.data?.result?.message,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      shouldRetry = true;
    }
  }

  if (shouldRetry) throw new Error("Chezcar offline sync will retry when connectivity is restored");
}

function mapOfflineSyncStatus(status) {
  if (status === "ACCEPTED" || status === "ALREADY_ACCEPTED") return "SYNCED";
  if (status === "NEEDS_REVIEW" || status === "REJECTED" || status === "CONFLICT") return status;
  return "PENDING_SYNC";
}

function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_SALE_STORE)) {
        database.createObjectStore(OFFLINE_SALE_STORE, { keyPath: "idempotencyKey" });
      }
      if (!database.objectStoreNames.contains(OFFLINE_SNAPSHOT_STORE)) {
        database.createObjectStore(OFFLINE_SNAPSHOT_STORE, { keyPath: "deviceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getPendingOfflineSales() {
  const database = await openOfflineDatabase();
  const sales = await new Promise((resolve, reject) => {
    const request = database.transaction(OFFLINE_SALE_STORE, "readonly").objectStore(OFFLINE_SALE_STORE).getAll();
    request.onsuccess = () => resolve(request.result.filter((sale) => sale.status === "PENDING_SYNC"));
    request.onerror = () => reject(request.error);
  });
  database.close();
  return sales;
}

async function putOfflineSale(sale) {
  const database = await openOfflineDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_SALE_STORE, "readwrite");
    transaction.objectStore(OFFLINE_SALE_STORE).put(sale);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/") || SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
    return;
  }

  if (request.mode === "navigate" && OFFLINE_ROUTES.has(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(url.pathname, copy));
        return response;
      }).catch(() => caches.match(url.pathname).then((cached) => cached ?? caches.match("/offline.html"))),
    );
  }
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Chezcar notification";
  const options = {
    body: payload.description || "Open Chezcar to view details.",
    icon: "/chezcar-logo.png",
    badge: "/chezcar-logo.png",
    data: { url: "/notifications", id: payload.id },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
