import type { ThemePref } from "./theme";

export interface Settings {
  apiKey: string;
  model: string;
  /** Minutes after eating until the wellbeing check-in is due. */
  checkinDelayMin: number;
  /** Open the camera immediately when the app launches (action-button flow). */
  snapOnLaunch: boolean;
  /** Appearance: follow the OS, or force light/dark. */
  theme: ThemePref;
}

const KEY = "goodfood.settings";

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "claude-opus-4-8",
  checkinDelayMin: 30,
  snapOnLaunch: false,
  theme: "system",
};

export const MODEL_OPTIONS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — best analysis (default)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — fast, near-Opus quality" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest, cheapest" },
];

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
