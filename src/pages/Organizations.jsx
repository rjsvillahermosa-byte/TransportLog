import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Button, Input, Label, Modal, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// ---------------------------------------------------------------------------
// Organizations admin — platform-super only (is_org_owner + Super Admin).
// Create client codes, set plans/limits, suspend orgs, inspect members.
// Backed by public.organizations + public.organization_members; RLS on those
// tables already scopes everything to platform supers, so this page can trust
// the queries that succeed and show empty/quiet errors when they don't.
// ---------------------------------------------------------------------------

const PLANS = ["trial", "starter", "pro", "enterprise"];
const PLAN_STATUS = ["active", "past_due", "suspended"];
const BLANK_FORM = {
  client_code: "",
  name: "",
  slug: "",
  business_type: "hotel",
  plan_type: "starter",
  max_vehicles: 3,
  max_users: 5,
};

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";

export default function Organizations() {
  const toast = useToast();
  const [orgs, setOrgs] = useState([]);
  const [memberCounts, setMemberCounts] = useState({}); // org_id -> count
  const [members, setMembers] = useState(null); // { org, rows } | null
  const [profileMap, setProfileMap] = useState({}); // user_id -> {full_name, email}
  const [linkId, setLinkId] = useState(""); // user to link into this org
  const [linkRole, setLinkRole] = useState("Staff");
  const [linkBusy, setLinkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isPlatformSuper, setIsPlatformSuper] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) {
      setOrgs(data || []);
      setIsPlatformSuper(true); // RLS only returns rows for platform supers
      const { data: mems } = await sb.from("organization_members").select("organization_id, status");
      const counts = {};
      (mems || []).forEach((m) => {
        counts[m.organization_id] = (counts[m.organization_id] || 0) + (m.status === "Active" ? 1 : 0);
      });
      setMemberCounts(counts);
    } else {
      setIsPlatformSuper(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === "client_code") v = v.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (k === "slug") v = slugify(v);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const createOrg = async (e) => {
    e.preventDefault();
    setError("");
    if (form.client_code.length < 4) {
      setError("Client code must be at least 4 characters (A-Z, 0-9, dashes).");
      return;
    }
    setSaving(true);
    const sb = getSupabaseClient();
    const { error: err } = await sb.from("organizations").insert({
      client_code: form.client_code,
      name: form.name.trim() || form.client_code,
      slug: form.slug || slugify(form.client_code),
      business_type: form.business_type,
      plan_type: form.plan_type,
      max_vehicles: Number(form.max_vehicles) || 3,
      max_users: Number(form.max_users) || 5,
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Failed to create organization.");
      return;
    }
    toast({ title: `Client code ${form.client_code} created`, description: "Share the code with the client — their first signup becomes Super Admin." });
    setCreateOpen(false);
    setForm(BLANK_FORM);
    load();
  };

  const setPlanField = async (orgId, patch) => {
    const sb = getSupabaseClient();
    const { error: err } = await sb.from("organizations").update(patch).eq("id", orgId);
    if (err) {
      toast({ title: "Update failed", description: err.message });
      return;
    }
    setOrgs((rows) => rows.map((o) => (o.id === orgId ? { ...o, ...patch } : o)));
  };

  const openMembers = async (org) => {
    const sb = getSupabaseClient();
    const [{ data }, { data: profs }] = await Promise.all([
      sb
        .from("organization_members")
        .select("id, user_id, role, is_org_owner, status, joined_at")
        .eq("organization_id", org.id),
      // Platform team can read every profile — names/emails for the member rows.
      sb.from("profiles").select("id, full_name, email"),
    ]);
    const pm = {};
    (profs || []).forEach((p) => { pm[p.id] = p; });
    setProfileMap(pm);
    setLinkId("");
    setMembers({ org, rows: data || [] });
  };

  const nameOf = (userId) => {
    const p = profileMap[userId];
    return p ? p.full_name || p.email : `${userId.slice(0, 8)}… (no profile)`;
  };
  const emailOf = (userId) => profileMap[userId]?.email || "";

  const linkUser = async () => {
    if (!linkId || !members) return;
    setLinkBusy(true);
    const sb = getSupabaseClient();
    const { error: err } = await sb.from("organization_members").insert({
      organization_id: members.org.id,
      user_id: linkId,
      role: linkRole,
      is_org_owner: false,
    });
    setLinkBusy(false);
    if (err) {
      toast({ title: "Link failed", description: err.message });
      return;
    }
    toast({
      title: "User linked",
      description: `${nameOf(linkId)} is now ${linkRole} in ${members.org.name}.`,
    });
    setLinkId("");
    setLinkRole("Staff");
    openMembers(members.org);
    load();
  };

  const removeMember = async (r) => {
    if (!window.confirm(`Remove ${nameOf(r.user_id)} from ${members.org.name}? Their account stays — only the company link is cut (you can re-link them to another company).`)) return;
    const sb = getSupabaseClient();
    const { error: err } = await sb.from("organization_members").delete().eq("id", r.id);
    if (err) {
      toast({ title: "Remove failed", description: err.message });
      return;
    }
    toast({ title: "Membership removed", description: `${nameOf(r.user_id)} no longer belongs to ${members.org.name}.` });
    openMembers(members.org);
    load();
  };

  const setMemberField = async (memberId, patch) => {
    const sb = getSupabaseClient();
    const { error: err } = await sb.from("organization_members").update(patch).eq("id", memberId);
    if (err) {
      toast({ title: "Update failed", description: err.message });
      return;
    }
    setMembers((m) => ({
      ...m,
      rows: m.rows.map((r) => (r.id === memberId ? { ...r, ...patch } : r)),
    }));
    load();
  };

  if (!loading && !isPlatformSuper) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-taupe" />
        <h1 className="mt-3 font-heading text-xl font-bold text-cocoa">Platform access only</h1>
        <p className="mt-2 text-sm text-mocha">
          Managing client organizations requires a platform Super Admin account
          (owner of the root organization).
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">Organizations</h1>
          <p className="text-sm text-mocha">
            Client codes, plans and members — every code below works at signup.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New client code
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl bg-white p-10 text-center text-sm text-taupe shadow-card">
          Loading organizations…
        </div>
      ) : orgs.length === 0 ? (
        <div className="rounded-3xl bg-white p-10 text-center shadow-card">
          <Building2 className="mx-auto h-10 w-10 text-taupe" />
          <p className="mt-3 font-heading font-bold text-cocoa">No organizations yet</p>
          <p className="mt-1 text-sm text-mocha">
            Create your first client code, or run the 0003 backfill checklist for
            the legacy fleet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand text-left text-xs uppercase tracking-wide text-taupe">
                <th className="px-4 py-3">Client code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Limits</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-4 py-3 font-mono font-bold text-brand">{o.client_code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-cocoa">{o.name}</p>
                    <p className="text-xs text-taupe">{o.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={o.plan_type}
                      onChange={(e) => setPlanField(o.id, { plan_type: e.target.value })}
                      className="!h-8 !py-0 text-xs"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-xs text-mocha">
                    🚗 {o.max_vehicles} · 👤 {o.max_users}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openMembers(o)}
                      className="inline-flex items-center gap-1.5 text-brand hover:underline"
                    >
                      <Users className="h-4 w-4" />
                      {memberCounts[o.id] ?? 0} active
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        setPlanField(o.id, {
                          plan_status: o.plan_status === "active" ? "suspended" : "active",
                        })
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        o.plan_status === "active"
                          ? "bg-mint text-brand"
                          : "bg-red-50 text-red-600"
                      }`}
                      title="Toggle active / suspended"
                    >
                      {o.plan_status}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openMembers(o)}>
                      Members
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New client organization">
        <form onSubmit={createOrg} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client code *</Label>
            <Input
              required
              value={form.client_code}
              onChange={set("client_code")}
              placeholder="GRAND-PLAZA"
              style={{ textTransform: "uppercase" }}
            />
            <p className="text-xs text-taupe">A-Z, 0-9 and dashes. This is what the client types at signup.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Organization name</Label>
            <Input value={form.name} onChange={set("name")} placeholder="Grand Plaza Hotel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Business type</Label>
              <Select value={form.business_type} onChange={set("business_type")}>
                <option value="hotel">hotel</option>
                <option value="transport">transport</option>
                <option value="logistics">logistics</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={form.plan_type} onChange={set("plan_type")}>
                {PLANS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Max vehicles</Label>
              <Input type="number" min="1" value={form.max_vehicles} onChange={set("max_vehicles")} />
            </div>
            <div className="space-y-1.5">
              <Label>Max users</Label>
              <Input type="number" min="1" value={form.max_users} onChange={set("max_users")} />
            </div>
          </div>
          {error && (
            <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Creating…" : "Create organization"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Members modal */}
      <Modal
        open={!!members}
        onClose={() => setMembers(null)}
        title={members ? `Members — ${members.org.name}` : ""}
      >
        {members && (
          <div className="space-y-3">
            <p className="text-xs text-taupe">
              Code <span className="font-mono font-bold text-brand">{members.org.client_code}</span>
              {" · "}first signup on this code became Super Admin.
            </p>
            {members.rows.length === 0 ? (
              <p className="rounded-xl bg-cream px-3 py-4 text-center text-sm text-mocha">
                No members yet — the client's first signup will claim this code, or link an existing user below.
              </p>
            ) : (
              <div className="divide-y divide-sand/60 rounded-xl border border-sand">
                {members.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-cocoa">
                        {nameOf(r.user_id)} {r.is_org_owner && <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent-dark">OWNER</span>}
                      </p>
                      <p className="truncate text-xs text-taupe">
                        {emailOf(r.user_id)} · joined {new Date(r.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={r.role}
                        onChange={(e) => setMemberField(r.id, { role: e.target.value })}
                        className="!h-8 !py-0 text-xs"
                      >
                        {["Super Admin", "Admin", "Supervisor", "Driver", "Staff"].map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </Select>
                      <button
                        onClick={() =>
                          setMemberField(r.id, {
                            status: r.status === "Active" ? "Disabled" : "Active",
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          r.status === "Active" ? "bg-mint text-brand" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {r.status}
                      </button>
                      {!r.is_org_owner && (
                        <button
                          onClick={() => removeMember(r)}
                          title="Remove from this company (account is kept)"
                          className="rounded-lg p-1.5 text-taupe hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Link an existing user — for accounts that missed the client
                code at registration, or when moving staff between companies. */}
            <div className="rounded-xl border border-dashed border-sand bg-cream/50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-cocoa">
                <UserPlus className="h-3.5 w-3.5" /> Link an existing user to {members.org.name}
              </p>
              <p className="mb-2 text-[11px] text-taupe">
                For accounts created without a client code. To MOVE someone from another
                company: remove them there first, then link them here.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="sm:flex-1">
                  <option value="">Select user…</option>
                  {Object.entries(profileMap)
                    .filter(([uid]) => !members.rows.some((r) => r.user_id === uid))
                    .sort((a, b) => (a[1].full_name || "").localeCompare(b[1].full_name || ""))
                    .map(([uid, p]) => (
                      <option key={uid} value={uid}>
                        {p.full_name || p.email} ({p.email})
                      </option>
                    ))}
                </Select>
                <Select value={linkRole} onChange={(e) => setLinkRole(e.target.value)} className="sm:w-36 flex-none">
                  {["Staff", "Driver", "Supervisor", "Admin", "Super Admin"].map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-none"
                  disabled={!linkId || linkBusy}
                  onClick={linkUser}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Link
                </Button>
              </div>
            </div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
