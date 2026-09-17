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

// Baked connection — the Super Admin's Supabase project. The anon key is
// public by design (RLS policies protect the data), so shipping it in the
// client is standard Supabase practice.
const BAKED = {
  url: "https://yhdvfjkfzrgcrzstnpti.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZHZmamtmenJnY3J6c3RucHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzU3OTMsImV4cCI6MjEwNTI1MTc5M30.G8_NovLqR8FEjG5xa-CbPZ-oQB3-Lu3tRvBfDA62LSM",
};

export function getSupabaseConfig() {
  // The connection ships with the build — set up once, works everywhere.
  return { url: BAKED.url, anonKey: BAKED.anonKey };
}

export function saveSupabaseConfig() {
  /* connection is baked into the build — nothing to save */
}

export function isSupabaseConfigured() {
  return true; // baked into every build
}

export function getMode() {
  return "supabase";
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
