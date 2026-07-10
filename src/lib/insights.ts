import type { Checkin, Entry, FlagKey, MealType } from "./types";
import { FLAG_KEYS, HISTAMINE_SYMPTOMS } from "./types";

export interface FoodScore {
  name: string;
  avgEnergy: number;
  count: number;
  mealTypes: Set<MealType>;
}

export interface FlagImpact {
  flag: FlagKey;
  /** Mean energy after meals where this flag was moderate/high (level ≥ 2). */
  withAvg: number | null;
  withCount: number;
  /** Mean energy after meals where this flag was none/low. */
  withoutAvg: number | null;
  withoutCount: number;
  /** withAvg − withoutAvg, when both sides have data. */
  delta: number | null;
  /** Share of flagged meals followed by histamine-typical symptoms. */
  symptomRateWith: number | null;
  symptomRateWithout: number | null;
}

export interface InsightData {
  ratedEntries: number;
  totalEntries: number;
  totalCheckins: number;
  avgEnergy: number | null;
  foods: FoodScore[];
  highEnergy: FoodScore[];
  lowEnergy: FoodScore[];
  flagImpacts: FlagImpact[];
}

/**
 * Each check-in rates the entries it covers. If an entry appears in several
 * check-ins, the one closest after eating wins.
 */
export function energyByEntry(
  entries: Entry[],
  checkins: Checkin[],
): Map<string, Checkin> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const best = new Map<string, Checkin>();
  for (const c of checkins) {
    for (const id of c.entryIds) {
      const entry = byId.get(id);
      if (!entry) continue;
      const prev = best.get(id);
      if (
        !prev ||
        Math.abs(c.at - entry.eatenAt) < Math.abs(prev.at - entry.eatenAt)
      ) {
        best.set(id, c);
      }
    }
  }
  return best;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeInsights(entries: Entry[], checkins: Checkin[]): InsightData {
  const rated = energyByEntry(entries, checkins);

  // ---- per-food scores ----
  const foodAcc = new Map<string, { sum: number; count: number; meals: Set<MealType> }>();
  for (const e of entries) {
    const c = rated.get(e.id);
    if (!c) continue;
    const names = new Set<string>();
    for (const item of e.analysis?.items ?? []) names.add(item.name);
    if (names.size === 0 && e.analysis?.title) {
      names.add(e.analysis.title.toLowerCase());
    } else if (names.size === 0 && e.text) {
      names.add(e.text.toLowerCase().slice(0, 40));
    }
    for (const name of names) {
      const acc = foodAcc.get(name) ?? { sum: 0, count: 0, meals: new Set<MealType>() };
      acc.sum += c.energy;
      acc.count += 1;
      acc.meals.add(e.mealType);
      foodAcc.set(name, acc);
    }
  }
  const foods: FoodScore[] = [...foodAcc.entries()]
    .map(([name, a]) => ({
      name,
      avgEnergy: round1(a.sum / a.count),
      count: a.count,
      mealTypes: a.meals,
    }))
    .sort((a, b) => b.avgEnergy - a.avgEnergy || b.count - a.count);

  const highEnergy = foods.filter((f) => f.avgEnergy >= 3.5);
  const lowEnergy = foods
    .filter((f) => f.avgEnergy <= 2.5)
    .sort((a, b) => a.avgEnergy - b.avgEnergy || b.count - a.count);

  // ---- per-flag impact ----
  const flagImpacts: FlagImpact[] = FLAG_KEYS.map((flag) => {
    let withSum = 0,
      withCount = 0,
      withoutSum = 0,
      withoutCount = 0,
      withSymptomatic = 0,
      withoutSymptomatic = 0;
    for (const e of entries) {
      const c = rated.get(e.id);
      if (!c || !e.analysis) continue;
      const symptomatic = c.symptoms.some((s) => HISTAMINE_SYMPTOMS.has(s));
      if (e.analysis.flags[flag] >= 2) {
        withSum += c.energy;
        withCount += 1;
        if (symptomatic) withSymptomatic += 1;
      } else {
        withoutSum += c.energy;
        withoutCount += 1;
        if (symptomatic) withoutSymptomatic += 1;
      }
    }
    const withAvg = withCount ? round1(withSum / withCount) : null;
    const withoutAvg = withoutCount ? round1(withoutSum / withoutCount) : null;
    return {
      flag,
      withAvg,
      withCount,
      withoutAvg,
      withoutCount,
      delta: withAvg !== null && withoutAvg !== null ? round1(withAvg - withoutAvg) : null,
      symptomRateWith: withCount ? withSymptomatic / withCount : null,
      symptomRateWithout: withoutCount ? withoutSymptomatic / withoutCount : null,
    };
  });

  const energies = [...rated.values()].map((c) => c.energy);
  return {
    ratedEntries: rated.size,
    totalEntries: entries.length,
    totalCheckins: checkins.length,
    avgEnergy: energies.length
      ? round1(energies.reduce((a, b) => a + b, 0) / energies.length)
      : null,
    foods,
    highEnergy,
    lowEnergy,
    flagImpacts,
  };
}
