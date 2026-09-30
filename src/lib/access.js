import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabaseClient";

// Access control client (0029): the Master Permissions matrix + R&D Lab flags.
// Both tables are authenticated-readable; this module caches them per session
// and exposes pure helpers. Everything FAILS OPEN to the pre-0029 behavior
// when the tables are empty/unavailable, so nothing breaks before 0029 runs.

const DEFAULTS = {
  view_reports: ["Super Admin", "Admin", "Supervisor"],
  manage_settings: ["Super Admin", "Admin"],
  manage_fleet: ["Super Admin", "Admin", "Supervisor"],
  manage_users: ["Super Admin", "Admin"],
};

let matrixCache = null;   // { capability: [roles] } | null
let flagsCache = null;    // [{key, enabled, enabled_orgs}] | null
let matrixInflight = null;
let flagsInflight = null;

async function loadMatrix() {
  if (matrixCache) return matrixCache;
  if (!matrixInflight) {
    matrixInflight = (async () => {
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.from("role_permissions").select("role, capability, allowed");
        if (!error && data && data.length) {
          const m = {};
          for (const c of Object.keys(DEFAULTS)) m[c] = [];
          for (const r of data) {
            if (!m[r.capability]) m[r.capability] = [];
            if (r.allowed) m[r.capability].push(r.role);
          }
          matrixCache = m;
        } else {
          matrixCache = DEFAULTS; // table empty (0029 not run) → built-ins
        }
      } catch {
        matrixCache = DEFAULTS;
      } finally {
        matrixInflight = null;
      }
      return matrixCache;
    })();
  }
  return matrixInflight;
}

async function loadFlags() {
  if (flagsCache) return flagsCache;
  if (!flagsInflight) {
    flagsInflight = (async () => {
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.from("feature_flags").select("key, enabled, enabled_orgs");
        flagsCache = error || !data ? [] : data;
      } catch {
        flagsCache = [];
      } finally {
        flagsInflight = null;
      }
      return flagsCache;
    })();
  }
  return flagsInflight;
}

/** Does `role` have `capability`? (matrix overrides defaults; Super Admin always true) */
export async function roleCan(capability, role) {
  if (role === "Super Admin") return true;
  const m = await loadMatrix();
  const roles = m[capability] ?? DEFAULTS[capability] ?? [];
  return roles.includes(role);
}

/** Session-wide matrix load for React (returns [matrix, ready]). */
export function useAccessMatrix() {
  const [matrix, setMatrix] = useState(matrixCache || DEFAULTS);
  useEffect(() => {
    let live = true;
    loadMatrix().then((m) => live && setMatrix(m));
    return () => { live = false; };
  }, []);
  return matrix;
}

/**
 * Effective flag state for an org: global enabled OR org in the pilot list.
 * `orgId` may be null (platform pages) — then only the global switch counts.
 */
export async function flagEnabled(key, orgId) {
  const flags = await loadFlags();
  const f = flags.find((x) => x.key === key);
  if (!f) return true; // unknown flag (0029 not run) → default behavior
  return f.enabled || (orgId ? f.enabled_orgs.includes(orgId) : false);
}

/** React flavor for one flag + org. Defaults to true while loading. */
export function useFeatureFlag(key, orgId) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let live = true;
    flagEnabled(key, orgId).then((v) => live && setOn(v));
    return () => { live = false; };
  }, [key, orgId]);
  return on;
}
