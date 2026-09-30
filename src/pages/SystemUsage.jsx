import { useEffect, useState } from "react";
import { Activity, Building2, Car, RefreshCw, Users } from "lucide-react";
import { Button } from "../components/ui";
import { getSupabaseClient } from "../lib/supabaseClient";

// System Usage — per-tenant footprint (Console roadmap card, now live):
// seats vs cap, vehicles vs cap, bookings, and 30-day activity per org.
// All reads are RLS-backed: platform team sees every org.

function Bar({ used, cap, unit }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-accent" : "bg-brand";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-taupe">{unit}</span>
        <span className={`font-semibold ${pct >= 100 ? "text-red-600" : "text-cocoa"}`}>
          {used} / {cap}{pct >= 100 ? " — at cap" : ""}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-sand/70 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SystemUsage() {
  const [orgs, setOrgs] = useState([]);
  const [members, setMembers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const [{ data: orgRows }, { data: memRows }, { data: vehRows }, { data: bookRows }, { data: actRows }] =
      await Promise.all([
        sb.from("organizations").select("id, name, client_code, plan_type, plan_status, max_users, max_vehicles").order("name"),
        sb.from("organization_members").select("organization_id, status"),
        sb.from("vehicles").select("id, organization_id, status"),
        sb.from("transport_requests").select("id, organization_id, status"),
        sb
          .from("audit_log")
          .select("organization_id, actor_email, action, entity_type, entity_label, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
    setOrgs(orgRows || []);
    setMembers(memRows || []);
    setVehicles(vehRows || []);
    setBookings(bookRows || []);
    setActivity(actRows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const count = (rows, orgId) => rows.filter((r) => r.organization_id === orgId).length;
  const activeCount = (rows, orgId) => rows.filter((r) => r.organization_id === orgId && (r.status === "Active" || r.status === "active")).length;
  const recent30 = (orgId) => activity.filter((a) => a.organization_id === orgId).length;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">System Usage</h1>
          <p className="text-sm text-taupe">Storage, rows & activity per organization.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="rounded-3xl bg-white p-10 text-center text-sm text-taupe shadow-card">Loading usage…</div>
      ) : orgs.length === 0 ? (
        <div className="rounded-3xl bg-white p-10 text-center shadow-card">
          <Building2 className="mx-auto h-10 w-10 text-taupe" />
          <p className="mt-3 font-heading font-bold text-cocoa">No organizations yet</p>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {orgs.map((o) => (
              <div key={o.id} className="bg-white rounded-3xl shadow-card border border-sand/60 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-heading font-bold text-cocoa">{o.name}</p>
                    <p className="text-xs text-taupe">
                      <span className="font-mono font-bold text-brand">{o.client_code}</span> · {o.plan_type} · {o.plan_status}
                    </p>
                  </div>
                  <Car className="w-5 h-5 text-taupe" />
                </div>
                <div className="space-y-3">
                  <Bar used={activeCount(members, o.id)} cap={o.max_users} unit="👤 Active seats" />
                  <Bar used={count(vehicles, o.id)} cap={o.max_vehicles} unit="🚗 Vehicles" />
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-sand/60 text-xs text-taupe">
                  <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {count(bookings, o.id)} bookings</span>
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {recent30(o.id)} audit events</span>
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-xs font-bold uppercase tracking-widest text-taupe mt-8 mb-2">Platform-wide recent activity</h2>
          <div className="rounded-3xl bg-white shadow-card divide-y divide-sand/60 overflow-hidden">
            {activity.length === 0 && (
              <p className="px-4 py-6 text-sm text-taupe text-center">
                No audit events yet — visible once migration 0027 is run.
              </p>
            )}
            {activity.slice(0, 25).map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs font-semibold uppercase text-taupe">{a.action}</span>
                <span className="text-cocoa">{a.entity_type}</span>
                {a.entity_label && <span className="text-mocha">· {a.entity_label}</span>}
                <span className="ml-auto text-xs text-taupe">{a.actor_email || "system"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
