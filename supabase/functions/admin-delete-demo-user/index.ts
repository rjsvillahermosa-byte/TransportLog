// admin-delete-demo-user — actually deletes a demo account: the auth user,
// its profile row, and everything it created. Everything else in this app
// only "deletes" a user by setting profiles.status = 'Disabled', because
// the anon/client-side key can never hard-delete a real Supabase Auth user
// — only a service-role key can, which is why this needs its own function
// (same reason admin-create-user exists).
//
// SAFETY: this function will ONLY ever delete an account that is
// genuinely a demo account (user_metadata.is_demo === true AND the email
// matches @fleetflow.test). It refuses everything else, including asking
// it to delete a real user or another org's demo account — there is no
// path in this function that hard-deletes a non-demo account.
//
// Deploy:  supabase functions deploy admin-delete-demo-user --project-ref <ref> --use-api

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://fleet.flowworkssystems.com";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Same table list db.js's wipeCreatedDataSb() already uses client-side —
// kept identical so this does exactly what the existing "wipe" behavior
// promised, just followed all the way through to a real deletion.
const WIPE_TABLES = ["transport_requests", "mileage_logs", "fuel_logs", "incidents", "service_logs"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.id || "");
    if (!targetId) return json({ error: "id is required" }, 400);
    if (targetId === caller.id) return json({ error: "You can't delete the account you're signed in with." }, 400);

    // Caller must be Admin/Super Admin of an active org, or the platform owner.
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_platform_owner")
      .eq("id", caller.id)
      .maybeSingle();
    const isPlatformOwner = callerProfile?.is_platform_owner === true;

    const { data: callerMembership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", caller.id)
      .eq("status", "Active")
      .in("role", ["Super Admin", "Admin"])
      .limit(1)
      .maybeSingle();

    if (!isPlatformOwner && !callerMembership) {
      return json({ error: "Admin access required" }, 403);
    }

    // Verify the TARGET is genuinely a demo account before anything else.
    // Two independent signals must both agree — this is the only thing
    // standing between this function and permanently deleting a real
    // account, so it does not proceed on a partial match.
    const { data: targetAuth, error: targetAuthErr } = await admin.auth.admin.getUserById(targetId);
    if (targetAuthErr || !targetAuth?.user) return json({ error: "Account not found" }, 404);
    const isDemoMeta = targetAuth.user.user_metadata?.is_demo === true;
    const isDemoEmail = /@fleetflow\.test$/i.test(targetAuth.user.email || "");
    if (!isDemoMeta || !isDemoEmail) {
      return json({ error: "This isn't a demo account — refusing to hard-delete it." }, 400);
    }

    // Same-org check (skipped for the platform owner, who may clean up any org's demos).
    if (!isPlatformOwner) {
      const { data: targetMembership } = await admin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", targetId)
        .maybeSingle();
      if (!targetMembership || targetMembership.organization_id !== callerMembership!.organization_id) {
        return json({ error: "That demo account doesn't belong to your organization." }, 403);
      }
    }

    // Wipe what it created, then the profile row (no FK/cascade from
    // profiles to auth.users in this schema — it must be removed
    // explicitly), then the auth user itself, last, since that's the one
    // irreversible step.
    const wiped: Record<string, number> = {};
    for (const table of WIPE_TABLES) {
      const { error, count } = await admin.from(table).delete({ count: "exact" }).eq("created_by", targetId);
      if (error) return json({ error: `Failed wiping ${table}: ${error.message}` }, 500);
      wiped[table] = count ?? 0;
    }

    await admin.from("profiles").delete().eq("id", targetId);

    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetId);
    if (deleteErr) return json({ error: `Data wiped, but the account itself failed to delete: ${deleteErr.message}` }, 500);

    return json({ ok: true, deleted: true, wiped });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
