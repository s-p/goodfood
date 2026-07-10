import type { FlagImpact } from "../lib/insights";
import { FLAG_LABELS } from "../lib/types";

/**
 * Paired horizontal bars per flag: average energy after meals where the flag
 * was moderate/high vs. all other rated meals. Scale is the energy scale 1–5.
 */
export function FlagImpactChart({ impacts }: { impacts: FlagImpact[] }) {
  const rows = impacts.filter((i) => i.withCount > 0);
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="viz-legend" aria-hidden>
        <span>
          <i style={{ background: "var(--series-1)" }} />
          After flagged meals
        </span>
        <span>
          <i style={{ background: "var(--series-muted)" }} />
          Other meals
        </span>
      </div>
      {rows.map((r) => (
        <FlagRow key={r.flag} impact={r} />
      ))}
    </div>
  );
}

function Bar({
  value,
  color,
  count,
}: {
  value: number | null;
  color: string;
  count: number;
}) {
  if (value === null) {
    return <div style={{ fontSize: 12, color: "var(--muted)", padding: "2px 0" }}>no data yet</div>;
  }
  const pct = Math.max(3, (value / 5) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: `calc(${pct}% - 56px)`,
          minWidth: 6,
          height: 10,
          background: color,
          borderRadius: "0 4px 4px 0",
        }}
      />
      <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>
        {value.toFixed(1)}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
        {count}×
      </span>
    </div>
  );
}

function FlagRow({ impact }: { impact: FlagImpact }) {
  const delta = impact.delta;
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--hairline)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {FLAG_LABELS[impact.flag]}
        </span>
        {delta !== null && (
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 650,
              color:
                delta <= -0.5
                  ? "var(--danger)"
                  : delta >= 0.5
                    ? "var(--accent)"
                    : "var(--muted)",
            }}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} energy
          </span>
        )}
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <Bar value={impact.withAvg} color="var(--series-1)" count={impact.withCount} />
        <Bar
          value={impact.withoutAvg}
          color="var(--series-muted)"
          count={impact.withoutCount}
        />
      </div>
    </div>
  );
}
