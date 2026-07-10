export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/** 0 = none · 1 = low · 2 = moderate · 3 = high */
export type FlagLevel = 0 | 1 | 2 | 3;

export type FlagKey =
  | "histamine"
  | "gluten"
  | "lactose"
  | "fructose"
  | "fat"
  | "sugar"
  | "spicy";

export const FLAG_KEYS: FlagKey[] = [
  "histamine",
  "gluten",
  "lactose",
  "fructose",
  "fat",
  "sugar",
  "spicy",
];

export const FLAG_LABELS: Record<FlagKey, string> = {
  histamine: "Histamine",
  gluten: "Gluten",
  lactose: "Lactose",
  fructose: "Fructose",
  fat: "High fat",
  sugar: "High sugar",
  spicy: "Spicy",
};

export type FlagSet = Record<FlagKey, FlagLevel>;

export interface FoodItem {
  name: string;
  quantity: string;
}

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
}

export interface Analysis {
  title: string;
  items: FoodItem[];
  macros: Macros;
  micros: string[];
  flags: FlagSet;
  flag_notes: string;
  confidence: "low" | "medium" | "high";
}

export type EntryStatus = "pending" | "analyzing" | "done" | "error";

export interface Entry {
  id: string;
  createdAt: number;
  /** When it was actually eaten/drunk — editable, may be backdated. */
  eatenAt: number;
  mealType: MealType;
  /** True once the user manually picked a meal type (stop auto-deriving). */
  mealTypePinned?: boolean;
  source: "photo" | "text";
  text?: string;
  analysis?: Analysis;
  status: EntryStatus;
  error?: string;
}

/** Photos are stored separately so entry lists stay light. */
export interface PhotoRecord {
  id: string; // same id as the entry
  blob: Blob;
}

export interface Checkin {
  id: string;
  entryIds: string[];
  at: number;
  energy: 1 | 2 | 3 | 4 | 5;
  symptoms: string[];
  note?: string;
}

export const ENERGY_LABELS: Record<number, string> = {
  1: "Drained",
  2: "Low",
  3: "Okay",
  4: "Good",
  5: "Energized",
};

export interface SymptomGroup {
  label: string;
  hint?: string;
  symptoms: string[];
}

export const SYMPTOM_GROUPS: SymptomGroup[] = [
  {
    label: "Histamine-typical",
    hint: "worth tracking closely for you",
    symptoms: [
      "Flushing",
      "Headache",
      "Congestion",
      "Itching",
      "Racing heart",
    ],
  },
  {
    label: "Digestion",
    symptoms: ["Bloating", "Cramps", "Nausea", "Reflux", "Urgency"],
  },
  {
    label: "General",
    symptoms: ["Fatigue", "Brain fog", "Jitters", "Sleepy"],
  },
];

export const HISTAMINE_SYMPTOMS = new Set(SYMPTOM_GROUPS[0].symptoms);
