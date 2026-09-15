import { createClient } from "@supabase/supabase-js";
import SCHEMA_SQL from "../../supabase/migrations/0001_init.sql?raw";

// ---------------------------------------------------------------------------
// Supabase connection layer.
// Config precedence: Super Admin's runtime config (Settings → Database,
// localStorage) → build-time env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// When configured AND mode = "supabase", db.js routes everything through
// Supabase; otherwise the app runs fully offline on localStorage.
// ---------------------------------------------------------------------------

const CFG_KEY = "fleetflow:supabase";
const MODE_KEY = "fleetflow:mode";

export function getSupabaseConfig() {
  const envUrl = import.meta.env?.VITE_SUPABASE_URL || "";
  const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      return { url: c.url || envUrl, anonKey: c.anonKey || envKey };
    }
  } catch {}
  return { url: envUrl, anonKey: envKey };
}

export function saveSupabaseConfig({ url, anonKey }) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
}

export function clearSupabaseConfig() {
  localStorage.removeItem(CFG_KEY);
}

export function isSupabaseConfigured() {
  const { url, anonKey } = getSupabaseConfig();
  return !!(url && anonKey);
}

export function getMode() {
  return localStorage.getItem(MODE_KEY) === "supabase" ? "supabase" : "local";
}

export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode === "supabase" ? "supabase" : "local");
}

/** Supabase is driving the app only when configured AND enabled. */
export function supabaseActive() {
  return getMode() === "supabase" && isSupabaseConfigured();
}

let client = null;
export function getSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  if (!client) client = createClient(url, anonKey, { auth: { persistSession: true } });
  return client;
}

/** Connectivity + config probe: reachable if the query resolves without error. */
export async function testConnection() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "No URL / anon key configured." };
  const { error } = await sb.from("profiles").select("id").limit(1);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { SCHEMA_SQL };
