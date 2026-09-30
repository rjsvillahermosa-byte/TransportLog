import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabaseClient";

// Site content store (0031): every editable copy block on the landing and
// pricing pages lives here as defaults; the Site Editor persists overrides
// to site_content and the public pages read them at render. Fail-open: if
// the table is missing or a key absent, the shipped defaults render.

export const LANDING_DEFAULTS = {
  badge: "Fleet & Transport Management System",
  hero_title: "Every trip logged. Every kilometer verified.",
  hero_body:
    "FleetFlow keeps your drivers, vehicles, and missions in one place — dispatch a trip, capture the odometer by photo, and know exactly where every kilometer went.",
  hero_cta_primary: "Create an account",
  hero_cta_secondary: "Sign in",
  hero_points: "Works on any phone|Photo-verified mileage|Role-based access",
  features_title: "Everything the motor pool needs",
  features_body:
    "Replace the paper logbook, the spreadsheet and the group chat with one system your whole team can use.",
  how_title: "From booking to report in three steps",
  how_steps:
    "Book the trip~Front desk or staff creates a guest booking or department errand with pickup, destination and schedule.|Drive and verify~The assigned driver starts the mission with an odometer photo, and ends it with another. Mileage is calculated automatically.|Review and report~Supervisors see completed missions, mileage and fuel at a glance, and export reports when the month closes.",
  fraud_title: "The photo doesn't lie",
  fraud_body:
    "Fuel numbers are only as honest as their source. Every fill-up is cross-checked against the odometer and the tank itself — and the audit flags what doesn't add up:",
  roles_title: "The right access for every person",
  roles_body: "Drivers see their missions. Supervisors see the fleet. Admins run the system.",
  final_title: "Ready to see where every trip goes?",
  final_body: "Sign in to your account, or create one to start logging missions today.",
  footer_tagline: "— intelligent fleet & transport management system",
};

export const PRICING_DEFAULTS = {
  pricing_badge: "Simple, per-fleet pricing",
  pricing_title: "Pay for your fleet, not for features",
  pricing_body:
    "Every plan includes the full booking engine, offline-capable mobile app, and database-level data isolation. Pick the size that fits today — upgrade the day you need to.",
  pricing_footer: "FleetFlow — intelligent fleet & transport management system · fleet.flowworkssystems.com",
};

// Feature cards' copy is editable too (titles + bodies, icons stay fixed).
export const FEATURE_DEFAULTS = [
  { title: "Bookings & dispatch", body: "Log guest transfers and department errands in seconds, assign a driver and vehicle, and follow every mission from pending to completed." },
  { title: "Photo-verified mileage", body: "Drivers snap the odometer before and after each trip. The reading is captured from the photo, so distances are on record instead of on memory." },
  { title: "License scan enrollment", body: "Photograph a driver's license and the name, number and expiry fill in for you — along with a profile avatar made from the same photo." },
  { title: "Renewals & servicing", body: "License, registration and insurance expiries are tracked in one place, alongside service history and next-service reminders read from casa reports." },
  { title: "Fuel & reports", body: "Log fill-ups per vehicle with a consumption audit that spots anomalies, and produce print-ready reports for supervisors and finance, or save them straight to PDF." },
  { title: "QR codes & voice", body: "Print QR codes for a front-desk booking link and an in-vehicle driver dashboard, and let drivers log an odometer reading by voice when their hands are busy." },
];

const CACHE = {}; // key -> doc

export async function loadSiteContent(key) {
  if (CACHE[key]) return CACHE[key];
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("site_content")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (!error && data?.value && typeof data.value === "object") {
      CACHE[key] = data.value;
      return data.value;
    }
  } catch {
    /* 0031 not run yet — defaults */
  }
  return {};
}

export async function saveSiteContent(key, patch) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Not connected");
  const { data: existing } = await sb.from("site_content").select("value").eq("key", key).maybeSingle();
  const next = { ...(existing?.value || {}), ...patch };
  const { error } = await sb
    .from("site_content")
    .upsert({ key, value: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  CACHE[key] = next;
  return next;
}

/** React hook: merged defaults + saved overrides for a page key. */
export function useSiteContent(key, defaults) {
  const [doc, setDoc] = useState(defaults);
  useEffect(() => {
    let live = true;
    loadSiteContent(key).then((overrides) => {
      if (live && overrides && Object.keys(overrides).length) {
        setDoc({ ...defaults, ...overrides });
      }
    });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return doc;
}
