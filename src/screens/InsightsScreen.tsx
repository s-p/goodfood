import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  computeFoodScores,
  computeInsights,
  highEnergyFoods,
  lowEnergyFoods,
  type FoodScore,
} from "../lib/insights";
import { FlagImpactChart } from "../components/FlagImpactChart";
import type { MealType } from "../lib/types";
import { MEAL_LABELS } from "../lib/meals";

type MealFilter = MealType | "all";

export function InsightsScreen() {
  const { entries, checkins } = useStore();
  const [meal, setMeal] = useState<MealFilter>("all");
  const data = useMemo(() => computeInsights(entries, checkins), [entries, checkins]);

  // Recomputed per meal tab so breakfast really means "eaten at breakfast".
  const mealFoods = useMemo(
    () =>
      computeFoodScores(entries, checkins, meal === "all" ? undefined : meal),
    [entries, checkins, meal],
  );
  const high = highEnergyFoods(mealFoods).slice(0, 12);
  const low = lowEnergyFoods(mealFoods).slice(0, 12);

  const histamine = data.flagImpacts.find((f) => f.flag === "histamine");
  const fat = data.flagImpacts.find((f) => f.flag === "fat");

  return (
    <div>
      <h1 className="screen-title">Insights</h1>
      <p className="screen-sub">What your food does to your energy.</p>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="label">Logged</div>
          <div className="value">{data.totalEntries}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Check-ins</div>
          <div className="value">{data.totalCheckins}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Avg energy</div>
          <div className="value">{data.avgEnergy ?? "–"}</div>
        </div>
      </div>

      {data.ratedEntries < 3 ? (
        <div className="empty card" style={{ marginTop: 16 }}>
          <div className="big">📈</div>
          Insights unlock after a few check-ins.
          <br />
          Log meals and answer the “how do you feel?” nudges — patterns show up
          after ~5–10 rated meals.
        </div>
      ) : (
        <>
          {histamine && histamine.withCount >= 2 && (
            <SpotlightCard
              title="Histamine watch"
              body={spotlightText(
                histamine.delta,
                histamine.withCount,
                histamine.symptomRateWith,
                histamine.symptomRateWithout,
              )}
            />
          )}
          {fat && fat.withCount >= 2 && fat.delta !== null && fat.delta <= -0.5 && (
            <SpotlightCard
              title="High-fat meals (no gallbladder)"
              body={`Your energy averages ${fat.withAvg} after high-fat meals vs ${fat.withoutAvg} otherwise (${fat.withCount} vs ${fat.withoutCount} meals). Smaller fat portions might treat you better.`}
            />
          )}

          <div className="section-label">Foods by meal</div>
          <div className="mealtabs">
            {(["all", "breakfast", "lunch", "dinner", "snack"] as MealFilter[]).map(
              (m) => (
                <button
                  key={m}
                  className={meal === m ? "active" : ""}
                  onClick={() => setMeal(m)}
                >
                  {m === "all" ? "All" : MEAL_LABELS[m as MealType]}
                </button>
              ),
            )}
          </div>

          <FoodList
            title="⚡ High-energy foods"
            foods={high}
            good
            emptyText="Nothing scores ≥3.5 for this meal yet."
          />
          <FoodList
            title="🪫 Avoid — low energy after"
            foods={low}
            good={false}
            emptyText="Nothing scores ≤2.5 for this meal yet — nice."
          />

          <div className="section-label">Energy by sensitivity flag</div>
          <div className="card card-pad">
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-2)" }}>
              Average energy (1–5) after meals rated moderate/high for each flag,
              compared with all other rated meals.
            </p>
            <FlagImpactChart impacts={data.flagImpacts} />
          </div>
        </>
      )}
    </div>
  );
}

function spotlightText(
  delta: number | null,
  withCount: number,
  rateWith: number | null,
  rateWithout: number | null,
): string {
  const parts: string[] = [];
  if (delta !== null) {
    if (delta <= -0.5) {
      parts.push(
        `High-histamine meals cost you about ${Math.abs(delta).toFixed(1)} energy points on average (${withCount} meals so far).`,
      );
    } else if (delta >= 0.5) {
      parts.push(
        `So far high-histamine meals haven't hurt your energy (${withCount} meals) — keep watching.`,
      );
    } else {
      parts.push(
        `No clear energy difference after high-histamine meals yet (${withCount} meals).`,
      );
    }
  }
  if (rateWith !== null && rateWithout !== null && rateWith > rateWithout + 0.15) {
    parts.push(
      `Histamine-typical symptoms follow ${Math.round(rateWith * 100)}% of flagged meals vs ${Math.round(rateWithout * 100)}% of the rest — that's a signal.`,
    );
  }
  return parts.join(" ") || "Keep logging — more data sharpens this.";
}

function SpotlightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>{body}</p>
    </div>
  );
}

function FoodList({
  title,
  foods,
  good,
  emptyText,
}: {
  title: string;
  foods: FoodScore[];
  good: boolean;
  emptyText: string;
}) {
  return (
    <div className="card card-pad" style={{ marginTop: 12 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>{title}</h3>
      {foods.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
          {emptyText}
        </p>
      ) : (
        foods.map((f) => (
          <div className="food-row" key={f.name}>
            <span className="food-name">{f.name}</span>
            <span className="food-count">{f.count}×</span>
            <span className={`food-score ${good ? "good" : "bad"}`}>
              {f.avgEnergy.toFixed(1)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
