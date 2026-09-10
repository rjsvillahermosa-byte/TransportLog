// ---------------------------------------------------------------------------
// Brand theme — runtime-swappable hotel/company palette.
// Primary + accent are stored as hex, applied to CSS variables (RGB triplets)
// so every `brand`/`accent` Tailwind utility follows instantly.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "fleetflow:theme";

export const DEFAULT_THEME = { primary: "#1E7A5A", accent: "#F2B705" };

export const THEME_PRESETS = [
  { name: "Deep Teal", primary: "#1E7A5A", accent: "#F2B705" },
  { name: "Hotel Blue", primary: "#1D4ED8", accent: "#F59E0B" },
  { name: "Ocean", primary: "#0E7490", accent: "#FB923C" },
  { name: "Burgundy", primary: "#8E2A3C", accent: "#D9A441" },
  { name: "Royal Purple", primary: "#6D28D9", accent: "#F2B705" },
  { name: "Forest", primary: "#3F6B2F", accent: "#E8763A" },
  { name: "Sunset", primary: "#C2410C", accent: "#F2B705" },
  { name: "Charcoal", primary: "#374151", accent: "#F2B705" },
];

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

export function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function mix(hex, target, amount) {
  const c = hexToRgb(hex);
  const t = hexToRgb(target);
  const r = clamp(c.r + (t.r - c.r) * amount);
  const g = clamp(c.g + (t.g - c.g) * amount);
  const b = clamp(c.b + (t.b - c.b) * amount);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export const darken = (hex, amount = 0.14) => mix(hex, "#000000", amount);
export const lighten = (hex, amount = 0.25) => mix(hex, "#FFFFFF", amount);

const triplet = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
};

export function getTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (t?.primary && t?.accent) return t;
    }
  } catch {}
  return { ...DEFAULT_THEME };
}

export function saveTheme(theme) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  applyTheme(theme);
}

export function resetTheme() {
  localStorage.removeItem(STORAGE_KEY);
  applyTheme(DEFAULT_THEME);
}

export function applyTheme(theme = getTheme()) {
  const root = document.documentElement.style;
  root.setProperty("--brand", triplet(theme.primary));
  root.setProperty("--brand-dark", triplet(darken(theme.primary, 0.14)));
  root.setProperty("--accent", triplet(theme.accent));
  root.setProperty("--accent-dark", triplet(darken(theme.accent, 0.55)));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.primary);
}

/** Hex strings for charts — re-read on render so they follow the live theme. */
export function themeColors() {
  const t = getTheme();
  return {
    primary: t.primary,
    primaryDark: darken(t.primary, 0.14),
    primarySoft: lighten(t.primary, 0.22),
    accent: t.accent,
    accentDark: darken(t.accent, 0.55),
  };
}
