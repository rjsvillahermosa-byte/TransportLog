import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, UserCog, Copy, Loader2, ShieldAlert } from "lucide-react";
import { Button, Input, Label, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// Platform team + API access — Super Admin (platform owner) surfaces in the
// Console. Platform roles live on profiles.platform_role (0014); API keys in
// api_keys (0014). Plaintext keys are shown exactly once at creation.

const PLATFORM_ROLES = [
  { value: "", label: "— none (client-side role only) —" },
  { value: "Platform Admin", label: "Platform Admin — full run of the platform" },
  { value: "Platform Auditor", label: "Platform Auditor — read-only across all tenants" },
  { value: "Platform Support", label: "Platform Support — view & fix, never delete" },
];

export function PlatformTeamCard() {
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [orgMap, setOrgMap] = useState({});   // orgId  -> "Name (CODE)"
  const [memberMap, setMemberMap] = useState({}); // userId -> [{org label, owner}]
  const [busy, setBusy] = useState("");

  const load = async () => {
    const sb = getSupabaseClient();
    // Profiles + memberships + org registry joined client-side so every row
    // shows WHICH COMPANY the account belongs to (owner/delegate can read all
    // three: "members read own orgs" and "orgs read own" include platform).
    const [{ data: profRows }, { data: memberRows }, { data: orgRows }] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, role, platform_role").order("full_name"),
      sb.from("organization_members").select("user_id, organization_id, role, is_org_owner, status"),
      sb.from("organizations").select("id, name, client_code"),
    ]);
    setPeople(profRows || []);
    const om = {};
    (orgRows || []).forEach((o) => { om[o.id] = `${o.name} (${o.client_code})`; });
    setOrgMap(om);
    const mm = {};
    (memberRows || []).forEach((m) => {
      if (!mm[m.user_id]) mm[m.user_id] = [];
      mm[m.user_id].push({
        label: om[m.organization_id] || m.organization_id,
        owner: !!m.is_org_owner,
        active: m.status === "Active",
      });
    });
    setMemberMap(mm);
  };
  useEffect(() => { load(); }, []);

  const orgsOf = (userId) =>
    (memberMap[userId] || [])
      .map((m) => `${m.label}${m.owner ? " · owner" : ""}${m.active ? "" : " · disabled"}`);

  const setRole = async (id, platform_role) => {
    setBusy(id);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("profiles").update({ platform_role: platform_role || null }).eq("id", id);
      if (error) throw error;
      await load();
      toast({ title: "Platform role updated" });
    } catch (e) {
      toast({ title: "Update failed", description: e.message });
    } finally {
      setBusy("");
    }
  };

  const platform = people.filter((p) => p.platform_role);
  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <h3 className="text-sm font-semibold text-cocoa mb-1 flex items-center gap-2">
        <UserCog className="w-4 h-4" /> Platform Team
      </h3>
      <p className="text-xs text-taupe mb-4">
        Your own side of the SaaS: Admins run it, Auditors get read-only compliance
        access to every tenant, Support can fix rows but never delete. These roles are
        independent of any client organization.
      </p>
      <div className="space-y-2">
        {people.map((p) => (
          <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-sand/60 rounded-xl px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-cocoa truncate">{p.full_name}</p>
              <p className="text-xs text-taupe truncate">
                {p.email} · client role: {p.role}
                {orgsOf(p.id).length
                  ? ` · 🏢 ${orgsOf(p.id).join(" + ")}`
                  : " · 🏢 no organization"}
              </p>
            </div>
            <Select
              value={p.platform_role || ""}
              onChange={(e) => setRole(p.id, e.target.value)}
              disabled={busy === p.id}
              className="sm:w-80 flex-none"
            >
              {PLATFORM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
            {busy === p.id && <Loader2 className="w-4 h-4 animate-spin text-taupe" />}
          </div>
        ))}
      </div>
      {platform.length > 0 && (
        <p className="text-[11px] text-taupe mt-3">
          On the platform team: {platform.map((p) => `${p.full_name} (${p.platform_role})`).join(", ")}
        </p>
      )}
    </div>
  );
}

export function ApiKeysCard() {
  const toast = useToast();
  const [orgs, setOrgs] = useState([]);
  const [keys, setKeys] = useState([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // {name, raw}

  const load = async () => {
    const sb = getSupabaseClient();
    const [{ data: orgRows }, { data: keyRows }] = await Promise.all([
      sb.from("organizations").select("id, name, client_code"),
      sb.from("api_keys").select("*").order("created_date", { ascending: false }),
    ]);
    setOrgs(orgRows || []);
    setKeys(keyRows || []);
  };
  useEffect(() => { load(); }, []);

  const createKey = async (form) => {
    setBusy(true);
    try {
      const raw = "ff_" + [...crypto.getRandomValues(new Uint8Array(24))]
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const prefix = raw.slice(0, 12);
      const hash = await sha256Hex(raw);
      const sb = getSupabaseClient();
      const { error } = await sb.from("api_keys").insert({
        organization_id: form.org,
        name: form.name || "Integration",
        key_prefix: prefix,
        key_hash: hash,
        scopes: form.scopes,
      });
      if (error) throw error;
      setCreated({ name: form.name || "Integration", raw });
      await load();
    } catch (e) {
      toast({ title: "Key creation failed", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm("Revoke this API key? Any integration using it stops immediately.")) return;
    const sb = getSupabaseClient();
    const { error } = await sb.from("api_keys").update({ is_active: false }).eq("id", id);
    if (error) toast({ title: "Revoke failed", description: error.message });
    else { toast({ title: "Key revoked" }); load(); }
  };

  const orgName = (id) => {
    const o = orgs.find((x) => x.id === id);
    return o ? `${o.name} (${o.client_code})` : id;
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <h3 className="text-sm font-semibold text-cocoa mb-1 flex items-center gap-2">
        <KeyRound className="w-4 h-4" /> API Keys
      </h3>
      <p className="text-xs text-taupe mb-4">
        Server-to-server access per client (e.g. a hotel PMS pulling booking data).
        Keys are hashed — the full key is shown once at creation.
      </p>

      <NewKeyForm orgs={orgs} busy={busy} onCreate={createKey} />

      {created && (
        <div className="mt-3 border border-brand/30 bg-mint/40 rounded-xl p-3">
          <p className="text-xs font-semibold text-brand mb-1">
            {created.name} — copy this key now, it will not be shown again:
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-white border border-sand rounded px-2 py-1 flex-1 break-all">{created.raw}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(created.raw); toast({ title: "Copied" }); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {keys.length === 0 && <p className="text-xs text-taupe">No API keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center gap-3 border border-sand/60 rounded-xl px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-cocoa truncate">
                {k.name} <span className="text-xs text-taupe">· {orgName(k.organization_id)}</span>
              </p>
              <p className="text-xs text-taupe">
                <code>{k.key_prefix}…</code> · {k.scopes} · {k.is_active ? "active" : "revoked"}
                {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : " · never used"}
              </p>
            </div>
            {k.is_active && (
              <Button size="sm" variant="outline" onClick={() => revoke(k.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewKeyForm({ orgs, busy, onCreate }) {
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("read");
  if (!orgs.length) return <p className="text-xs text-taupe">Create a client organization first.</p>;
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Select value={org} onChange={(e) => setOrg(e.target.value)} className="sm:flex-1">
        <option value="">Select organization…</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name} ({o.client_code})</option>
        ))}
      </Select>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Integration name" className="sm:w-48" />
      <Select value={scopes} onChange={(e) => setScopes(e.target.value)} className="sm:w-28 flex-none">
        <option value="read">read</option>
        <option value="write">write</option>
      </Select>
      <Button
        size="sm"
        variant="primary"
        className="flex-none"
        disabled={busy || !org}
        onClick={() => onCreate({ org, name, scopes })}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate
      </Button>
    </div>
  );
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
