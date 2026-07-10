import { useEffect, useState } from "react";
import type { Checkin, Entry } from "../lib/types";
import { ENERGY_LABELS } from "../lib/types";
import { MEAL_LABELS } from "../lib/meals";
import { fmtTime } from "../lib/format";
import { FlagChips } from "./FlagChips";
import { useStore } from "../store";

export function EntryCard({
  entry,
  checkin,
  onOpen,
}: {
  entry: Entry;
  checkin?: Checkin;
  onOpen: () => void;
}) {
  const { getPhotoUrl } = useStore();
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (entry.source === "photo") {
      void getPhotoUrl(entry.id).then((url) => {
        if (alive) setPhoto(url);
      });
    }
    return () => {
      alive = false;
    };
  }, [entry.id, entry.source, getPhotoUrl]);

  const title =
    entry.analysis?.title ??
    entry.text ??
    (entry.status === "analyzing" ? "Analyzing…" : "Meal");

  const statusNote =
    entry.status === "analyzing"
      ? " · analyzing…"
      : entry.status === "error"
        ? " · analysis failed"
        : entry.status === "pending"
          ? " · waiting for analysis"
          : "";

  return (
    <button className="card entry-card" onClick={onOpen}>
      {photo ? (
        <img className="entry-thumb" src={photo} alt="" />
      ) : (
        <div className="entry-thumb placeholder" aria-hidden>
          {entry.source === "photo" ? "📷" : "📝"}
        </div>
      )}
      <div className="entry-main">
        <div className="entry-title">{title}</div>
        <div className="entry-meta">
          {fmtTime(entry.eatenAt)} · {MEAL_LABELS[entry.mealType]}
          {entry.analysis ? ` · ${Math.round(entry.analysis.macros.kcal)} kcal` : ""}
          {statusNote}
        </div>
        {entry.analysis && <FlagChips flags={entry.analysis.flags} />}
      </div>
      {checkin && (
        <span className="entry-energy" title="Energy after this meal">
          {checkin.energy}/5 {ENERGY_LABELS[checkin.energy]}
        </span>
      )}
    </button>
  );
}
