import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./lib/theme";
import { applyBranding } from "./lib/branding";
import "./index.css";

applyTheme(); // hotel brand palette (Settings → Brand Theme)
applyBranding(); // logo / name / font / size (Settings → Branding, Super Admin)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
