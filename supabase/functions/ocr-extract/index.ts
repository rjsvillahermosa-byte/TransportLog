// ocr-extract — reads a document photo (driver's license, OR/CR, insurance,
// casa service report, odometer) with a Claude vision model and returns the
// structured fields the FleetFlow forms auto-fill from.
//
// Deploy:   supabase functions deploy ocr-extract --project-ref <ref>
// Secrets:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
//           (optional) OCR_MODEL=claude-sonnet-5
//
// Security: the anon key is public, so the gateway's verify_jwt alone would let
// anyone burn the API key. We additionally require a real signed-in user, and
// only accept images hosted in this project's own public storage.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const str = (description: string) => ({ type: ["string", "null"], description });
const num = (description: string) => ({ type: ["number", "null"], description });
const date = (label: string) => str(`${label} as YYYY-MM-DD, or null if not legible`);
const confidence = {
  type: "number",
  description: "0 to 1: how sure you are that every non-null field was read correctly",
};

type Kind = "license" | "registration" | "insurance" | "casa" | "odometer";

const SCHEMAS: Record<Kind, { intro: string; properties: Record<string, unknown>; dates: string[] }> = {
  license: {
    intro: "a Philippine LTO driver's license card",
    properties: {
      full_name: str("Full name in 'FIRST MIDDLE LAST' order (the card prints 'LAST, FIRST MIDDLE')"),
      license_number: str("License number exactly as printed, e.g. N01-23-456789"),
      license_expiry: date("Expiration date"),
      license_code: str("License type and restriction codes, e.g. 'Professional — Restriction 1,2'"),
      confidence,
    },
    dates: ["license_expiry"],
  },
  registration: {
    intro: "an LTO Official Receipt / Certificate of Registration (OR/CR)",
    properties: {
      plate_number: str("Plate number as printed"),
      cr_number: str("CR / OR number"),
      registration_expiry: date("Registration expiry"),
      confidence,
    },
    dates: ["registration_expiry"],
  },
  insurance: {
    intro: "a motor vehicle insurance policy or certificate of cover",
    properties: {
      provider: str("Insurance company"),
      policy_number: str("Policy number"),
      insurance_expiry: date("Policy expiry"),
      confidence,
    },
    dates: ["insurance_expiry"],
  },
  casa: {
    intro: "a casa (dealer) vehicle service report or job order",
    properties: {
      service_date: date("Service date"),
      odometer_at_service: num("Odometer in km at service"),
      service_type: str("Type of service, e.g. Preventive Maintenance (PMS)"),
      casa: str("Dealer / shop name"),
      cost: num("Total cost in PHP, number only"),
      next_service_km: num("Next service odometer in km"),
      next_service_date: date("Next service date"),
      parts: { type: "array", items: { type: "string" }, description: "Parts and fluids replaced" },
      recommendations: { type: "array", items: { type: "string" }, description: "Technician recommendations" },
      confidence,
    },
    dates: ["service_date", "next_service_date"],
  },
  odometer: {
    intro: "a vehicle dashboard / odometer photo",
    properties: {
      odo_reading: num("Total odometer reading in km as a plain number (not the trip meter)"),
      confidence,
    },
    dates: [],
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "OCR is not configured (missing ANTHROPIC_API_KEY)." }, 500);

  // Require a real signed-in user, not just the public anon key.
  const authHeader = req.headers.get("Authorization") ?? "";
  const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "You must be signed in." }, 401);

  let body: { kind?: string; image_urls?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const kind = body.kind as Kind;
  const schema = SCHEMAS[kind];
  if (!schema) return json({ error: `Unknown document kind '${body.kind}'.` }, 400);

  const allowedPrefix = `${supabaseUrl}/storage/v1/object/public/`;
  const imageUrl = body.image_urls?.[0];
  if (!imageUrl || !imageUrl.startsWith(allowedPrefix)) {
    return json({ error: "image_urls[0] must be an image uploaded to this project's storage." }, 400);
  }

  const model = Deno.env.get("OCR_MODEL") ?? "claude-sonnet-5";
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system:
        "You extract text fields from photos of documents for a fleet-management app. " +
        "Transcribe only what is actually printed. Never guess or invent a value: if a field is " +
        "missing, cropped, glared or unreadable, return null for it and lower the confidence.",
      tools: [
        {
          name: "record_extraction",
          description: `Record the fields read from ${schema.intro}.`,
          input_schema: { type: "object", properties: schema.properties, required: ["confidence"] },
        },
      ],
      tool_choice: { type: "tool", name: "record_extraction" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: `This is a photo of ${schema.intro}. Read it and record the fields.` },
          ],
        },
      ],
    }),
  });

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text().catch(() => "");
    console.error("Anthropic error", anthropicRes.status, detail);
    return json({ error: `The reading service failed (${anthropicRes.status}).` }, 502);
  }

  const result = await anthropicRes.json();
  const toolUse = result.content?.find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse?.input) return json({ error: "The reading service returned nothing usable." }, 502);

  const extracted = toolUse.input as Record<string, unknown>;
  for (const field of schema.dates) {
    if (typeof extracted[field] !== "string" || !ISO_DATE.test(extracted[field] as string)) {
      extracted[field] = null;
    }
  }
  return json(extracted);
});
