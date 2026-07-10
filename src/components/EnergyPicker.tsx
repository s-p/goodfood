import { ENERGY_LABELS } from "../lib/types";

const FACES = ["", "🪫", "😮‍💨", "😐", "🙂", "⚡"];
const COLORS = ["", "var(--e1)", "var(--e2)", "var(--e3)", "var(--e4)", "var(--e5)"];

export function EnergyPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="energy-row" role="radiogroup" aria-label="Energy level">
      {([1, 2, 3, 4, 5] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          className={`energy-btn${value === v ? " selected" : ""}`}
          style={{ ["--sel" as string]: COLORS[v] }}
          onClick={() => onChange(v)}
        >
          <span aria-hidden>{FACES[v]}</span>
          <small>{ENERGY_LABELS[v]}</small>
        </button>
      ))}
    </div>
  );
}
