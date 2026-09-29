// fuel-price-watch — reads an org's admin-supplied fuel-price page and
// updates that org's own currency + fuel bands (org_settings). Per-org by
// design: FleetFlow clients aren't all in the Philippines, so a Malaysia or
// Spain client's price and currency have nothing to do with another org's.
//
// Two ways to call it:
//   1. Manual "Refresh now" button — Authorization: Bearer <user JWT>.
//      Caller must be Admin/Super Admin of their own active org; that org
//      is the one refreshed.
//   2. Daily scheduled sweep (0020's pg_cron job) — header x-cron-secret
//      matching the CRON_SECRET this function's secret, body:
//      { organization_id }. Used once per org that has a source URL set.
//
// Deploy:  supabase functions deploy fuel-price-watch --project-ref <ref> --use-api
// Secrets: GEMINI_API_KEY or ANTHROPIC_API_KEY (reused from ocr-extract —
//          no new provider key needed), CRON_SECRET (see 0020's SQL comments).
//
// Safety:
//   * SSRF: only https:// URLs, private/loopback/link-local hosts rejected.
//   * A failed or low-confidence scrape NEVER touches fuel_bands — it's left
//     exactly as it was, so a bad page can't corrupt live fraud-detection
//     bands. Only fuel_price_last_status/fuel_price_last_checked_at update.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://fleet.flowworkssystems.com";
const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// --- SSRF guard --------------------------------------------------------
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/, /^::1$/i, /^fe80:/i, /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i,
];
function urlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Not a valid URL.";
  }
  if (u.protocol !== "https:") return "Only https:// URLs are supported.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(host))) return "That host isn't allowed.";
  return null;
}

// --- extraction (text-only — reuses ocr-extract's provider pattern) ----
const SYSTEM_PROMPT =
  "You read a fuel-price web page for a fleet-management app. Extract only what is " +
  "actually on the page. Never guess or estimate — if a price or the currency isn't " +
  "clearly stated, return null for it and lower the confidence.";

const SCHEMA_PROPS = {
  diesel_price_per_liter: { type: ["number", "null"], description: "Current diesel price per liter, or null if not on the page" },
  gasoline_price_per_liter: { type: ["number", "null"], description: "Current gasoline/petrol price per liter, or null if not on the page" },
  currency_code: { type: ["string", "null"], description: "ISO 4217 code the prices are in, e.g. PHP, MYR, EUR" },
  currency_symbol: { type: ["string", "null"], description: "The symbol as shown on the page, e.g. ₱, RM, €" },
  confidence: { type: "number", description: "0 to 1: how sure you are the page actually states these prices" },
};

function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);
}

function userTurn(pageText: string, sourceUrl: string, region?: string): string {
  const regionLine = region
    ? `The admin cares about prices for: ${region}. If this page lists more than one region/city, ` +
      `read the price for THAT one specifically. If ${region} isn't listed on this page at all, ` +
      `return null rather than guessing a different region's number.\n\n`
    : "";
  return `Source: ${sourceUrl}\n\n${regionLine}Page text:\n${pageText}`;
}

async function extractWithClaude(apiKey: string, pageText: string, sourceUrl: string, region?: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OCR_MODEL") ?? "claude-sonnet-5",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [{
        name: "record_prices",
        description: "Record the fuel prices and currency read from the page.",
        input_schema: { type: "object", properties: SCHEMA_PROPS, required: ["confidence"] },
      }],
      tool_choice: { type: "tool", name: "record_prices" },
      messages: [{
        role: "user",
        content: userTurn(pageText, sourceUrl, region),
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
  const result = await res.json();
  const toolUse = result.content?.find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("Anthropic returned no tool_use block");
  return toolUse.input as Record<string, unknown>;
}

function toGeminiSchema() {
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(SCHEMA_PROPS)) {
    if (Array.isArray((v as { type: unknown }).type)) {
      const t = ((v as { type: string[] }).type).find((x) => x !== "null")!;
      properties[k] = { type: t.toUpperCase(), nullable: true, description: (v as { description: string }).description };
    } else {
      properties[k] = { type: (v as { type: string }).type.toUpperCase(), description: (v as { description: string }).description };
    }
  }
  return { type: "OBJECT", properties, required: ["confidence"] };
}

async function extractWithGemini(apiKey: string, pageText: string, sourceUrl: string, region?: string) {
  const model = Deno.env.get("OCR_MODEL") ?? "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userTurn(pageText, sourceUrl, region) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(),
        temperature: 0,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => "")}`);
  const result = await res.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text) as Record<string, unknown>;
}

async function extractPrices(pageText: string, sourceUrl: string, region?: string) {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
  const provider = Deno.env.get("OCR_PROVIDER") ?? (geminiKey ? "gemini" : "claude");
  const apiKey = provider === "gemini" ? geminiKey : claudeKey;
  if (!apiKey) throw new Error(`Not configured (missing ${provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"})`);
  return provider === "gemini"
    ? extractWithGemini(apiKey, pageText, sourceUrl, region)
    : extractWithClaude(apiKey, pageText, sourceUrl, region);
}

// Point price -> a band, matching how the existing bands were shaped
// (a spread either side of a reference price), so nothing downstream needs
// to change to understand the result.
const BAND_SPREAD = 0.08; // ±8%
function bandFrom(price: number) {
  return { min: Math.round(price * (1 - BAND_SPREAD) * 100) / 100, max: Math.round(price * (1 + BAND_SPREAD) * 100) / 100 };
}

// deno-lint-ignore no-explicit-any
async function refreshOrg(admin: any, organizationId: string) {
  const { data: settings, error: settingsErr } = await admin
    .from("org_settings")
    .select("fuel_price_source_url, fuel_price_region, fuel_bands")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (settingsErr) return { organization_id: organizationId, ok: false, message: settingsErr.message };
  const sourceUrl = settings?.fuel_price_source_url;
  const region = typeof settings?.fuel_price_region === "string" ? settings.fuel_price_region.trim() : "";
  if (!sourceUrl) return { organization_id: organizationId, ok: false, message: "No source URL configured." };

  const problem = urlProblem(sourceUrl);
  const fail = async (message: string) => {
    await admin.from("org_settings").update({
      fuel_price_last_checked_at: new Date().toISOString(),
      fuel_price_last_status: `error: ${message}`,
    }).eq("organization_id", organizationId);
    return { organization_id: organizationId, ok: false, message };
  };
  if (problem) return fail(problem);

  let pageText: string;
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!res.ok) return await fail(`Source returned HTTP ${res.status}.`);
    pageText = stripToText(await res.text());
  } catch (e) {
    return await fail(e instanceof Error ? `Could not fetch the source (${e.message}).` : "Could not fetch the source.");
  }
  if (!pageText) return await fail("Source page had no readable text.");

  let extracted: Record<string, unknown>;
  try {
    extracted = await extractPrices(pageText, sourceUrl, region || undefined);
  } catch (e) {
    return await fail(e instanceof Error ? e.message : "Extraction failed.");
  }

  const confidence = typeof extracted.confidence === "number" ? extracted.confidence : 0;
  const diesel = typeof extracted.diesel_price_per_liter === "number" ? extracted.diesel_price_per_liter : null;
  const gasoline = typeof extracted.gasoline_price_per_liter === "number" ? extracted.gasoline_price_per_liter : null;
  if (confidence < 0.6 || (diesel === null && gasoline === null)) {
    return await fail(`Couldn't confidently read a price from that page (confidence ${confidence.toFixed(2)}).`);
  }

  const existingBands = (settings?.fuel_bands && typeof settings.fuel_bands === "object" ? settings.fuel_bands : {}) as Record<string, unknown>;
  const nextBands = {
    ...existingBands,
    ...(diesel !== null ? { diesel: bandFrom(diesel) } : {}),
    ...(gasoline !== null ? { gasoline: bandFrom(gasoline) } : {}),
  };

  const currencyPatch: Record<string, unknown> = {};
  if (typeof extracted.currency_code === "string" && extracted.currency_code.trim()) {
    currencyPatch.currency_code = extracted.currency_code.trim().toUpperCase().slice(0, 8);
  }
  if (typeof extracted.currency_symbol === "string" && extracted.currency_symbol.trim()) {
    currencyPatch.currency_symbol = extracted.currency_symbol.trim().slice(0, 8);
  }

  const summary = [
    diesel !== null ? `diesel ${diesel}/L` : null,
    gasoline !== null ? `gasoline ${gasoline}/L` : null,
    region ? `for ${region}` : null,
  ].filter(Boolean).join(", ");

  const { error: updateErr } = await admin.from("org_settings").update({
    fuel_bands: nextBands,
    ...currencyPatch,
    fuel_price_last_checked_at: new Date().toISOString(),
    fuel_price_last_status: `ok: ${summary} (confidence ${confidence.toFixed(2)})`,
  }).eq("organization_id", organizationId);
  if (updateErr) return { organization_id: organizationId, ok: false, message: updateErr.message };

  return { organization_id: organizationId, ok: true, diesel, gasoline, ...currencyPatch };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const cronSecret = Deno.env.get("CRON_SECRET");
    const presented = req.headers.get("x-cron-secret");
    const body = await req.json().catch(() => ({}));

    if (cronSecret && presented && presented === cronSecret) {
      // Scheduled sweep — explicit target org, no user session involved.
      const organizationId = String(body.organization_id || "");
      if (!organizationId) return json({ error: "organization_id required" }, 400);
      return json(await refreshOrg(admin, organizationId));
    }

    // Manual path — resolve the caller's own org.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("status", "Active")
      .in("role", ["Super Admin", "Admin"])
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "Admin access required" }, 403);

    return json(await refreshOrg(admin, membership.organization_id));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
