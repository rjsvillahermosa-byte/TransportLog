import { useCallback, useEffect, useState } from "react";
import { ScrollText, RefreshCw, Search } from "lucide-react";
import { Button, Input, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// Audit Logs — Console view over public.audit_log (0027). Platform team sees
// every tenant; each row shows who did what to which entity, with old→new
// pairs for updates. The trail itself is trigger-written and has no
// insert/update/delete policies, so what you see here cannot be doctored
// through the API.

const PAGE = 100;

const ACTION_STYLES = {
  created: "bg-mint text-brand",
  updated: "bg-accent/20 text-accent-dark",
  deleted: "bg-red-50 text-red-600",
};

export default function AuditLogs() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [orgFilter, setOrgFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const [{ data, error }, { data: orgRows }] = await Promise.all([
      sb
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE),
      sb.from("organizations").select("id, name, client_code"),
    ]);
    if (error) toast({ title: "Load failed", description: error.message });
    setRows(data || []);
    setOrgs(orgRows || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const orgName = (id) => {
    if (!id) return "Platform";
    const o = orgs.find((x) => x.id === id);
    return o ? o.name : id.slice(0, 8) + "…";
  };

  const filtered = rows.filter((r) => {
    if (orgFilter && r.organization_id !== (orgFilter === "__platform" ? null : orgFilter)) return false;
    if (actionFilter && r.action !== actionFilter) return false;
    if (search) {
      const hay = `${r.actor_email || ""} ${r.entity_type} ${r.entity_label || ""} ${r.entity_id || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">Audit Logs</h1>
          <p className="text-sm text-taupe">
            Who changed what, across every tenant. Trigger-written, tamper-proof.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="sm:w-56">
          <option value="">All organizations</option>
          <option value="__platform">Platform-global events</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name} ({o.client_code})</option>
          ))}
        </Select>
        <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="sm:w-36">
          <option value="">All actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-taupe" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, entity, label…"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 && !loading ? (
        <div className="rounded-3xl bg-white p-10 text-center shadow-card">
          <ScrollText className="mx-auto h-10 w-10 text-taupe" />
          <p className="mt-3 font-heading font-bold text-cocoa">No audit events yet</p>
          <p className="mt-1 text-sm text-mocha">
            Events appear the moment sensitive records change — and only after
            migration 0027 is run in the SQL editor.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-white shadow-card divide-y divide-sand/60 overflow-hidden">
          {filtered.map((r) => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ACTION_STYLES[r.action] || "bg-sand text-taupe"}`}>
                  {r.action}
                </span>
                <span className="text-sm font-semibold text-cocoa">{r.entity_type}</span>
                {r.entity_label && <span className="text-sm text-mocha">· {r.entity_label}</span>}
                <span className="ml-auto text-[11px] text-taupe">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-taupe mt-1">
                {r.actor_email || "unknown"} ({r.actor_role || "?"}) · {orgName(r.organization_id)}
              </p>
              {r.details && Object.keys(r.details).length > 0 && (
                <div className="mt-2 rounded-xl bg-cream px-3 py-2 space-y-1">
                  {Object.entries(r.details).map(([k, pair]) => (
                    <p key={k} className="text-[11px] text-mocha break-all">
                      <span className="font-semibold text-cocoa">{k}:</span>{" "}
                      <span className="text-taupe">{fmtVal(pair[0])}</span>
                      {" → "}
                      <span className="text-brand font-medium">{fmtVal(pair[1])}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-taupe mt-3">Showing the latest {PAGE} events.</p>
    </div>
  );
}

function fmtVal(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v === "[long value omitted]" ? v : v.length > 80 ? v.slice(0, 80) + "…" : v;
  return JSON.stringify(v);
}
