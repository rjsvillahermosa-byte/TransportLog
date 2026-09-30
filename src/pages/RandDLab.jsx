import { useEffect, useState } from "react";
import { FlaskConical, RefreshCw, Beaker } from "lucide-react";
import { Button, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// R&D Lab — feature flags & experimental rollouts (roadmap card, now live).
// Each flag toggles globally or per-org (enabled_orgs). The app reads its
// org's effective state at load: enabled OR org in enabled_orgs.

export default function RandDLab() {
  const toast = useToast();
  const [flags, setFlags] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const [{ data: flagRows }, { data: orgRows }] = await Promise.all([
      sb.from("feature_flags").select("*").order("key"),
      sb.from("organizations").select("id, name").order("name"),
    ]);
    setFlags(flagRows || []);
    setOrgs(orgRows || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patch = async (key, p) => {
    const sb = getSupabaseClient();
    const { error } = await sb.from("feature_flags").update({ ...p, updated_at: new Date().toISOString() }).eq("key", key);
    if (error) toast({ title: "Save failed", description: error.message });
    else load();
  };

  const toggleOrg = (flag, orgId) => {
    const has = flag.enabled_orgs.includes(orgId);
    patch(flag.key, {
      enabled_orgs: has ? flag.enabled_orgs.filter((x) => x !== orgId) : [...flag.enabled_orgs, orgId],
    });
  };

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">R&amp;D Lab</h1>
          <p className="text-sm text-taupe">Feature flags &amp; experimental rollouts — ship to one client first, then everyone.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {flags.map((f) => (
          <div key={f.key} className="rounded-3xl bg-white shadow-card border border-sand/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-heading font-bold text-cocoa">
                  <Beaker className="w-4 h-4 text-brand" /> {f.label}
                </p>
                <p className="text-xs text-taupe mt-0.5">{f.description}</p>
                <p className="text-[10px] text-taupe mt-1 font-mono">{f.key}</p>
              </div>
              <button
                onClick={() => patch(f.key, { enabled: !f.enabled })}
                className={`relative inline-flex h-7 w-14 flex-none items-center rounded-full transition-colors ${f.enabled ? "bg-brand" : "bg-sand"}`}
              >
                <span className={`inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow transition-transform ${f.enabled ? "translate-x-[30px]" : "translate-x-[4px]"}`} />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-sand/60">
              <p className="text-xs font-semibold text-cocoa mb-2">
                Pilot with specific clients (works even when the global switch is off):
              </p>
              <div className="flex flex-wrap gap-2">
                {orgs.map((o) => {
                  const on = f.enabled_orgs.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggleOrg(f, o.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        on ? "bg-mint text-brand border-brand/40" : "bg-cream text-taupe border-sand hover:border-brand/40"
                      }`}
                    >
                      {on ? "✓ " : ""}{o.name}
                    </button>
                  );
                })}
                {orgs.length === 0 && <p className="text-xs text-taupe">No orgs yet.</p>}
              </div>
            </div>
          </div>
        ))}
        {!loading && flags.length === 0 && (
          <div className="rounded-3xl bg-white p-10 text-center shadow-card">
            <FlaskConical className="mx-auto h-10 w-10 text-taupe" />
            <p className="mt-3 font-heading font-bold text-cocoa">No flags yet</p>
            <p className="mt-1 text-sm text-mocha">Run migration 0029 to create the flag set.</p>
          </div>
        )}
      </div>
    </div>
  );
}
