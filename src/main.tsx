import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme } from "./settings";
import "./styles.css";
import { isMac } from "./platform";

// Unter Windows keine Lücke für die Ampel-Knöpfe in der Titelleiste.
document.documentElement.dataset.os = isMac ? "mac" : "windows";

applyTheme();

async function start() {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    await import("./dev/mock");
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
start();
