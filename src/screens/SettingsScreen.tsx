import { useRef, useState } from "react";
import { useStore } from "../store";
import { MODEL_OPTIONS } from "../lib/settings";
import { ensureNotificationPermission, showCheckinNotification } from "../lib/notify";
import { db } from "../lib/db";
import type { Checkin, Entry } from "../lib/types";

const MEALS = ["breakfast", "lunch", "dinner", "snack"];

/** Imports come from arbitrary files — validate before they enter the DB. */
function isValidEntry(e: unknown): e is Entry {
  const x = e as Partial<Entry> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    x.id.length > 0 &&
    typeof x.eatenAt === "number" &&
    isFinite(x.eatenAt) &&
    typeof x.createdAt === "number" &&
    MEALS.includes(x.mealType as string) &&
    (x.source === "photo" || x.source === "text") &&
    typeof x.status === "string"
  );
}

function isValidCheckin(c: unknown): c is Checkin {
  const x = c as Partial<Checkin> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    x.id.length > 0 &&
    Array.isArray(x.entryIds) &&
    x.entryIds.every((i) => typeof i === "string") &&
    typeof x.at === "number" &&
    isFinite(x.at) &&
    typeof x.energy === "number" &&
    x.energy >= 1 &&
    x.energy <= 5 &&
    Array.isArray(x.symptoms) &&
    x.symptoms.every((s: unknown) => typeof s === "string")
  );
}

export function SettingsScreen({ onOpenGuide }: { onOpenGuide: () => void }) {
  const { settings, updateSettings, entries, checkins } = useStore();
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [delayDraft, setDelayDraft] = useState(String(settings.checkinDelayMin));

  async function testNotification() {
    const ok = await ensureNotificationPermission();
    if (!ok) {
      setNotifStatus(
        "Notifications unavailable. On iPhone: add the app to your Home Screen first, then allow notifications.",
      );
      return;
    }
    const probe: Entry = {
      id: "test",
      createdAt: Date.now(),
      eatenAt: Date.now() - settings.checkinDelayMin * 60_000,
      mealType: "snack",
      source: "text",
      text: "a test snack",
      status: "done",
    };
    // test: true → the service worker won't persist a check-in for it.
    await showCheckinNotification(probe, { test: true });
    setNotifStatus("Test notification sent ✓");
  }

  function exportData() {
    const payload = {
      app: "goodfood",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
      checkins,
      note: "Photos are not included in exports.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `goodfood-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // Revoking synchronously can abort the download in Safari/Firefox.
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== "goodfood" || !Array.isArray(parsed.entries)) {
        throw new Error("Not a GoodFood export file.");
      }
      const existingEntries = new Set(entries.map((e) => e.id));
      const existingCheckins = new Set(checkins.map((c) => c.id));
      let added = 0;
      let skipped = 0;
      for (const e of (parsed.entries as unknown[]) ?? []) {
        if (!isValidEntry(e)) {
          skipped++;
          continue;
        }
        if (existingEntries.has(e.id)) continue;
        existingEntries.add(e.id);
        await db.putEntry(e);
        added++;
      }
      for (const c of ((parsed.checkins ?? []) as unknown[])) {
        if (!isValidCheckin(c)) {
          skipped++;
          continue;
        }
        if (existingCheckins.has(c.id)) continue;
        existingCheckins.add(c.id);
        await db.putCheckin(c);
        added++;
      }
      setImportMsg(
        `Imported ${added} new records${skipped ? `, skipped ${skipped} malformed` : ""}. Reloading…`,
      );
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed.");
    }
  }

  return (
    <div>
      <h1 className="screen-title">Settings</h1>
      <p className="screen-sub">Everything stays on this device.</p>

      <div className="section-label">AI analysis</div>
      <div className="card card-pad">
        <div className="field" style={{ marginTop: 0 }}>
          <label>Anthropic API key</label>
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-ant-…"
            autoComplete="off"
            onChange={(e) => updateSettings({ ...settings, apiKey: e.target.value.trim() })}
          />
          <div className="field-hint">
            Stored only in this browser. Get one at console.anthropic.com. Photos
            are sent directly from your phone to Anthropic for analysis — no
            other server involved.
          </div>
        </div>
        <div className="field">
          <label>Model</label>
          <select
            value={settings.model}
            onChange={(e) => updateSettings({ ...settings, model: e.target.value })}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="section-label">Check-ins</div>
      <div className="card card-pad">
        <div className="field" style={{ marginTop: 0 }}>
          <label>Remind me after (minutes)</label>
          {/* Free typing; clamp only when leaving the field — clamping per
              keystroke makes values like "15" impossible to type. */}
          <input
            type="number"
            min={5}
            max={240}
            inputMode="numeric"
            value={delayDraft}
            onChange={(e) => setDelayDraft(e.target.value)}
            onBlur={() => {
              const n = Math.min(240, Math.max(5, Number(delayDraft) || 30));
              setDelayDraft(String(n));
              updateSettings({ ...settings, checkinDelayMin: n });
            }}
          />
        </div>
        <div className="switch-row">
          <div>
            <div className="title">Notifications</div>
            <div className="sub">
              Fire while the app is open; the badge covers the rest.
            </div>
          </div>
          <button className="btn quiet" onClick={testNotification} style={{ padding: "8px 14px" }}>
            Test
          </button>
        </div>
        {notifStatus && <div className="notice">{notifStatus}</div>}
      </div>

      <div className="section-label">Quick capture</div>
      <div className="card card-pad">
        <div className="switch-row" style={{ padding: "2px 0" }}>
          <div>
            <div className="title">Open camera on launch</div>
            <div className="sub">
              Pair with the iPhone Action Button for one-press logging.
            </div>
          </div>
          <button
            className={`toggle${settings.snapOnLaunch ? " on" : ""}`}
            role="switch"
            aria-checked={settings.snapOnLaunch}
            onClick={() =>
              updateSettings({ ...settings, snapOnLaunch: !settings.snapOnLaunch })
            }
          />
        </div>
        <button className="btn quiet block" style={{ marginTop: 12 }} onClick={onOpenGuide}>
          📱 iPhone setup guide (Action Button & notifications)
        </button>
      </div>

      <div className="section-label">Your data</div>
      <div className="card card-pad">
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn quiet" style={{ flex: 1 }} onClick={exportData}>
            Export JSON
          </button>
          <button
            className="btn quiet"
            style={{ flex: 1 }}
            onClick={() => importRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
            }}
          />
        </div>
        {importMsg && <div className="notice">{importMsg}</div>}
        <p className="field-hint">
          {entries.length} entries · {checkins.length} check-ins on this device.
        </p>
      </div>
    </div>
  );
}
