import { useEffect, useMemo, useState } from "react";
import { CreditCard, RefreshCw, Plus, Check } from "lucide-react";
import { Button, Input, Label, Modal, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// Subscriptions — plan billing, invoices & upgrade flow per client (roadmap
// card, now live). Manual invoicing model: the platform owner records an
// invoice per billing period and marks it paid; the upgrade flow is a plan
// change here. No payment gateway yet — by design, see commit history.

const PLANS = ["trial", "starter", "pro", "enterprise"];
const STATUS_STYLES = {
  unpaid: "bg-accent/20 text-accent-dark",
  paid: "bg-mint text-brand",
  void: "bg-sand text-taupe",
};

export default function Subscriptions() {
  const toast = useToast();
  const [orgs, setOrgs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invOrg, setInvOrg] = useState("");
  const [modal, setModal] = useState(null); // org row
  const [form, setForm] = useState({ amount: "", period_start: "", period_end: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const [{ data: orgRows }, { data: invRows }] = await Promise.all([
      sb.from("organizations").select("id, name, client_code, plan_type, plan_status, billing_cycle, monthly_price, renewal_date, max_users, max_vehicles").order("name"),
      sb.from("subscriptions_invoices").select("*").order("issued_date", { ascending: false }).limit(100),
    ]);
    setOrgs(orgRows || []);
    setInvoices(invRows || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patch = async (orgId, p) => {
    const sb = getSupabaseClient();
    const { error } = await sb.from("organizations").update(p).eq("id", orgId);
    if (error) toast({ title: "Update failed", description: error.message });
    else load();
  };

  const createInvoice = async () => {
    if (!modal) return;
    setSaving(true);
    const sb = getSupabaseClient();
    const { error } = await sb.from("subscriptions_invoices").insert({
      organization_id: modal.id,
      amount: Number(form.amount) || 0,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Invoice failed", description: error.message }); return; }
    toast({ title: "Invoice recorded" });
    setModal(null);
    setForm({ amount: "", period_start: "", period_end: "", notes: "" });
    load();
  };

  const markPaid = async (inv) => {
    const sb = getSupabaseClient();
    const { error } = await sb.from("subscriptions_invoices").update({ status: "paid", paid_date: new Date().toISOString().slice(0, 10) }).eq("id", inv.id);
    if (error) toast({ title: "Update failed", description: error.message });
    else load();
  };

  const mrr = useMemo(
    () => orgs.filter((o) => o.plan_status === "active").reduce((s, o) => s + (Number(o.monthly_price) || 0), 0),
    [orgs]
  );
  const unpaid = invoices.filter((i) => i.status === "unpaid");

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">Subscriptions</h1>
          <p className="text-sm text-taupe">Plan billing, invoices & upgrade flow per client.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-3xl bg-white shadow-card p-4">
          <p className="text-xs text-taupe">Monthly recurring revenue</p>
          <p className="font-heading text-2xl font-bold text-brand">₱{mrr.toLocaleString()}</p>
          <p className="text-[11px] text-taupe">sum of active orgs' monthly price</p>
        </div>
        <div className="rounded-3xl bg-white shadow-card p-4">
          <p className="text-xs text-taupe">Unpaid invoices</p>
          <p className="font-heading text-2xl font-bold text-cocoa">{unpaid.length}</p>
          <p className="text-[11px] text-taupe">₱{unpaid.reduce((s, i) => s + Number(i.amount), 0).toLocaleString()} outstanding</p>
        </div>
        <div className="rounded-3xl bg-white shadow-card p-4">
          <p className="text-xs text-taupe">Active clients</p>
          <p className="font-heading text-2xl font-bold text-cocoa">{orgs.filter((o) => o.plan_status === "active").length}/{orgs.length}</p>
          <p className="text-[11px] text-taupe">plan_status = active</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white shadow-card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand text-left text-xs uppercase tracking-wide text-taupe">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Cycle</th>
              <th className="px-4 py-3">Monthly</th>
              <th className="px-4 py-3">Renews</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-b border-sand/60 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-cocoa">{o.name}</p>
                  <p className="text-xs text-taupe font-mono">{o.client_code}</p>
                </td>
                <td className="px-4 py-3">
                  <Select value={o.plan_type} onChange={(e) => patch(o.id, { plan_type: e.target.value })} className="!h-8 !py-0 text-xs">
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <Select value={o.billing_cycle} onChange={(e) => patch(o.id, { billing_cycle: e.target.value })} className="!h-8 !py-0 text-xs">
                    <option value="monthly">monthly</option>
                    <option value="quarterly">quarterly</option>
                    <option value="annual">annual</option>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number" step="0.01" min="0"
                    defaultValue={o.monthly_price ?? ""}
                    onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== o.monthly_price) patch(o.id, { monthly_price: v }); }}
                    className="!h-8 !py-0 w-24 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="date"
                    defaultValue={o.renewal_date ?? ""}
                    onBlur={(e) => { if (e.target.value !== (o.renewal_date ?? "")) patch(o.id, { renewal_date: e.target.value || null }); }}
                    className="!h-8 !py-0 w-36 text-xs"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setModal(o)}>
                    <Plus className="h-3.5 w-3.5" /> Invoice
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xs font-bold uppercase tracking-widest text-taupe mb-2">Invoices</h2>
      <div className="rounded-3xl bg-white shadow-card divide-y divide-sand/60 overflow-hidden">
        {invoices.length === 0 && (
          <p className="px-4 py-6 text-sm text-taupe text-center">
            No invoices yet — record one from a client row above (requires 0029 to be run).
          </p>
        )}
        {invoices.map((i) => (
          <div key={i.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[i.status] || "bg-sand text-taupe"}`}>{i.status}</span>
            <span className="text-sm font-semibold text-cocoa">₱{Number(i.amount).toLocaleString()}</span>
            <span className="text-xs text-mocha">{orgs.find((o) => o.id === i.organization_id)?.name || i.organization_id.slice(0, 8) + "…"}</span>
            <span className="text-xs text-taupe">issued {i.issued_date}{i.period_start ? ` · ${i.period_start} → ${i.period_end || "?"}` : ""}</span>
            <span className="ml-auto flex items-center gap-2">
              {i.status === "unpaid" && (
                <Button size="sm" variant="outline" onClick={() => markPaid(i)}><Check className="h-3.5 w-3.5" /> Mark paid</Button>
              )}
            </span>
          </div>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal ? `New invoice — ${modal.name}` : ""}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount (₱) *</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder={modal?.monthly_price ? String(modal.monthly_price) : "5000"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period start</Label>
              <Input type="date" value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Period end</Label>
              <Input type="date" value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. December billing" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={createInvoice} disabled={saving || !form.amount}>{saving ? "Saving…" : "Record invoice"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
