import { db } from "./db";
import type { Entry } from "./types";
import { loadSettings } from "./settings";

// Scheduling model, honestly:
//  - While the app is open (foreground tab), a timer fires the notification /
//    in-app prompt exactly on time.
//  - iOS home-screen web apps cannot schedule local notifications while
//    closed (no push server here — everything stays on-device). Instead:
//    the app badge shows due check-ins, and opening the app jumps straight
//    to the check-in screen. The setup guide shows an optional Shortcuts
//    reminder for a guaranteed nudge.
//  - On Android/desktop the notification carries 1-tap energy actions that
//    are saved by the service worker without opening the app.

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function checkinDueAt(entry: Entry): number {
  return entry.eatenAt + loadSettings().checkinDelayMin * 60_000;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function scheduleCheckinTimer(entry: Entry, onDue: () => void) {
  cancelCheckinTimer(entry.id);
  const delay = checkinDueAt(entry) - Date.now();
  if (delay <= 0) return;
  // setTimeout treats delays > 2^31-1 ms as 0 — a far-future (mis-typed)
  // eatenAt would fire instantly. Anything beyond a day is pointless anyway.
  if (delay > 24 * 60 * 60 * 1000) return;
  timers.set(
    entry.id,
    setTimeout(() => {
      timers.delete(entry.id);
      void showCheckinNotification(entry);
      onDue();
    }, delay),
  );
}

export function cancelCheckinTimer(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

export async function showCheckinNotification(
  entry: Entry,
  opts?: { test?: boolean },
) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title = "How are you feeling?";
  const body = `You had ${entry.analysis?.title ?? entry.text ?? "something"} ${loadSettings().checkinDelayMin} min ago — quick energy check?`;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag: `checkin-${entry.id}`,
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        // `test` tells the SW not to persist a check-in for this one.
        data: { entryId: entry.id, test: opts?.test ?? false },
        // 1-tap logging on platforms that support notification actions
        // (Android/desktop). iOS ignores actions; tapping opens the app.
        actions: [
          { action: "e1", title: "🪫 Drained" },
          { action: "e3", title: "😐 Okay" },
          { action: "e5", title: "⚡ Energized" },
        ],
      } as NotificationOptions);
      return;
    }
    new Notification(title, { body });
  } catch {
    // Notifications are best-effort; the in-app banner still shows.
  }
}

/** Entries whose check-in window has arrived but that have no check-in yet. */
export function dueCheckins(
  entries: Entry[],
  checkedEntryIds: Set<string>,
  now = Date.now(),
): Entry[] {
  const windowMs = 6 * 60 * 60 * 1000; // stop nagging after 6h
  return entries
    .filter(
      (e) =>
        !checkedEntryIds.has(e.id) &&
        checkinDueAt(e) <= now &&
        now - e.eatenAt < windowMs,
    )
    .sort((a, b) => b.eatenAt - a.eatenAt);
}

export async function updateAppBadge() {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    const [entries, checkins] = await Promise.all([db.allEntries(), db.allCheckins()]);
    const checked = new Set(checkins.flatMap((c) => c.entryIds));
    const due = dueCheckins(entries, checked).length;
    if (due > 0) await nav.setAppBadge(due);
    else await nav.clearAppBadge?.();
  } catch {
    // Badging is progressive enhancement only.
  }
}
