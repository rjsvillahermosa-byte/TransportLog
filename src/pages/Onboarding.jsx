import { useMemo, useState } from "react";
import { Building2, Check, Copy, Link2, UserPlus, Users, Wand2 } from "lucide-react";
import { Button, Input, Label, Modal, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// Client Onboarding — guided tenant creation (Console roadmap card, now live).
// 4 steps: identity → plan & limits → review/create → welcome kit. The welcome
// kit is the point: a copyable signup link (?code= prefills the Register page)
// plus immediate member linking, so a new client is operational in one sitting.

const PLANS = ["trial", "starter", "pro", "enterprise"];
const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";

const BLANK = {
  client_code: "",
  name: "",
  slug: "",
  business_type: "hotel",
  plan_type: "starter",
  max_vehicles: 3,
  max_users: 5,
};

export default function Onboarding() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // the org row after creation
  const [profiles, setProfiles] = useState([]);
  const [members, setMembers] = useState([]);   // linked so far: {user_id, role}
  const [linkId, setLinkId] = useState("");
  const [linkRole, setLinkRole] = useState("Staff");

  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === "client_code") v = v.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (k === "slug") v = slugify(v);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const signupUrl = useMemo(
    () => (created ? `${window.location.origin}/register?code=${created.client_code}` : ""),
    [created]
  );

  const openWizard = async () => {
    setForm(BLANK); setStep(1); setError(""); setCreated(null); setMembers([]); setLinkId("");
    const sb = getSupabaseClient();
    const { data } = await sb.from("profiles").select("id, full_name, email").order("full_name");
    setProfiles(data || []);
    setOpen(true);
  };

  const validate = () => {
    if (form.client_code.length < 4) return "Client code must be at least 4 characters (A-Z, 0-9, dashes).";
    if (!form.name.trim()) return "Give the organization a name (shown in their dashboard branding).";
    return "";
  };

  const createOrg = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true); setError("");
    const sb = getSupabaseClient();
    const { data, error: err } = await sb
      .from("organizations")
      .insert({
        client_code: form.client_code,
        name: form.name.trim(),
        slug: form.slug || slugify(form.client_code),
        business_type: form.business_type,
        plan_type: form.plan_type,
        max_vehicles: Number(form.max_vehicles) || 3,
        max_users: Number(form.max_users) || 5,
        plan_status: "active",
      })
      .select()
      .single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    setCreated(data);
    setStep(4);
  };

  const linkMember = async () => {
    if (!linkId || !created) return;
    const sb = getSupabaseClient();
    // Seat-cap enforcement on manual links too.
    const { count } = await sb
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", created.id)
      .eq("status", "Active");
    if ((count ?? 0) >= (Number(created.max_users) || 5)) {
      toast({
        title: "Seat limit reached",
        description: `${created.name} is at ${count}/${created.max_users} active seats. Raise the cap to add more.`,
      });
      return;
    }
    const { error: err } = await sb.from("organization_members").insert({
      organization_id: created.id,
      user_id: linkId,
      role: linkRole,
      is_org_owner: false,
    });
    if (err) { toast({ title: "Link failed", description: err.message }); return; }
    setMembers((m) => [...m, { user_id: linkId, role: linkRole }]);
    setLinkId("");
  };

  const nameOf = (uid) => {
    const p = profiles.find((x) => x.id === uid);
    return p ? p.full_name || p.email : uid.slice(0, 8) + "…";
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-cocoa">Client Onboarding</h1>
      <p className="text-sm text-taupe mt-1 mb-6">
        Guided tenant creation — org, plan, welcome kit with a shareable signup
        link, and first members in one sitting.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <button
          onClick={openWizard}
          className="bg-white rounded-3xl shadow-card border border-sand/60 p-6 text-left hover:border-brand/50 hover:shadow-lift transition-all group"
        >
          <div className="w-11 h-11 rounded-2xl bg-mint/50 border border-brand/20 flex items-center justify-center mb-3 group-hover:bg-mint">
            <Wand2 className="w-6 h-6 text-brand" />
          </div>
          <p className="font-heading font-bold text-cocoa">Onboard a new client</p>
          <p className="text-xs text-taupe mt-1">
            Wizard: client code → plan & limits → review → welcome kit + members.
          </p>
        </button>
        <div className="bg-white rounded-3xl shadow-card border border-sand/60 p-6">
          <div className="w-11 h-11 rounded-2xl bg-mint/50 border border-brand/20 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-brand" />
          </div>
          <p className="font-heading font-bold text-cocoa">Fast path</p>
          <p className="text-xs text-taupe mt-1">
            Already know the drill? Clients → <span className="font-semibold text-cocoa">New client code</span>{" "}
            creates the org directly; the Members panel links people anytime.
          </p>
        </div>
      </div>

      <div className="rounded-3xl bg-cream border border-sand/60 p-5 text-sm text-mocha">
        <p className="font-semibold text-cocoa mb-1">How client onboarding works</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Create the org — the client code is what their team types at signup.</li>
          <li>Share the welcome-kit signup link — it prefills and validates the code automatically.</li>
          <li>Their <span className="font-semibold">first signup becomes the client's Super Admin/owner</span> (0003 trigger).</li>
          <li>Existing accounts (e.g. staff created before the code existed) get linked in step 4 or the Members panel.</li>
          <li>Set their Booking Preferences (locations, 24h, terminology) in Settings → Client Booking Preferences.</li>
        </ol>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Onboard a client — step ${Math.min(step, 4)} of 4`}>
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Client code *</Label>
              <Input required value={form.client_code} onChange={set("client_code")} placeholder="MADISON" style={{ textTransform: "uppercase" }} />
              <p className="text-xs text-taupe">A-Z, 0-9, dashes — the code their team types at signup.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Organization name *</Label>
              <Input value={form.name} onChange={set("name")} placeholder="Madison Suites" />
              <p className="text-xs text-taupe">Shown in their Mission Dashboard branding pill.</p>
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
                <Label>URL slug</Label>
                <Input value={form.slug} onChange={set("slug")} placeholder="auto from code" />
              </div>
            </div>
            <WizardNav onNext={() => { const v = form.client_code.length < 4 ? "Client code must be at least 4 characters." : ""; setError(v); if (!v) setStep(2); }} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={form.plan_type} onChange={set("plan_type")}>
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value="active" disabled><option value="active">active</option></Select>
              </div>
              <div className="space-y-1.5">
                <Label>Max vehicles</Label>
                <Input type="number" min="1" value={form.max_vehicles} onChange={set("max_vehicles")} />
              </div>
              <div className="space-y-1.5">
                <Label>Max users (seats)</Label>
                <Input type="number" min="1" value={form.max_users} onChange={set("max_users")} />
              </div>
            </div>
            <p className="text-xs text-taupe">Paywall caps: enrollment and fleet adds stop at these limits (seat/vehicle counts enforced server-side).</p>
            <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-cream border border-sand/60 p-4 text-sm space-y-1">
              <p><span className="text-taupe">Code:</span> <span className="font-mono font-bold text-brand">{form.client_code}</span></p>
              <p><span className="text-taupe">Name:</span> {form.name || "—"}</p>
              <p><span className="text-taupe">Plan:</span> {form.plan_type} · active</p>
              <p><span className="text-taupe">Limits:</span> 🚗 {form.max_vehicles} vehicles · 👤 {form.max_users} users</p>
            </div>
            {error && <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <WizardNav onBack={() => setStep(2)} nextLabel={saving ? "Creating…" : "Create organization"} onNext={createOrg} disabled={saving} />
          </div>
        )}

        {step === 4 && created && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand/30 bg-mint/40 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-brand mb-1">
                <Check className="w-4 h-4" /> {created.name} is live — welcome kit
              </p>
              <p className="text-xs text-mocha mb-3">
                Share this link: it opens Register with the client code already filled and validated.
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white border border-sand rounded px-2 py-1.5 flex-1 break-all">{signupUrl}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(signupUrl); toast({ title: "Signup link copied" }); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-mocha mt-2 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> Code <span className="font-mono font-bold">{created.client_code}</span> · their first signup becomes the client's owner
              </p>
            </div>

            <div className="rounded-xl border border-dashed border-sand bg-cream/50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-cocoa">
                <UserPlus className="h-3.5 w-3.5" /> Link existing accounts (optional)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="sm:flex-1">
                  <option value="">Select user…</option>
                  {profiles
                    .filter((p) => !members.some((m) => m.user_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email} ({p.email})</option>
                    ))}
                </Select>
                <Select value={linkRole} onChange={(e) => setLinkRole(e.target.value)} className="sm:w-36 flex-none">
                  {["Staff", "Driver", "Supervisor", "Admin", "Super Admin"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
                <Button size="sm" variant="outline" className="flex-none" disabled={!linkId} onClick={linkMember}>
                  <UserPlus className="h-3.5 w-3.5" /> Link
                </Button>
              </div>
              {members.length > 0 && (
                <div className="mt-2 space-y-1">
                  {members.map((m) => (
                    <p key={m.user_id} className="text-xs text-mocha">
                      <Building2 className="inline w-3 h-3 mr-1 text-brand" />{nameOf(m.user_id)} · {m.role}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => { setOpen(false); toast({ title: `${created.name} onboarded 🎉` }); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function WizardNav({ onBack, onNext, nextLabel = "Next", disabled }) {
  return (
    <div className="flex justify-between pt-2">
      <Button type="button" variant="outline" onClick={onBack} disabled={!onBack}>Back</Button>
      <Button type="button" variant="primary" onClick={onNext} disabled={disabled}>{nextLabel}</Button>
    </div>
  );
}
