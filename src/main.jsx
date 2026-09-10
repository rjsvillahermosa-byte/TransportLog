import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./lib/theme";
import "./index.css";

applyTheme(); // hotel brand palette (Settings → Brand Theme)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
