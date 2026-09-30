// supabase/functions/notify-email/index.ts
//
// Approval-gate email notifier (0033 triggers call this via pg_net).
//   type = "pending_approval"  → email the org's Active admins
//   type = "member_approved"   → email the newly-approved member
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY      — from resend.com (free tier works; verify a domain
//                         to send to anyone, else the sandbox only delivers
//                         to your own Resend account's email)
//   NOTIFY_SECRET       — shared secret the DB trigger must present
//   NOTIFY_FROM_EMAIL   — optional, default "FleetFlow <onboarding@resend.dev>"
//
// Behavior notes: missing RESEND_API_KEY → responds 200 {skipped:true} so
// the trigger never errors; service-role lookups bypass RLS by design.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") ?? "FleetFlow <onboarding@resend.dev>";
const APP_URL = "https://fleet.flowworkssystems.com";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (NOTIFY_SECRET && req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const { type, membership_id } = await req.json().catch(() => ({}) as any);
  if (!type || !membership_id) return new Response("bad payload", { status: 400 });

  const sb = createClient(SB_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: m } = await sb
    .from("organization_members")
    .select("organization_id, user_id, role, status")
    .eq("id", membership_id)
    .maybeSingle();
  if (!m) return new Response("membership not found", { status: 404 });

  const [{ data: org }, { data: member }] = await Promise.all([
    sb.from("organizations").select("name, client_code").eq("id", m.organization_id).maybeSingle(),
    sb.from("profiles").select("full_name, email").eq("id", m.user_id).maybeSingle(),
  ]);
  const orgName = org?.name ?? "your organization";
  const memberName = member?.full_name ?? "Someone";

  const send = async (to: string, subject: string, html: string) => {
    if (!RESEND_API_KEY) return { skipped: true };
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    return { status: r.status };
  };

  const shell = (accent: string, title: string, bodyHtml: string) => `
<div style="font-family:Inter,Arial,sans-serif;background:#FAF6EF;padding:24px">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E2D6">
    <div style="background:#1A2B48;padding:18px 24px">
      <span style="color:#fff;font-weight:700;font-size:18px">FleetFlow</span>
      <span style="color:#FF6B2C;font-weight:600;font-size:12px;margin-left:10px">FLEET &amp; TRANSPORT MANAGEMENT SYSTEM</span>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 6px;color:${accent};font-weight:700;font-size:16px">${title}</p>
      <div style="color:#4B3F33;font-size:14px;line-height:1.6">${bodyHtml}</div>
    </div>
    <div style="padding:14px 24px;background:#FAF6EF;color:#8A847A;font-size:11px">
      fleet.flowworkssystems.com
    </div>
  </div>
</div>`;

  const result: Record<string, unknown> = { type };

  if (type === "pending_approval") {
    // Active admins of that org (exclude the new member themselves)
    const { data: admins } = await sb
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", m.organization_id)
      .in("role", ["Super Admin", "Admin"])
      .eq("status", "Active");
    const ids = (admins ?? []).map((a: any) => a.user_id).filter((id: string) => id !== m.user_id);
    const { data: profs } = ids.length
      ? await sb.from("profiles").select("email").in("id", ids)
      : { data: [] };
    const emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);
    result.admins = emails.length;
    for (const to of emails) {
      result[to] = await send(
        to,
        `FleetFlow: ${memberName} is waiting for your approval`,
        shell(
          "#1A2B48",
          "New signup awaiting approval",
          `<p><b>${memberName}</b> (${member?.email ?? "email hidden"}) requested to join
           <b>${orgName}</b> as <b>${m.role}</b>.</p>
           <p>Approve or reject them from the Members panel
           (web: Clients → Members) or from the app's approvals badge.</p>
           <p><a href="${APP_URL}" style="display:inline-block;background:#1A2B48;color:#fff;
           text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:12px">
           OPEN FLEETFLOW</a></p>`,
        ),
      );
    }
  } else if (type === "member_approved") {
    if (member?.email) {
      result[member.email] = await send(
        member.email,
        `You're in — welcome to ${orgName} on FleetFlow`,
        shell(
          "#1A6440",
          "You're approved!",
          `<p>Hi <b>${memberName}</b> — your <b>${orgName}</b> administrator approved your
           FleetFlow account (role: <b>${m.role}</b>).</p>
           <p>Sign in to see your missions, fleet and team.</p>
           <p><a href="${APP_URL}/login" style="display:inline-block;background:#FF6B2C;color:#fff;
           text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:12px">
           SIGN IN</a></p>`,
        ),
      );
    }
  } else {
    return new Response("unknown type", { status: 400 });
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
