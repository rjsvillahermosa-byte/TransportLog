import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ScanLine, Car, AlertTriangle, ClipboardList } from "lucide-react";
import { getSupabaseClient } from "../lib/supabaseClient";

// Vehicle QR landing — /v/<token>. Anyone signed in can resolve the token
// (vehicle_by_qr_token RPC, SECURITY DEFINER); the page shows the vehicle,
// finds the open (Pending/In Progress) booking assigned to it, marks the
// scan as the driver's proof of physical presence for that vehicle, and
// sends the driver straight into that mission. The booking side stays
// org-stamped by the signed-in user (0005 trigger) — the QR never decides
// which org a booking belongs to, only which vehicle/mission it opens.
//
// The walk-around checklist itself lives entirely on Mission Detail now
// (behind its own "Start Mission" tap) — scanning the QR is proof you're at
// the vehicle, not a substitute for actually inspecting it.

export default function VehicleScan() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [state, setState] = useState("loading"); // loading | found | nomission | notfound | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        if (!sess?.session) {
          // Not signed in: remember where we were going, come back after login.
          sessionStorage.setItem("ff:postLoginRedirect", window.location.pathname);
          window.location.href = "/login";
          return;
        }
        const { data, error } = await sb.rpc("vehicle_by_qr_token", { p_token: token });
        if (error) throw new Error(error.message);
        const v = Array.isArray(data) ? data[0] : data;
        if (!v) {
          setState("notfound");
          return;
        }
        setVehicle(v);

        // Mark this as a verified physical scan for whichever mission we
        // land on — Mission Detail reads this to set vehicle_qr_verified on
        // the mileage log, independent of the walk-around checklist itself.
        sessionStorage.setItem(`ff:qrverified:${v.id}`, String(Date.now()));

        const { data: missions, error: mErr } = await sb
          .from("transport_requests")
          .select("id")
          .eq("vehicle_id", v.id)
          .in("status", ["Pending", "In Progress"])
          .order("schedule_date", { ascending: true })
          .order("schedule_time", { ascending: true })
          .limit(1);
        if (mErr) throw new Error(mErr.message);
        if (missions?.[0]?.id) {
          navigate(`/mission/${missions[0].id}`, { replace: true });
          return;
        }
        setState("nomission");
      } catch (e) {
        setErrorMsg(e.message || "Lookup failed");
        setState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-lg px-4 py-10">
        {state === "loading" && (
          <p className="text-center text-sm text-taupe">Resolving vehicle…</p>
        )}

        {state === "notfound" && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-card">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-3 font-heading text-xl font-bold text-cocoa">Unknown vehicle QR</h1>
            <p className="mt-2 text-sm text-mocha">
              This code doesn't match any vehicle in the system. It may be from an
              old printout — ask dispatch for the current vehicle QR.
            </p>
            <Link to="/" className="mt-5 inline-block text-sm font-semibold text-brand hover:underline">
              Go to Missions →
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-card">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-3 font-heading text-xl font-bold text-cocoa">Couldn't verify the QR</h1>
            <p className="mt-2 text-sm text-mocha">{errorMsg}</p>
          </div>
        )}

        {state === "nomission" && vehicle && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mint/50 border border-brand/20">
              <Car className="h-7 w-7 text-brand" />
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-brand">
              <ScanLine className="h-4 w-4" /> Vehicle verified
            </p>
            <h1 className="mt-1 font-heading text-xl font-bold text-cocoa">{vehicle.plate_number}</h1>
            <p className="text-sm text-taupe">
              {[vehicle.unit_name, vehicle.model].filter(Boolean).join(" · ") || "Company vehicle"}
            </p>
            <div className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm text-left">
              <p className="flex items-center gap-2 font-semibold text-cocoa">
                <ClipboardList className="h-4 w-4 text-taupe" /> No mission assigned right now
              </p>
              <p className="mt-1 text-xs text-taupe">
                This vehicle doesn't have a Pending or In Progress booking. Check with dispatch,
                or open your missions list — the checklist and Start Mission are there once one's assigned.
              </p>
            </div>
            <Link to="/" className="mt-5 inline-block text-sm font-semibold text-brand hover:underline">
              Go to Missions →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
