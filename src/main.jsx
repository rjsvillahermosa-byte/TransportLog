import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./lib/theme";
import { applyBranding } from "./lib/branding";
import "./index.css";

applyTheme(); // hotel brand palette (Settings → Brand Theme)
applyBranding(); // logo / name / font / size (Settings → Branding, Super Admin)

// Offline app shell — after the first visit the app opens with no internet.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported context — the app still works online */
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
