// admin-create-user — creates a real Supabase Auth account (service-role
// admin.createUser, email pre-confirmed) on behalf of an org's own Admin or
// Super Admin. Used by Settings' "Add demo user" and BulkEnrollCard's
// fallback path (enroll_users(), the SQL RPC in 0009, is the primary path;
// this exists for older deployments that haven't run that migration yet).
//
// SECURITY (fixed 2026-09-29 — see 0016 audit notes):
//   * Caller authorization used to be `profiles.role in ('Super Admin','Admin')`,
//     a GLOBAL field with no organization check — any org's Admin could create
//     unlimited accounts system-wide, bypassing every org's seat limit.
//     Now scoped to the caller's own ACTIVE organization membership, exactly
//     like enroll_users() (0009).
//   * The created account's client_code is now stamped in its signup
//     metadata, so the existing handle_new_saas_user() trigger (0003) adds it
//     to the caller's org immediately — previously these accounts were
//     created with no organization at all, so BulkEnrollCard's follow-up
//     `organization_members.update()` matched zero rows and silently no-op'd.
//   * org.max_users is now enforced here too, matching every other
//     enrollment path.
//   * CORS narrowed from '*' to this app's own origin.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://fleet.flowworkssystems.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Caller's own ACTIVE org membership (Admin/Super Admin required), or the
    // real platform owner. Mirrors enroll_users()'s authorization exactly —
    // this endpoint must never let one tenant's Admin act on another tenant.
    const { data: caller_profile } = await admin
      .from("profiles")
      .select("is_platform_owner")
      .eq("id", caller.id)
      .maybeSingle();
    const isPlatformOwner = caller_profile?.is_platform_owner === true;

    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", caller.id)
      .eq("status", "Active")
      .in("role", ["Super Admin", "Admin"])
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!isPlatformOwner && !membership) {
      return json({ error: "Admin access required" }, 403);
    }

    let org: { id: string; client_code: string; max_users: number } | null = null;
    if (membership) {
      const { data } = await admin
        .from("organizations")
        .select("id, client_code, max_users")
        .eq("id", membership.organization_id)
        .single();
      org = data;
    }

    if (org) {
      const { count } = await admin
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id);
      if ((count ?? 0) >= org.max_users) {
        return json({ error: "This organization has reached its user limit. Contact the fleet admin." }, 400);
      }
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "user" ? "user" : "demo";
    let email: string, password: string, full_name: string;

    if (mode === "demo") {
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      email = "demo." + suffix.toLowerCase() + "@fleetflow.test";
      password = "demo" + Math.random().toString(36).slice(2, 8);
      full_name = "Demo User " + suffix;
    } else {
      email = String(body.email || "").trim().toLowerCase();
      full_name = String(body.full_name || "").trim();
      password = body.password ? String(body.password) : Math.random().toString(36).slice(2, 10);
      if (!email || !full_name) return json({ error: "full_name and email are required" }, 400);
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        ...(mode === "demo" ? { is_demo: true } : {}),
        // Stamps the caller's own org onto the new account so
        // handle_new_saas_user() (0003) enrolls them as a real member —
        // instead of the orphaned, org-less account this endpoint used to
        // create, which no org-scoped policy would ever grant data access to.
        ...(org ? { client_code: org.client_code } : {}),
      },
    });
    if (error) return json({ error: error.message }, 400);
    return json({ id: data.user?.id, email, password, full_name });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
