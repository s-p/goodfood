import { useMemo } from "react";
import { useStore } from "../store";
import { EntryCard } from "../components/EntryCard";
import { dayKey, fmtDay } from "../lib/format";
import { energyByEntry } from "../lib/insights";

export function LogScreen({ onOpenEntry, onCheckin }: {
  onOpenEntry: (id: string) => void;
  onCheckin: () => void;
}) {
  const { entries, checkins, due, settings } = useStore();

  const byDay = useMemo(() => {
    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const k = dayKey(e.eatenAt);
      const g = groups.get(k) ?? [];
      g.push(e);
      groups.set(k, g);
    }
    return [...groups.entries()];
  }, [entries]);

  const rated = useMemo(() => energyByEntry(entries, checkins), [entries, checkins]);

  return (
    <div>
      <h1 className="screen-title">GoodFood</h1>
      <p className="screen-sub">Snap it, eat it, then tell me how you feel.</p>

      {!settings.apiKey && entries.length > 0 && (
        <div className="notice">
          Photo analysis is off — add your Anthropic API key in Settings.
        </div>
      )}

      {due.length > 0 && (
        <button className="banner" onClick={onCheckin}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <span>
            How are you feeling?
            <div className="sub">
              {due.length === 1
                ? `Check-in due for ${due[0].analysis?.title ?? due[0].text ?? "your last entry"}`
                : `${due.length} check-ins due`}
            </div>
          </span>
        </button>
      )}

      {entries.length === 0 && (
        <div className="empty card" style={{ marginTop: 16 }}>
          <div className="big">🍜</div>
          Log your first meal with the camera button below.
          <br />
          Photos get broken down into macros, histamine, gluten & more.
        </div>
      )}

      {byDay.map(([key, dayEntries]) => (
        <div key={key}>
          <div className="section-label">{fmtDay(dayEntries[0].eatenAt)}</div>
          {dayEntries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              checkin={rated.get(e.id)}
              onOpen={() => onOpenEntry(e.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
