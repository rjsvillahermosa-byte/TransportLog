import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Branding studio state — Super Admin controls the app's identity:
// logo, app name, font family, and base text size. Applied via CSS variables
// so the whole app (header, auth screens, print sheets) follows instantly.
// ---------------------------------------------------------------------------

const KEY = "fleetflow:branding";

export const DEFAULT_BRANDING = { name: "TransportLog", logo: "", font: "Poppins", size: 16 };

export const FONT_OPTIONS = [
  { value: "Poppins", label: "Poppins — rounded, friendly (default)" },
  { value: "Inter", label: "Inter — clean, corporate" },
  { value: "Montserrat", label: "Montserrat — wide, premium" },
  { value: "DM Sans", label: "DM Sans — modern, neutral" },
  { value: "Playfair Display", label: "Playfair Display — classic hotel serif" },
];

// In-memory layer: live studio edits apply instantly (header follows) even
// before "Apply Branding" persists them to localStorage.
let memory = null;

export function getBranding() {
  if (memory) return { ...DEFAULT_BRANDING, ...memory };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_BRANDING };
}

export function applyBranding(b = getBranding()) {
  memory = { ...b };
  const root = document.documentElement.style;
  root.setProperty("--font-brand", `"${b.font}", ui-sans-serif, system-ui, sans-serif`);
  if (b.size && Number(b.size) !== 16) root.fontSize = `${b.size}px`;
  else root.removeProperty("font-size");
  document.title = `${b.name} · FleetFlow`;
  window.dispatchEvent(new CustomEvent("app:branding"));
}

export function saveBranding(b) {
  memory = { ...b };
  localStorage.setItem(KEY, JSON.stringify(b));
  applyBranding(b);
}

export function resetBranding() {
  memory = null;
  localStorage.removeItem(KEY);
  applyBranding({ ...DEFAULT_BRANDING });
}

/** Reactive branding for chrome (header, auth screens). */
export function useBranding() {
  const [b, setB] = useState(getBranding());
  useEffect(() => {
    const update = () => setB(getBranding());
    window.addEventListener("app:branding", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("app:branding", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return b;
}
