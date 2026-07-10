import type { Checkin, Entry } from "./types";

const MEALS = ["breakfast", "lunch", "dinner", "snack"];

/** Imports/restores come from arbitrary files — validate before the DB. */
export function isValidEntry(e: unknown): e is Entry {
  const x = e as Partial<Entry> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    x.id.length > 0 &&
    typeof x.eatenAt === "number" &&
    isFinite(x.eatenAt) &&
    typeof x.createdAt === "number" &&
    MEALS.includes(x.mealType as string) &&
    (x.source === "photo" || x.source === "text") &&
    typeof x.status === "string"
  );
}

export function isValidCheckin(c: unknown): c is Checkin {
  const x = c as Partial<Checkin> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    x.id.length > 0 &&
    Array.isArray(x.entryIds) &&
    x.entryIds.every((i) => typeof i === "string") &&
    typeof x.at === "number" &&
    isFinite(x.at) &&
    typeof x.energy === "number" &&
    x.energy >= 1 &&
    x.energy <= 5 &&
    Array.isArray(x.symptoms) &&
    x.symptoms.every((s: unknown) => typeof s === "string")
  );
}
