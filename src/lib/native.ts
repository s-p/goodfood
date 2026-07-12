import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { LocalNotificationSchema } from "@capacitor/local-notifications";
import { db, uid } from "./db";
import { loadSettings } from "./settings";
import type { Entry } from "./types";

/*
 * Native iOS/Android notification layer (Capacitor).
 *
 * Unlike the web app — which can only fire a notification while it's open —
 * the native app pre-schedules a local notification with the OS for every
 * entry that's still awaiting its check-in. iOS delivers it on time even
 * when the app is closed. Press-and-hold shows energy actions (1–5) that
 * save a check-in without opening the app; a plain tap opens the check-in
 * screen. This mirrors what public/sw.js does for Android/desktop web.
 */

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

const CHECKIN_ACTION_TYPE = "CHECKIN";

// Same 1–5 scale as EnergyPicker / ENERGY_LABELS; ids match sw.js ("e1"…"e5").
const ENERGY_ACTIONS = [
  { id: "e1", title: "🪫 Drained (1/5)" },
  { id: "e2", title: "😕 Low (2/5)" },
  { id: "e3", title: "😐 Okay (3/5)" },
  { id: "e4", title: "🙂 Good (4/5)" },
  { id: "e5", title: "⚡ Energized (5/5)" },
];

// Notification ids must be int32. Entry ids hash into [1, 900M); fixed ids
// live above that range so they can never collide.
const CONFIRM_ID = 987_654_321;
const TEST_ID = 987_654_322;

function notifId(entryId: string): number {
  let h = 0;
  for (let i = 0; i < entryId.length; i++) h = (h * 31 + entryId.charCodeAt(i)) | 0;
  return (Math.abs(h) % 900_000_000) + 1;
}

export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    let status = await LocalNotifications.checkPermissions();
    if (status.display === "prompt" || status.display === "prompt-with-rationale") {
      status = await LocalNotifications.requestPermissions();
    }
    return status.display === "granted";
  } catch {
    return false;
  }
}

let initialized = false;

/**
 * Register the action buttons and handle responses. Actions run without
 * foregrounding the app: iOS launches it in the background, the listener
 * saves the check-in, and a "Logged ✓" confirmation appears.
 * `onCheckinSaved` lets the store reload (and auto-backup) the new record.
 */
export async function initNativeNotifications(onCheckinSaved: () => void): Promise<void> {
  if (!isNativeApp() || initialized) return;
  initialized = true;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: CHECKIN_ACTION_TYPE,
          actions: ENERGY_ACTIONS.map((a) => ({ ...a, foreground: false })),
        },
      ],
    });
  } catch {
    // Without action types, notifications still arrive; tapping opens the app.
  }

  await LocalNotifications.addListener("localNotificationActionPerformed", async (event) => {
    const extra = (event.notification?.extra ?? {}) as {
      entryId?: string;
      test?: boolean;
    };
    const energyMatch = /^e([1-5])$/.exec(event.actionId ?? "");

    if (energyMatch) {
      if (extra.test) {
        // Settings "Test" — never persist anything (mirrors sw.js).
        void confirmNotification(
          "That was a test ✓",
          "Real check-in ratings are saved instantly.",
        );
        return;
      }
      const energy = Number(energyMatch[1]) as 1 | 2 | 3 | 4 | 5;
      try {
        await db.putCheckin({
          id: uid(),
          entryIds: extra.entryId ? [extra.entryId] : [],
          at: Date.now(),
          energy,
          symptoms: [],
          note: "via notification",
        });
        onCheckinSaved();
        void confirmNotification(
          "Logged ✓",
          `Energy ${energy}/5 saved. Open the app to add symptoms.`,
        );
      } catch {
        // Saving failed (storage error) — opening the app still shows it due.
      }
      return;
    }

    // Plain tap → land on the check-in screen for that entry.
    if (!extra.test) {
      location.hash = extra.entryId ? `/checkin/${extra.entryId}` : "/checkin";
    }
  });
}

async function confirmNotification(title: string, body: string) {
  try {
    await LocalNotifications.schedule({
      notifications: [
        { id: CONFIRM_ID, title, body, schedule: { at: new Date(Date.now() + 400) } },
      ],
    });
  } catch {
    /* confirmation is cosmetic */
  }
}

/**
 * Reconcile the OS notification schedule with the current data: one pending
 * check-in notification per unchecked entry whose due time is still ahead.
 * Re-scheduling an id replaces it, so title/body/fire-time updates (analysis
 * finished, delay setting changed) land automatically; stale ones are
 * cancelled (entry deleted or checked in).
 */
export async function syncNativeCheckinNotifications(
  entries: Entry[],
  checkedEntryIds: Set<string>,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const delayMin = loadSettings().checkinDelayMin;
    const now = Date.now();
    const wanted = new Map<number, Entry>();
    for (const e of entries) {
      if (checkedEntryIds.has(e.id)) continue;
      const dueAt = e.eatenAt + delayMin * 60_000;
      // Already due → the in-app banner/badge flow covers it. Beyond a day →
      // pointless (matches the web timer cap in notify.ts).
      if (dueAt <= now + 2_000) continue;
      if (dueAt - now > 24 * 60 * 60 * 1000) continue;
      wanted.set(notifId(e.id), e);
    }

    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter(
      (n) => n.id !== CONFIRM_ID && n.id !== TEST_ID && !wanted.has(n.id),
    );
    if (stale.length) {
      await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
    }

    const list: LocalNotificationSchema[] = [...wanted.entries()].map(([id, e]) => ({
      id,
      title: "How are you feeling?",
      body: `You had ${e.analysis?.title ?? e.text ?? "something"} ${delayMin} min ago — press & hold to rate your energy.`,
      schedule: { at: new Date(e.eatenAt + delayMin * 60_000) },
      actionTypeId: CHECKIN_ACTION_TYPE,
      extra: { entryId: e.id },
    }));
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch {
    // Best-effort: the in-app due banner and badge flows still work.
  }
}

/** Settings → Test: arrives a moment later so it can be tried on the lock screen too. */
export async function showNativeTestNotification(entry: Entry): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_ID,
        title: "How are you feeling?",
        body: `You had ${entry.text ?? "a test snack"} — press & hold me to see the rating buttons.`,
        schedule: { at: new Date(Date.now() + 2_000) },
        actionTypeId: CHECKIN_ACTION_TYPE,
        extra: { entryId: entry.id, test: true },
      },
    ],
  });
}
