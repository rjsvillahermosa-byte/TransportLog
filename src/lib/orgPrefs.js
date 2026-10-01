import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Org-level client preferences — booking locations, time standard, and role
// terminology. Lives in the org's org_settings row (per-org since 0008).
// RLS: every member can read their org's row; only Admin/Super Admin write.
// ---------------------------------------------------------------------------

export const DEFAULT_PREFS = {
  location_presets: [], // [{ name, kind: "both"|"pickup"|"dropoff", enabled }]
  booking_type_options: [], // [{ value, enabled }] — empty = app's hardcoded default
  time_format: "24h",   // the standard — avoids AM/PM scheduling confusion
  role_terms: {},       // { Admin: "Dispatcher", Staff: "Front Office", ... }
  currency_code: "PHP", // ISO 4217 — set per-org so non-Philippine clients aren't shown ₱
  currency_symbol: "₱",
};

let cache = null;         // module-level so navigation doesn't refetch
let inflight = null;

export async function loadOrgPrefs(force = false) {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;
  const sb = getSupabaseClient();
  if (!sb) return DEFAULT_PREFS;
  inflight = (async () => {
    try {
      const { data, error } = await sb
        .from("org_settings")
        .select("organization_id, location_presets, booking_type_options, time_format, role_terms, currency_code, currency_symbol")
        // the legacy NULL-org row is also visible to platform supers —
        // prefer the caller's real org row
        .order("organization_id", { nullsFirst: false })
        .limit(1);
      if (error || !data?.length) {
        cache = { ...DEFAULT_PREFS };
      } else {
        cache = {
          // kept so saveOrgPrefs can target this exact row explicitly — the
          // project requires an UPDATE to carry a real WHERE clause, RLS
          // alone (a bare .update(patch)) is no longer accepted.
          organization_id: data[0].organization_id,
          location_presets: Array.isArray(data[0].location_presets)
            ? data[0].location_presets
            : [],
          booking_type_options: Array.isArray(data[0].booking_type_options)
            ? data[0].booking_type_options
            : [],
          time_format: data[0].time_format === "12h" ? "12h" : "24h",
          role_terms:
            data[0].role_terms && typeof data[0].role_terms === "object"
              ? data[0].role_terms
              : {},
          currency_code: data[0].currency_code || DEFAULT_PREFS.currency_code,
          currency_symbol: data[0].currency_symbol || DEFAULT_PREFS.currency_symbol,
        };
      }
    } catch {
      cache = { ...DEFAULT_PREFS };
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

export async function saveOrgPrefs(patch) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Not connected");
  // The project rejects any UPDATE with no real WHERE clause ("UPDATE
  // requires a WHERE clause") — RLS alone used to be enough to scope this
  // safely, but that's no longer accepted, so every save needs its own
  // organization row id to filter on explicitly.
  let orgId = cache?.organization_id;
  if (!orgId) {
    const fresh = await loadOrgPrefs(true);
    orgId = fresh.organization_id;
  }
  if (!orgId) {
    throw new Error("Couldn't determine your organization — try reloading the page.");
  }
  // .select() also lets us tell a zero-row RLS rejection (caller isn't
  // Admin/Super Admin of this org) apart from a real success, instead of a
  // false "saved" toast.
  const { data, error } = await sb
    .from("org_settings")
    .update(patch)
    .eq("organization_id", orgId)
    .select("organization_id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error(
      "Nothing was saved — your account isn't recognized as an Admin or Super Admin of an active organization."
    );
  }
  cache = { ...(cache || DEFAULT_PREFS), organization_id: orgId, ...patch };
  listeners.forEach((l) => l(cache));
  return cache;
}

const listeners = new Set();
export function onPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useOrgPrefs() {
  const [prefs, setPrefs] = useState(cache || DEFAULT_PREFS);
  useEffect(() => {
    let alive = true;
    loadOrgPrefs().then((p) => alive && setPrefs(p));
    const off = onPrefsChange((p) => alive && setPrefs(p));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return prefs;
}

// ---------------------------------------------------------------------------
// Role terminology — "Admin" can be titled whatever the client wants
// ("Dispatcher", "Front Office", …). Fallback chain keeps the platform
// consistent when a term isn't customized.
// ---------------------------------------------------------------------------

export function roleLabel(role, terms) {
  if (!role) return role;
  const t = terms || cache?.role_terms || {};
  return t[role] || role;
}

/** "Dispatcher (Admin)" style — used where the underlying role matters. */
export function roleLabelWithBase(role, terms) {
  const label = roleLabel(role, terms);
  return label === role ? label : `${label} (${role})`;
}

// ---------------------------------------------------------------------------
// Time standard — the org picks 24h (default, the standard) or 12h.
// schedule_time is stored HH:mm (24h) in the DB regardless of display.
// ---------------------------------------------------------------------------

export function formatTimePref(hhmm, format) {
  if (!hhmm) return hhmm;
  const fmt = format || cache?.time_format || "24h";
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2];
  if (fmt === "12h") {
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${min} ${suffix}`;
  }
  return `${String(h).padStart(2, "0")}:${min}`;
}
