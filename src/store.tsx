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
import type { Checkin, Entry, MealType } from "./lib/types";
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
  const [, bump] = useState(0); // re-render when a timer fires
  const photoUrls = useRef(new Map<string, string>());

  const reload = useCallback(async () => {
    const [e, c] = await Promise.all([db.allEntries(), db.allCheckins()]);
    e.sort((a, b) => b.eatenAt - a.eatenAt);
    c.sort((a, b) => b.at - a.at);
    setEntries(e);
    setCheckins(c);
    void updateAppBadge();
  }, []);

  useEffect(() => {
    void reload().then(() => setReady(true));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, checkedIds, ready],
  );

  // Keep foreground timers armed for every entry still awaiting its check-in.
  useEffect(() => {
    for (const e of entries) {
      if (!checkedIds.has(e.id)) {
        scheduleCheckinTimer(e, () => {
          bump((n) => n + 1);
          void updateAppBadge();
        });
      } else {
        cancelCheckinTimer(e.id);
      }
    }
  }, [entries, checkedIds]);

  const runAnalysis = useCallback(
    async (entry: Entry) => {
      const s = loadSettings();
      if (!s.apiKey) {
        const noKey: Entry = {
          ...entry,
          status: "error",
          error: "Add your Anthropic API key in Settings to enable analysis.",
        };
        await db.putEntry(noKey);
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? noKey : e)));
        return;
      }
      const analyzing: Entry = { ...entry, status: "analyzing", error: undefined };
      await db.putEntry(analyzing);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? analyzing : e)));
      try {
        const photo = entry.source === "photo" ? await db.getPhoto(entry.id) : undefined;
        const analysis = await analyzeFood(s.apiKey, s.model, {
          photoBase64: photo ? await blobToBase64(photo.blob) : undefined,
          text: entry.text,
          eatenAtLabel: fmtDayTime(entry.eatenAt),
        });
        const done: Entry = { ...analyzing, analysis, status: "done" };
        await db.putEntry(done);
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? done : e)));
      } catch (err) {
        const failed: Entry = {
          ...analyzing,
          status: "error",
          error: friendlyApiError(err),
        };
        await db.putEntry(failed);
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? failed : e)));
      }
    },
    [],
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
      setEntries((prev) =>
        [entry, ...prev].sort((a, b) => b.eatenAt - a.eatenAt),
      );
      void runAnalysis(entry);
      void updateAppBadge();
      return entry;
    },
    [runAnalysis],
  );

  const updateEntry: Store["updateEntry"] = useCallback(async (id, patch) => {
    const current = await db.getEntry(id);
    if (!current) return;
    const next: Entry = { ...current, ...patch };
    if (patch.eatenAt !== undefined && !next.mealTypePinned) {
      next.mealType = mealTypeFor(patch.eatenAt);
    }
    await db.putEntry(next);
    setEntries((prev) =>
      prev
        .map((e) => (e.id === id ? next : e))
        .sort((a, b) => b.eatenAt - a.eatenAt),
    );
    void updateAppBadge();
  }, []);

  const deleteEntry = useCallback(async (id: string) => {
    cancelCheckinTimer(id);
    await db.deleteEntry(id);
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
      const entry = await db.getEntry(id);
      if (entry) await runAnalysis(entry);
    },
    [runAnalysis],
  );

  const saveCheckin = useCallback(async (c: Omit<Checkin, "id">) => {
    const full: Checkin = { ...c, id: uid() };
    await db.putCheckin(full);
    setCheckins((prev) => [full, ...prev]);
    for (const entryId of c.entryIds) cancelCheckinTimer(entryId);
    void updateAppBadge();
  }, []);

  const removeCheckin = useCallback(async (id: string) => {
    await db.deleteCheckin(id);
    setCheckins((prev) => prev.filter((c) => c.id !== id));
    void updateAppBadge();
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    saveSettings(s);
    setSettings(s);
  }, []);

  const getPhotoUrl = useCallback(async (id: string): Promise<string | null> => {
    const cached = photoUrls.current.get(id);
    if (cached) return cached;
    const rec = await db.getPhoto(id);
    if (!rec) return null;
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
export function suggestedMealLabel(mealType: MealType): string {
  return mealType[0].toUpperCase() + mealType.slice(1);
}
