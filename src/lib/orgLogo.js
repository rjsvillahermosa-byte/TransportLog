import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabaseClient";
import { loadOrgPrefs, onPrefsChange } from "./orgPrefs";

// ---------------------------------------------------------------------------
// In-app header branding for a signed-in member's own organization. Separate
// from the Super Admin's device-local Branding Studio (src/lib/branding.js,
// localStorage) — this is DB-backed (organizations.logo_url, 0036) so every
// member of that org sees the same logo on every device, not just the one
// browser that ran the Branding Studio.
// ---------------------------------------------------------------------------

let cache = null; // { name, logo_url } | null (no org) | undefined (not loaded)
let inflight = null;

async function loadOrgLogo(force = false) {
  if (!force && cache !== undefined && cache !== null) return cache;
  if (!force && inflight) return inflight;
  const sb = getSupabaseClient();
  if (!sb) return null;
  inflight = (async () => {
    try {
      const prefs = await loadOrgPrefs();
      const orgId = prefs?.organization_id;
      if (!orgId) {
        cache = null;
        return cache;
      }
      const { data } = await sb
        .from("organizations")
        .select("name, logo_url")
        .eq("id", orgId)
        .maybeSingle();
      cache = data || null;
    } catch {
      cache = null;
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

/** { name, logo_url } for the signed-in user's own org, or null if none/not signed in. */
export function useOrgLogo() {
  const [logo, setLogo] = useState(cache || null);
  useEffect(() => {
    let alive = true;
    loadOrgLogo().then((v) => alive && setLogo(v));
    // Org prefs reload (e.g. right after login) should re-trigger the logo
    // fetch too, since it depends on the same resolved organization_id.
    const off = onPrefsChange(() => loadOrgLogo(true).then((v) => alive && setLogo(v)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return logo;
}
