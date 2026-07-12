import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { loadSettings } from "./lib/settings";
import { isNativeApp } from "./lib/native";

applyTheme(loadSettings().theme);
watchSystemTheme(() => loadSettings().theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: offline shell + notification-action check-ins (web only —
// the native app bundles its assets and handles notifications natively).
if ("serviceWorker" in navigator && !import.meta.env.DEV && !isNativeApp()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(new URL("sw.js", location.href).pathname)
      .catch(() => {
        /* offline support is progressive enhancement */
      });
  });
}
