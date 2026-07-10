export type ThemePref = "system" | "light" | "dark";

// Keep in sync with the inline pre-paint script in index.html.
const PAGE_COLORS = { light: "#f7f6f3", dark: "#0d0d0d" };

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light"; // no system signal available → light
  }
}

/** Stamp the resolved theme on <html> and keep the status-bar color in sync. */
export function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.content = PAGE_COLORS[resolved];
  }
}

/** Re-apply on OS theme changes while the preference is "system". */
export function watchSystemTheme(getPref: () => ThemePref): () => void {
  try {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getPref() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}
