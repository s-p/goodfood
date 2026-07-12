import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { db, uid } from "./lib/db";
import type { Checkin, Entry } from "./lib/types";
import { mealTypeFor } from "./lib/meals";
import { analyzeFood, friendlyApiError } from "./lib/analyze";
import { blobToBase64, resizePhoto } from "./lib/image";
import {
  cancelCheckinTimer,
  dueCheckins,
  scheduleCheckinTimer,
  updateAppBadge,
} from "./lib/notify";
import { loadSettings, saveSettings, type Settings } from "./lib/settings";
import { applyTheme } from "./lib/theme";
import { runBackup } from "./lib/backup";
import {
  initNativeNotifications,
  syncNativeCheckinNotifications,
} from "./lib/native";
import { fmtDayTime } from "./lib/format";

interface NewEntryInput {
  photo?: Blob;
  text?: string;
  eatenAt: number;
}

interface Store {
  ready: boolean;
  entries: Entry[];
  checkins: Checkin[];
  settings: Settings;
  due: Entry[];
  addEntry: (input: NewEntryInput) => Promise<Entry>;
  updateEntry: (
    id: string,
    patch: Partial<Pick<Entry, "eatenAt" | "mealType" | "mealTypePinned" | "text">>,
  ) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  reanalyze: (id: string) => Promise<void>;
  saveCheckin: (c: Omit<Checkin, "id">) => Promise<void>;
  removeCheckin: (id: string) => Promise<void>;
  updateSettings: (s: Settings) => void;
  getPhotoUrl: (id: string) => Promise<string | null>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  // Bumped when a foreground check-in timer fires so `due` recomputes.
  const [tick, setTick] = useState(0);
  const photoUrls = useRef(new Map<string, string>());
  // Every local mutation bumps this; reload() discards snapshots that were
  // read before a mutation landed, so stale DB reads can't clobber state.
  const mutationSeq = useRef(0);

  const reload = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const seqAtRead = mutationSeq.current;
      const [e, c] = await Promise.all([db.allEntries(), db.allCheckins()]);
      if (mutationSeq.current !== seqAtRead) continue; // raced a write, retry
      e.sort((a, b) => b.eatenAt - a.eatenAt);
      c.sort((a, b) => b.at - a.at);
      setEntries(e);
      setCheckins(c);
      break;
    }
    void updateAppBadge();
  }, []);

  useEffect(() => {
    // Even if the very first read fails (private mode, quota), render the
    // app so Settings/Guide remain reachable instead of a blank screen.
    void reload()
      .catch(() => {})
      .finally(() => setReady(true));
  }, [reload]);

  // Native app: notification actions save check-ins in the background
  // (lib/native.ts). Bump mutationSeq so the auto-backup below picks the
  // new record up too, then reload state from the DB.
  useEffect(() => {
    void initNativeNotifications(() => {
      mutationSeq.current++;
      void reload();
    });
  }, [reload]);

  // The service worker writes check-ins from notification actions; refresh
  // when it tells us, and whenever the app comes back to the foreground.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === "checkin-saved") void reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    // Without this, messages sent before a listener attaches are queued
    // forever in some browsers.
    navigator.serviceWorker?.startMessages?.();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const checkedIds = useMemo(
    () => new Set(checkins.flatMap((c) => c.entryIds)),
    [checkins],
  );
  const due = useMemo(
    () => dueCheckins(entries, checkedIds),
    // tick: timers firing move entries into "due" without any data change.
    // checkinDelayMin: changing the delay moves the due boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, checkedIds, tick, settings.checkinDelayMin],
  );

  // Auto-backup: a few seconds after the last local change, push a snapshot
  // to the user's private GitHub repo (when configured). Debounced so a
  // burst of edits becomes one upload; only fires after real mutations,
  // never for the initial load.
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backedUpSeq = useRef(0);
  useEffect(() => {
    const s = loadSettings();
    if (!ready || !s.backupAuto || !s.githubToken) return;
    if (mutationSeq.current === backedUpSeq.current) return;
    if (backupTimer.current) clearTimeout(backupTimer.current);
    backupTimer.current = setTimeout(() => {
      const seqAtStart = mutationSeq.current;
      runBackup(loadSettings())
        .then(() => {
          backedUpSeq.current = seqAtStart;
        })
        .catch(() => {
          /* status is recorded by runBackup; retried on the next change */
        });
    }, 10_000);
    return () => {
      if (backupTimer.current) clearTimeout(backupTimer.current);
    };
  }, [entries, checkins, ready, settings.backupAuto, settings.githubToken]);

  // Native app: keep the OS notification schedule in sync — one pending
  // check-in notification (with press-and-hold energy actions) per entry
  // still awaiting its check-in. Fires even when the app is closed.
  useEffect(() => {
    if (!ready) return;
    void syncNativeCheckinNotifications(entries, checkedIds);
  }, [ready, entries, checkedIds, settings.checkinDelayMin]);

  // Keep foreground timers armed for every entry still awaiting its check-in.
  useEffect(() => {
    for (const e of entries) {
      if (!checkedIds.has(e.id)) {
        scheduleCheckinTimer(e, () => {
          setTick((n) => n + 1);
          void updateAppBadge();
        });
      } else {
        cancelCheckinTimer(e.id);
      }
    }
    // settings.checkinDelayMin: re-arm all timers when the delay changes.
  }, [entries, checkedIds, settings.checkinDelayMin]);

  /**
   * Read-modify-write against the *current* DB row. Returns null (and writes
   * nothing) if the entry was deleted meanwhile — so a completing analysis
   * can't resurrect a deleted entry or clobber concurrent user edits.
   */
  const patchEntry = useCallback(
    async (id: string, patch: Partial<Entry>): Promise<Entry | null> => {
      const current = await db.getEntry(id);
      if (!current) return null;
      const next: Entry = { ...current, ...patch };
      await db.putEntry(next);
      mutationSeq.current++;
      setEntries((prev) =>
        prev
          .map((e) => (e.id === id ? next : e))
          .sort((a, b) => b.eatenAt - a.eatenAt),
      );
      return next;
    },
    [],
  );

  const runAnalysis = useCallback(
    async (entryId: string) => {
      const s = loadSettings();
      if (!s.apiKey) {
        await patchEntry(entryId, {
          status: "error",
          error: "Add your Anthropic API key in Settings to enable analysis.",
        });
        return;
      }
      const analyzing = await patchEntry(entryId, {
        status: "analyzing",
        error: undefined,
      });
      if (!analyzing) return;
      try {
        const photo =
          analyzing.source === "photo" ? await db.getPhoto(entryId) : undefined;
        const analysis = await analyzeFood(s.apiKey, s.model, {
          photoBase64: photo ? await blobToBase64(photo.blob) : undefined,
          text: analyzing.text,
          eatenAtLabel: fmtDayTime(analyzing.eatenAt),
        });
        await patchEntry(entryId, { analysis, status: "done", error: undefined });
      } catch (err) {
        await patchEntry(entryId, {
          status: "error",
          error: friendlyApiError(err),
        });
      }
    },
    [patchEntry],
  );

  const addEntry = useCallback(
    async (input: NewEntryInput): Promise<Entry> => {
      const entry: Entry = {
        id: uid(),
        createdAt: Date.now(),
        eatenAt: input.eatenAt,
        mealType: mealTypeFor(input.eatenAt),
        source: input.photo ? "photo" : "text",
        text: input.text?.trim() || undefined,
        status: "pending",
      };
      if (input.photo) {
        const resized = await resizePhoto(input.photo);
        await db.putPhoto({ id: entry.id, blob: resized });
      }
      await db.putEntry(entry);
      mutationSeq.current++;
      setEntries((prev) =>
        [entry, ...prev].sort((a, b) => b.eatenAt - a.eatenAt),
      );
      void runAnalysis(entry.id);
      void updateAppBadge();
      return entry;
    },
    [runAnalysis],
  );

  const updateEntry: Store["updateEntry"] = useCallback(
    async (id, patch) => {
      const current = await db.getEntry(id);
      if (!current) return;
      const merged: Partial<Entry> = { ...patch };
      if (
        patch.eatenAt !== undefined &&
        !(patch.mealTypePinned ?? current.mealTypePinned)
      ) {
        merged.mealType = mealTypeFor(patch.eatenAt);
      }
      await patchEntry(id, merged);
      void updateAppBadge();
    },
    [patchEntry],
  );

  const deleteEntry = useCallback(async (id: string) => {
    cancelCheckinTimer(id);
    await db.deleteEntry(id);
    mutationSeq.current++;
    const url = photoUrls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      photoUrls.current.delete(id);
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    void updateAppBadge();
  }, []);

  const reanalyze = useCallback(
    async (id: string) => {
      await runAnalysis(id);
    },
    [runAnalysis],
  );

  const saveCheckin = useCallback(async (c: Omit<Checkin, "id">) => {
    const full: Checkin = { ...c, id: uid() };
    await db.putCheckin(full);
    mutationSeq.current++;
    setCheckins((prev) => [full, ...prev]);
    for (const entryId of c.entryIds) cancelCheckinTimer(entryId);
    void updateAppBadge();
  }, []);

  const removeCheckin = useCallback(async (id: string) => {
    await db.deleteCheckin(id);
    mutationSeq.current++;
    setCheckins((prev) => prev.filter((c) => c.id !== id));
    void updateAppBadge();
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    saveSettings(s);
    setSettings(s);
    applyTheme(s.theme);
  }, []);

  const getPhotoUrl = useCallback(async (id: string): Promise<string | null> => {
    const cached = photoUrls.current.get(id);
    if (cached) return cached;
    const rec = await db.getPhoto(id);
    if (!rec) return null;
    // A concurrent call may have won the race while we awaited.
    const again = photoUrls.current.get(id);
    if (again) return again;
    const url = URL.createObjectURL(rec.blob);
    photoUrls.current.set(id, url);
    return url;
  }, []);

  const value: Store = {
    ready,
    entries,
    checkins,
    settings,
    due,
    addEntry,
    updateEntry,
    deleteEntry,
    reanalyze,
    saveCheckin,
    removeCheckin,
    updateSettings,
    getPhotoUrl,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { NewEntryInput };
