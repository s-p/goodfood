import type { MealType } from "./types";

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Derive a meal type from the time of day. Users can always override. */
export function mealTypeFor(ts: number): MealType {
  const h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17.5 && h < 22) return "dinner";
  return "snack";
}
