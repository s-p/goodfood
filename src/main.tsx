import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { loadSettings } from "./lib/settings";

applyTheme(loadSettings().theme);
watchSystemTheme(() => loadSettings().theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: offline shell + notification-action check-ins.
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(new URL("sw.js", location.href).pathname)
      .catch(() => {
        /* offline support is progressive enhancement */
      });
  });
}
