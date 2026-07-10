import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import type { MealType } from "../lib/types";
import { ENERGY_LABELS, FLAG_KEYS, FLAG_LABELS } from "../lib/types";
import { MEAL_LABELS } from "../lib/meals";
import { fromLocalInputValue, toLocalInputValue } from "../lib/format";
import { ChevronLeft } from "../components/Icons";

const LEVEL_LABELS = ["none", "low", "moderate", "high"];

export function EntryDetailScreen({ id, onBack, onCheckin }: {
  id: string;
  onBack: () => void;
  onCheckin: () => void;
}) {
  const { entries, checkins, updateEntry, deleteEntry, reanalyze, getPhotoUrl, removeCheckin } =
    useStore();
  const entry = entries.find((e) => e.id === id);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPhoto(null); // never show the previous entry's photo while loading
    if (entry?.source === "photo") {
      void getPhotoUrl(id).then((u) => alive && setPhoto(u));
    }
    return () => {
      alive = false;
    };
  }, [id, entry?.source, getPhotoUrl]);

  const entryCheckins = useMemo(
    () => checkins.filter((c) => c.entryIds.includes(id)),
    [checkins, id],
  );

  if (!entry) {
    return (
      <div>
        <div className="back-row">
          <button className="back-btn" onClick={onBack}>
            <ChevronLeft /> Back
          </button>
        </div>
        <div className="empty">This entry no longer exists.</div>
      </div>
    );
  }

  const a = entry.analysis;

  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft /> Back
        </button>
        <button
          className="btn danger"
          style={{ padding: "8px 16px", fontSize: 13.5 }}
          onClick={() => {
            if (confirm("Delete this entry and its check-ins' link to it?")) {
              void deleteEntry(id).then(onBack);
            }
          }}
        >
          Delete
        </button>
      </div>

      {photo && <img src={photo} alt="Food" className="detail-photo" />}

      <h1 style={{ fontSize: 23, margin: "14px 2px 2px" }}>
        {a?.title ?? entry.text ?? "Meal"}
      </h1>
      {a && (
        <p className="screen-sub">
          {Math.round(a.macros.kcal)} kcal · confidence {a.confidence}
          {entry.text ? ` · “${entry.text}”` : ""}
        </p>
      )}

      {entry.status === "analyzing" && (
        <div className="notice">Analyzing your {entry.source === "photo" ? "photo" : "entry"}…</div>
      )}
      {entry.status === "error" && (
        <div className="notice error">
          {entry.error ?? "Analysis failed."}
          <div style={{ marginTop: 8 }}>
            <button className="btn quiet" onClick={() => void reanalyze(id)}>
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="section-label">Time & meal</div>
      <div className="card card-pad">
        <div className="field" style={{ marginTop: 0 }}>
          <label>Eaten at</label>
          {/* Uncontrolled (keyed by entry id) so background re-renders —
              analysis completing, timers, reloads — can't reset a value
              the user is mid-way through editing. */}
          <input
            key={id}
            type="datetime-local"
            defaultValue={toLocalInputValue(entry.eatenAt)}
            onChange={(e) => {
              const t = fromLocalInputValue(e.target.value);
              if (t) void updateEntry(id, { eatenAt: t });
            }}
          />
        </div>
        <div className="field">
          <label>Meal</label>
          <div className="seg">
            {(Object.keys(MEAL_LABELS) as MealType[]).map((m) => (
              <button
                key={m}
                className={entry.mealType === m ? "active" : ""}
                onClick={() => void updateEntry(id, { mealType: m, mealTypePinned: true })}
              >
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {a && (
        <>
          <div className="section-label">What's in it</div>
          <div className="card card-pad">
            {a.items.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 14 }}>
                No components identified.
              </div>
            )}
            {a.items.map((it, i) => (
              <div className="item-row" key={i}>
                <span style={{ textTransform: "capitalize" }}>{it.name}</span>
                <span className="q">{it.quantity}</span>
              </div>
            ))}
          </div>

          <div className="section-label">Macros (whole serving)</div>
          <div className="card card-pad">
            <div className="macro-grid" style={{ marginTop: 0 }}>
              {(
                [
                  ["kcal", a.macros.kcal, ""],
                  ["protein", a.macros.protein_g, "g"],
                  ["carbs", a.macros.carbs_g, "g"],
                  ["fat", a.macros.fat_g, "g"],
                  ["sugar", a.macros.sugar_g, "g"],
                  ["fiber", a.macros.fiber_g, "g"],
                ] as const
              ).map(([k, v, unit]) => (
                <div className="macro-tile" key={k}>
                  <div className="v">
                    {Math.round(v)}
                    {unit}
                  </div>
                  <div className="k">{k}</div>
                </div>
              ))}
            </div>
            {a.micros.length > 0 && (
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "12px 0 0" }}>
                Notable micros: {a.micros.join(", ")}
              </p>
            )}
          </div>

          <div className="section-label">Sensitivity flags</div>
          <div className="card card-pad">
            {FLAG_KEYS.map((k) => (
              <div className="flag-row" key={k}>
                <span className="flag-name">
                  {FLAG_LABELS[k]}
                  {k === "histamine" ? " ✳" : ""}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={`level-dots${a.flags[k] === 0 ? " none" : ""}`}>
                    {[1, 2, 3].map((lv) => (
                      <i key={lv} className={a.flags[k] >= lv ? "on" : ""} />
                    ))}
                  </span>
                  <span className="level-label">{LEVEL_LABELS[a.flags[k]]}</span>
                </span>
              </div>
            ))}
            {a.flag_notes && (
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "12px 0 0" }}>
                {a.flag_notes}
              </p>
            )}
          </div>
        </>
      )}

      <div className="section-label">Wellbeing after</div>
      <div className="card card-pad">
        {entryCheckins.length === 0 ? (
          <>
            <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 14 }}>
              No check-in yet for this entry.
            </p>
            <button className="btn primary block" onClick={onCheckin}>
              Check in now
            </button>
          </>
        ) : (
          entryCheckins.map((c) => (
            <div className="flag-row" key={c.id}>
              <span>
                <b>
                  {c.energy}/5 {ENERGY_LABELS[c.energy]}
                </b>
                {c.symptoms.length > 0 && (
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                    {c.symptoms.join(", ")}
                  </div>
                )}
                {c.note && (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>“{c.note}”</div>
                )}
              </span>
              <button
                className="btn quiet"
                style={{ padding: "6px 12px", fontSize: 12.5 }}
                onClick={() => void removeCheckin(c.id)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {a && (
        <button
          className="btn quiet block"
          style={{ marginTop: 14 }}
          onClick={() => void reanalyze(id)}
        >
          Re-run analysis
        </button>
      )}
    </div>
  );
}
