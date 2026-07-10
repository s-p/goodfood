/* GoodFood service worker: offline shell + notification-action check-ins. */
const CACHE = "goodfood-v1";
const CORE = ["./", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API calls etc. go straight out

  if (req.mode === "navigate") {
    // Network-first for the shell so updates land; cache fallback offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  // Hashed build assets: cache-first (immutable), fill cache on first fetch.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

/* ---- notification actions: save a check-in without opening the app ----
   Keep the IndexedDB schema here in sync with src/lib/db.ts. */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("goodfood", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", { keyPath: "id" }).createIndex(
          "eatenAt",
          "eatenAt",
        );
      }
      if (!db.objectStoreNames.contains("checkins")) {
        db.createObjectStore("checkins", { keyPath: "id" }).createIndex("at", "at");
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveQuickCheckin(entryId, energy) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("checkins", "readwrite");
        tx.objectStore("checkins").put({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
          entryIds: entryId ? [entryId] : [],
          at: Date.now(),
          energy,
          symptoms: [],
          note: "via notification",
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

self.addEventListener("notificationclick", (event) => {
  const { notification, action } = event;
  notification.close();
  const entryId = notification.data && notification.data.entryId;

  const energyMatch = /^e([1-5])$/.exec(action || "");
  if (energyMatch) {
    const energy = Number(energyMatch[1]);
    event.waitUntil(
      saveQuickCheckin(entryId, energy)
        .then(() => {
          if (self.registration.showNotification) {
            return self.registration.showNotification("Logged ✓", {
              body: `Energy ${energy}/5 saved. Open the app to add symptoms.`,
              tag: "checkin-confirm",
              icon: "./icons/icon-192.png",
            });
          }
        })
        .then(() => notifyClients())
        .catch(() => {}),
    );
    return;
  }

  // Plain tap → open (or focus) the app on the check-in screen.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const url = new URL("./#/checkin", self.registration.scope).href;
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate?.(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});

function notifyClients() {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const c of clients) c.postMessage({ type: "checkin-saved" });
    });
}
