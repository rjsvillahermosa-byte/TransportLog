import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Branding studio state — Super Admin controls the app's identity:
// logo (with recommended size), app name, font family (with recommended base
// size), text size, and the whole-app background. Applied via CSS variables
// so everything (header, auth screens, print sheets) follows instantly.
// ---------------------------------------------------------------------------

const KEY = "fleetflow:branding";

export const DEFAULT_BRANDING = {
  name: "TransportLog",
  logo: "",
  logoSize: 36,
  font: "Poppins",
  size: 16,
  background: { id: "cream", color: "#FAF3E7" },
};

export const FONT_OPTIONS = [
  { value: "Poppins", label: "Poppins — rounded, friendly", rec: 16, recommended: true },
  { value: "Inter", label: "Inter — clean, corporate", rec: 16, recommended: true },
  { value: "Montserrat", label: "Montserrat — wide, premium", rec: 15.5 },
  { value: "DM Sans", label: "DM Sans — modern, neutral", rec: 16 },
  { value: "Playfair Display", label: "Playfair Display — classic hotel serif", rec: 17 },
];

export const LOGO_RECOMMEND = {
  upload: "Square image, 512×512 px or larger (PNG / SVG)",
  min: "≥ 256×256 px",
  displayMin: 28,
  displayMax: 56,
  default: 36,
};

export const BACKGROUND_PRESETS = [
  {
    id: "cream",
    label: "Cream & Mint",
    recommended: true,
    page: "#FAF3E7",
    blobs: ["rgba(207,227,214,0.85)", "rgba(207,227,214,0.60)", "rgba(207,227,214,0.40)"],
  },
  {
    id: "white",
    label: "Pure White",
    page: "#FFFFFF",
    blobs: ["rgba(207,227,214,0.55)", "rgba(207,227,214,0.35)", "rgba(207,227,214,0.20)"],
  },
  {
    id: "sand",
    label: "Warm Sand",
    page: "#F3E9D2",
    blobs: ["rgba(227,211,184,0.80)", "rgba(227,211,184,0.55)", "rgba(227,211,184,0.35)"],
  },
  {
    id: "blush",
    label: "Soft Blush",
    page: "#F9E9E4",
    blobs: ["rgba(242,215,206,0.80)", "rgba(242,215,206,0.55)", "rgba(242,215,206,0.35)"],
  },
  {
    id: "mintwash",
    label: "Mint Wash",
    page: "#EAF3EE",
    blobs: ["rgba(185,212,196,0.75)", "rgba(185,212,196,0.50)", "rgba(185,212,196,0.30)"],
  },
  {
    id: "gray",
    label: "Cool Gray",
    page: "#F1F3F5",
    blobs: ["rgba(221,225,230,0.80)", "rgba(221,225,230,0.55)", "rgba(221,225,230,0.35)"],
  },
];

function blobsToCss(blobs) {
  return `radial-gradient(820px 520px at 88% -8%, ${blobs[0]}, transparent 62%),
      radial-gradient(680px 460px at -12% 104%, ${blobs[1]}, transparent 60%),
      radial-gradient(420px 320px at 50% 118%, ${blobs[2]}, transparent 65%)`;
}

function resolveBackground(bg) {
  const preset = BACKGROUND_PRESETS.find((p) => p.id === bg?.id);
  if (preset) return { page: preset.page, blobs: blobsToCss(preset.blobs) };
  // custom color — tint the blobs in the same hue
  const color = bg?.color || "#FAF3E7";
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    page: color,
    blobs: blobsToCss([
      `rgba(${r},${g},${b},0.75)`,
      `rgba(${r},${g},${b},0.5)`,
      `rgba(${r},${g},${b},0.3)`,
    ]),
  };
}

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
  const bg = resolveBackground(b.background);
  root.setProperty("--bg-page", bg.page);
  root.setProperty("--bg-blobs", bg.blobs);
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
