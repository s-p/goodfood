import type { FlagSet } from "../lib/types";
import { FLAG_KEYS, FLAG_LABELS } from "../lib/types";

const LEVEL_WORD = ["", "low", "mod", "high"];

/**
 * Compact chips for flags at level ≥ 2 (moderate/high) — the ones that
 * plausibly matter. Histamine gets a spotlight outline whenever ≥ 1.
 */
export function FlagChips({ flags }: { flags: FlagSet }) {
  const shown = FLAG_KEYS.filter(
    (k) => flags[k] >= 2 || (k === "histamine" && flags[k] >= 1),
  );
  if (shown.length === 0) return null;
  return (
    <div className="entry-flags">
      {shown.map((k) => (
        <span
          key={k}
          className={`chip warn${k === "histamine" ? " spotlight" : ""}`}
        >
          {FLAG_LABELS[k]} {LEVEL_WORD[flags[k]]}
        </span>
      ))}
    </div>
  );
}
