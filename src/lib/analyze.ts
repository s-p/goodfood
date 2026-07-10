import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, FlagLevel, FlagSet } from "./types";
import { FLAG_KEYS } from "./types";

const SYSTEM_PROMPT = `You are a meticulous nutrition analyst inside a personal food-and-wellbeing tracker.

The user logs everything they eat and drink, then records how they feel ~30 minutes later, to find correlations. Two things matter especially for this user:
- They have NO GALLBLADDER, so fat load matters: rate the "fat" flag by total fat and how greasy/fried/rich the food is.
- They suspect HISTAMINE INTOLERANCE: rate the "histamine" flag carefully. High: aged cheese, cured/processed meat, canned or smoked fish, shellfish, fermented foods (sauerkraut, kimchi, soy sauce, miso, vinegar), alcohol (especially red wine and beer), leftovers/reheated meat, tomatoes, spinach, eggplant, avocado, citrus, strawberries, chocolate, nuts (esp. walnuts/cashews). Low: freshly cooked meat/fish, most fresh vegetables, rice, oats, eggs (cooked), fresh dairy is lactose- not histamine-relevant.

Given a photo and/or a text description of a meal, drink or snack:
1. Identify each distinct food/drink component with an estimated quantity.
2. Estimate total macros for the whole serving shown/described. Round sensibly.
3. List up to 6 notable micronutrients it meaningfully provides (e.g. "vitamin C", "iron").
4. Rate each sensitivity flag 0-3 (0 none, 1 low, 2 moderate, 3 high) for the meal as a whole.
5. In flag_notes, one short sentence naming WHICH ingredient drives any flag rated 2+, or "" if none.
6. Set confidence: "high" when the food is clearly identifiable, "medium" for partial guesses, "low" when portions or ingredients are largely unknown.

Estimate like a pragmatic dietitian: reasonable defaults for hidden ingredients (cooking oil, dressing, sugar in sauces). Never refuse to estimate — give your best guess and lower confidence instead.`;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "items", "macros", "micros", "flags", "flag_notes", "confidence"],
  properties: {
    title: { type: "string", description: "Short dish name, e.g. 'Spaghetti bolognese'" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity"],
        properties: {
          name: {
            type: "string",
            description: "Lowercase generic food name, singular, e.g. 'sourdough bread'",
          },
          quantity: { type: "string", description: "e.g. '2 slices', '~250 ml'" },
        },
      },
    },
    macros: {
      type: "object",
      additionalProperties: false,
      required: ["kcal", "protein_g", "carbs_g", "fat_g", "sugar_g", "fiber_g"],
      properties: {
        kcal: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
        sugar_g: { type: "number" },
        fiber_g: { type: "number" },
      },
    },
    micros: { type: "array", items: { type: "string" } },
    flags: {
      type: "object",
      additionalProperties: false,
      required: [...FLAG_KEYS],
      properties: Object.fromEntries(
        FLAG_KEYS.map((k) => [k, { type: "integer", enum: [0, 1, 2, 3] }]),
      ),
    },
    flag_notes: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
} as const;

export interface AnalyzeInput {
  photoBase64?: string; // jpeg
  text?: string;
  eatenAtLabel: string; // e.g. "Wednesday 13:10" — helps judge leftovers etc.
}

export async function analyzeFood(
  apiKey: string,
  model: string,
  input: AnalyzeInput,
): Promise<Analysis> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.photoBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: input.photoBase64,
      },
    });
  }
  const parts = [
    input.photoBase64
      ? "Analyze the food/drink in this photo."
      : "Analyze this food/drink from the description alone.",
    input.text ? `User's description: ${input.text}` : "",
    `Consumed at: ${input.eatenAtLabel}.`,
  ].filter(Boolean);
  content.push({ type: "text", text: parts.join("\n") });

  const response = await client.messages.create({
    model,
    // Roomy on purpose: on claude-sonnet-5 adaptive thinking is on by
    // default and shares this budget — a tight cap truncates mid-answer.
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      input.photoBase64
        ? "The model declined to analyze this photo. Try retaking it or adding a text description."
        : "The model declined to analyze this entry. Try rewording the description.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The analysis was cut short. Please try again.");
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("The model returned no analysis.");
  return normalizeAnalysis(JSON.parse(text));
}

/** Defensive normalization — clamp anything odd the model might emit. */
function normalizeAnalysis(raw: unknown): Analysis {
  const a = raw as Partial<Analysis> & { flags?: Partial<FlagSet> };
  const flags = Object.fromEntries(
    FLAG_KEYS.map((k) => {
      const v = Number(a.flags?.[k] ?? 0);
      const clamped = Math.min(3, Math.max(0, Math.round(isFinite(v) ? v : 0)));
      return [k, clamped as FlagLevel];
    }),
  ) as FlagSet;
  const num = (v: unknown) => {
    const n = Number(v);
    return isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0;
  };
  return {
    title: String(a.title ?? "Meal").slice(0, 120),
    items: (Array.isArray(a.items) ? a.items : [])
      .slice(0, 20)
      .map((it) => ({
        name: String(it?.name ?? "").toLowerCase().trim().slice(0, 60),
        quantity: String(it?.quantity ?? "").slice(0, 40),
      }))
      .filter((it) => it.name.length > 0),
    macros: {
      kcal: num(a.macros?.kcal),
      protein_g: num(a.macros?.protein_g),
      carbs_g: num(a.macros?.carbs_g),
      fat_g: num(a.macros?.fat_g),
      sugar_g: num(a.macros?.sugar_g),
      fiber_g: num(a.macros?.fiber_g),
    },
    micros: (Array.isArray(a.micros) ? a.micros : [])
      .slice(0, 8)
      .map((m) => String(m).slice(0, 40)),
    flags,
    flag_notes: String(a.flag_notes ?? "").slice(0, 200),
    confidence:
      a.confidence === "low" || a.confidence === "high" ? a.confidence : "medium",
  };
}

export function friendlyApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Invalid API key — check it in Settings.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the API — try again in a minute.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the API — are you online?";
  }
  if (err instanceof Anthropic.APIError) {
    return `API error (${err.status ?? "?"}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Analysis failed.";
}
