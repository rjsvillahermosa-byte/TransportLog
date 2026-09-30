import { useEffect, useState } from "react";
import { RefreshCw, RotateCcw, UserCog } from "lucide-react";
import { Button } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// Master Permissions — the role × capability matrix (roadmap card, now live).
// Caps UI access per role inside the database's RLS floor: flipping a switch
// changes what each role sees in the nav and which admin pages they can open.
// Settings caches the matrix per session; the app applies it on next load.

export const CAPABILITIES = [
  { key: "view_reports", label: "Reports", desc: "Report builder access (Supervisor+ page)" },
  { key: "manage_settings", label: "Settings", desc: "Branding, fuel bands, user management" },
  { key: "manage_fleet", label: "Manage fleet", desc: "Add/edit vehicles, drivers & service logs" },
  { key: "manage_users", label: "Manage users", desc: "Invite, disable & re-role team members" },
];

const ROLES = ["Super Admin", "Admin", "Supervisor", "Driver", "Staff"];

export default function MasterPermissions() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const { data, error } = await sb.from("role_permissions").select("*");
    if (error) toast({ title: "Load failed", description: error.message });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const valueOf = (role, cap) =>
    rows.find((r) => r.role === role && r.capability === cap)?.allowed ?? false;

  const flip = async (role, cap) => {
    const key = `${role}:${cap}`;
    setBusy(key);
    const sb = getSupabaseClient();
    const allowed = !valueOf(role, cap);
    const existing = rows.find((r) => r.role === role && r.capability === cap);
    const { error } = existing
      ? await sb.from("role_permissions").update({ allowed, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await sb.from("role_permissions").insert({ role, capability: cap, allowed });
    setBusy("");
    if (error) { toast({ title: "Save failed", description: error.message }); return; }
    toast({ title: `${role} → ${cap} ${allowed ? "enabled" : "disabled"}`, description: "Takes effect for users on their next app load." });
    load();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">Master Permissions</h1>
          <p className="text-sm text-taupe">
            Role matrix editor — tunes what each role can open, inside the database's security floor.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand text-left text-xs uppercase tracking-wide text-taupe">
              <th className="px-4 py-3">Capability</th>
              {ROLES.map((r) => <th key={r} className="px-3 py-3 text-center">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((c) => (
              <tr key={c.key} className="border-b border-sand/60 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-cocoa">{c.label}</p>
                  <p className="text-xs text-taupe">{c.desc}</p>
                </td>
                {ROLES.map((r) => {
                  const allowed = valueOf(r, c.key);
                  const key = `${r}:${c.key}`;
                  return (
                    <td key={r} className="px-3 py-3 text-center">
                      <button
                        onClick={() => flip(r, c.key)}
                        disabled={busy === key || (r === "Super Admin" && !allowed)}
                        title={r === "Super Admin" && !allowed ? "Super Admin always keeps full access" : undefined}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          allowed ? "bg-brand" : "bg-sand"
                        } ${busy === key ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`inline-block h-4.5 w-4.5 h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
                            allowed ? "translate-x-[22px]" : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-taupe mt-3">
        Safety floor: the database's RLS policies still enforce the hard limits — this matrix tunes
        UI access within them. Super Admin retains full access by design (toggle locked).
      </p>
    </div>
  );
}
