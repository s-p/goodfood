/* GoodFood service worker: offline shell + notification-action check-ins. */
const CACHE = "goodfood-v1";

/*
 * Precache the whole app shell at install time. The first page load is NOT
 * controlled by the SW, so a fetch-time-only cache would leave the build
 * assets uncached until the second visit — an offline launch in between
 * would be a white screen. So: fetch the HTML, extract its asset URLs
 * (including nested static-import chunks inside JS files), and cache all
 * of it up front.
 */
async function precacheApp(cache) {
  const res = await fetch("./", { cache: "no-cache" });
  if (!res.ok || res.type !== "basic") throw new Error("shell fetch failed");
  const html = await res.clone().text();
  await cache.put("./", res);

  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) urls.add(m[1]);

  // JS chunks can statically import further chunks — scan one level deep.
  const queue = [...urls].filter((u) => u.endsWith(".js"));
  while (queue.length) {
    const u = queue.shift();
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const txt = await r.clone().text();
      await cache.put(u, r);
      urls.add(u);
      for (const m of txt.matchAll(
        /["'`](?:\.\/)?(assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2?|svg|png))["'`]/g,
      )) {
        const dep = "./" + m[1];
        if (!urls.has(dep)) {
          urls.add(dep);
          if (dep.endsWith(".js")) queue.push(dep);
        }
      }
    } catch {
      /* dep scan is best effort */
    }
  }

  await Promise.all(
    [...urls].map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      } catch {
        /* best effort */
      }
    }),
  );
}

/* Drop hashed assets that the current HTML no longer references. */
async function pruneOldAssets(cache, html) {
  const referenced = new Set();
  for (const m of html.matchAll(/assets\/[A-Za-z0-9._-]+/g)) referenced.add(m[0]);
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (req) => {
      const path = new URL(req.url).pathname;
      const idx = path.indexOf("assets/");
      if (idx === -1) return;
      const name = path.slice(idx);
      // Prune a hashed asset only when neither the HTML nor any cached,
      // HTML-referenced JS chunk still mentions it.
      if (
        (name.endsWith(".js") || name.endsWith(".css")) &&
        !referenced.has(name) &&
        !(await stillImported(cache, name, referenced))
      ) {
        await cache.delete(req);
      }
    }),
  );
}

async function stillImported(cache, name, referencedByHtml) {
  // A chunk not in the HTML may still be imported by a referenced JS file.
  for (const top of referencedByHtml) {
    if (!top.endsWith(".js")) continue;
    const hit = await cache.match("./" + top);
    if (!hit) continue;
    try {
      const txt = await hit.clone().text();
      if (txt.includes(name)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => precacheApp(c))
      .catch(() => {}) // install must succeed even if precache fails
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
    // Only cache real, successful same-origin responses — never a captive
    // portal page, redirect, or error over the known-good shell.
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            const cache = await caches.open(CACHE);
            await cache.put("./", copy.clone());
            // Refresh the asset set for the new HTML in the background.
            copy
              .text()
              .then(async (html) => {
                await precacheApp(cache).catch(() => {});
                await pruneOldAssets(cache, html).catch(() => {});
              })
              .catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  const isHashedAsset = url.pathname.includes("/assets/");
  if (isHashedAsset) {
    // Content-hashed: immutable, cache-first.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then(async (res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              const cache = await caches.open(CACHE);
              await cache.put(req, copy);
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else (icons, manifest): stale-while-revalidate so updates
  // eventually land without a cache-name bump.
  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then(async (res) => {
          if (res.ok && res.type === "basic") {
            const cache = await caches.open(CACHE);
            await cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    }),
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
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/* Recompute the app badge: entries from the last 6h with no check-in that
   are past the reminder delay. Settings live in localStorage (out of reach
   here), so use the 30-minute default — close enough for a badge. */
function refreshBadge() {
  if (!self.navigator.setAppBadge) return Promise.resolve();
  return openDb()
    .then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(["entries", "checkins"], "readonly");
          const out = {};
          tx.objectStore("entries").getAll().onsuccess = (e) =>
            (out.entries = e.target.result);
          tx.objectStore("checkins").getAll().onsuccess = (e) =>
            (out.checkins = e.target.result);
          tx.oncomplete = () => resolve(out);
          tx.onerror = () => reject(tx.error);
        }),
    )
    .then(({ entries, checkins }) => {
      const checked = new Set(checkins.flatMap((c) => c.entryIds));
      const now = Date.now();
      const due = entries.filter(
        (e) =>
          !checked.has(e.id) &&
          now - e.eatenAt >= 30 * 60 * 1000 &&
          now - e.eatenAt < 6 * 60 * 60 * 1000,
      ).length;
      return due > 0
        ? self.navigator.setAppBadge(due)
        : self.navigator.clearAppBadge?.();
    })
    .catch(() => {});
}

self.addEventListener("notificationclick", (event) => {
  const { notification, action } = event;
  notification.close();
  const data = notification.data || {};
  const entryId = data.entryId;

  const energyMatch = /^e([1-5])$/.exec(action || "");
  if (energyMatch && !data.test) {
    const energy = Number(energyMatch[1]);
    event.waitUntil(
      saveQuickCheckin(entryId, energy)
        .then(() =>
          self.registration.showNotification("Logged ✓", {
            body: `Energy ${energy}/5 saved. Open the app to add symptoms.`,
            tag: "checkin-confirm",
            icon: "./icons/icon-192.png",
          }),
        )
        .then(() => refreshBadge())
        .then(() => notifyClients())
        .catch(() => {}),
    );
    return;
  }
  if (energyMatch && data.test) {
    // Test notification from Settings — never persist anything.
    event.waitUntil(
      self.registration
        .showNotification("That was a test ✓", {
          body: "Real check-in taps are saved instantly.",
          tag: "checkin-confirm",
          icon: "./icons/icon-192.png",
        })
        .catch(() => {}),
    );
    return;
  }

  // Plain tap → open (or focus) the app on the check-in screen.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const scope = self.registration.scope;
        const url = new URL("./#/checkin", scope).href;
        // Only touch clients that are actually this app, not other
        // same-origin tabs.
        const appClient = clients.find((c) => c.url.startsWith(scope));
        if (appClient) {
          if (appClient.navigate) {
            return appClient
              .navigate(url)
              .catch(() => {})
              .then(() => appClient.focus?.());
          }
          return appClient.focus?.();
        }
        return self.clients.openWindow(url);
      })
      .catch(() => {}),
  );
});

function notifyClients() {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const c of clients) c.postMessage({ type: "checkin-saved" });
    });
}
