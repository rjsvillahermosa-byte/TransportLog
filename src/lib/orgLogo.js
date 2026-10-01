import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabaseClient";
import { loadOrgPrefs, onPrefsChange } from "./orgPrefs";

// ---------------------------------------------------------------------------
// The signed-in member's own organizations row — name + logo_url for in-app
// branding (0036; separate from the Super Admin's device-local Branding
// Studio in src/lib/branding.js), plus incident_reporting_enabled (0038),
// the platform-owner-controlled plan gate for the Report Incident UI. One
// query, reused for both — both are cheap, rarely-changing org attributes.
// ---------------------------------------------------------------------------

let cache = null; // { name, logo_url, incident_reporting_enabled } | null (no org) | undefined (not loaded)
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
        .select("name, logo_url, incident_reporting_enabled")
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

/** { name, logo_url, incident_reporting_enabled } for the signed-in user's own org, or null if none/not signed in. */
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
