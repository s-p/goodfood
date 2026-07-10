import { useMemo, useState } from "react";
import { useStore } from "../store";
import { EnergyPicker } from "../components/EnergyPicker";
import { SYMPTOM_GROUPS } from "../lib/types";
import { fmtTime } from "../lib/format";
import { ChevronLeft } from "../components/Icons";

/**
 * One fast screen: pick energy, tap symptoms, done. Applies to every entry
 * whose check-in is due (all pre-selected); recent unchecked entries can be
 * toggled in too.
 */
export function CheckinScreen({ onDone, focusEntryId }: {
  onDone: () => void;
  focusEntryId?: string;
}) {
  const { entries, checkins, due, saveCheckin } = useStore();

  const checkedIds = useMemo(
    () => new Set(checkins.flatMap((c) => c.entryIds)),
    [checkins],
  );

  // Candidates: due entries + anything unchecked from the last 4 hours +
  // the entry this screen was opened for.
  const candidates = useMemo(() => {
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    const list = entries
      .filter(
        (e) =>
          e.id === focusEntryId ||
          due.some((d) => d.id === e.id) ||
          (!checkedIds.has(e.id) && e.eatenAt >= cutoff),
      )
      .sort((a, b) => b.eatenAt - a.eatenAt)
      .slice(0, 6);
    // The entry this screen was opened for must never be truncated away.
    const focus = focusEntryId && entries.find((e) => e.id === focusEntryId);
    if (focus && !list.some((e) => e.id === focus.id)) {
      list.splice(list.length - 1, 1, focus);
    }
    return list;
  }, [entries, due, checkedIds, focusEntryId]);

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        candidates
          .filter((e) => e.id === focusEntryId || due.some((d) => d.id === e.id))
          .map((e) => e.id),
      ),
  );
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [symptoms, setSymptoms] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleEntry(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSymptom(s: string) {
    setSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function save() {
    if (!energy) return;
    setSaving(true);
    try {
      await saveCheckin({
        entryIds: [...selected],
        at: Date.now(),
        energy,
        symptoms: [...symptoms],
        note: note.trim() || undefined,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={onDone}>
          <ChevronLeft /> Back
        </button>
      </div>
      <h1 className="screen-title" style={{ paddingTop: 0 }}>
        How do you feel?
      </h1>
      <p className="screen-sub">Takes five seconds — your future self says thanks.</p>

      <div className="section-label">Energy right now</div>
      <EnergyPicker value={energy} onChange={setEnergy} />

      <div className="section-label">Any of these?</div>
      {SYMPTOM_GROUPS.map((g) => (
        <div key={g.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 2px 0" }}>
            {g.label}
            {g.hint ? ` — ${g.hint}` : ""}
          </div>
          <div className="symptom-grid">
            {g.symptoms.map((s) => (
              <button
                key={s}
                className={`symptom-chip${symptoms.has(s) ? " on" : ""}`}
                onClick={() => toggleSymptom(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}

      {candidates.length > 0 && (
        <>
          <div className="section-label">This covers</div>
          <div className="card card-pad">
            {candidates.map((e) => (
              <label
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  fontSize: 14.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggleEntry(e.id)}
                  style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
                />
                <span style={{ flex: 1 }}>
                  {e.analysis?.title ?? e.text ?? "Meal"}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {fmtTime(e.eatenAt)}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="field">
        <label>Note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. slept badly, stressful morning"
        />
      </div>

      <button
        className="btn primary block"
        style={{ marginTop: 18 }}
        disabled={!energy || saving}
        onClick={save}
      >
        {saving ? "Saving…" : "Save check-in"}
      </button>
      {candidates.length > 0 && selected.size === 0 && (
        <p className="field-hint" style={{ textAlign: "center" }}>
          Not linked to any entry — it will still be saved as a general check-in.
        </p>
      )}
    </div>
  );
}
