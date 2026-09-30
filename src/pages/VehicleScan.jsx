import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ScanLine, Car, ShieldCheck, ClipboardCheck, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui";
import { getSupabaseClient } from "../lib/supabaseClient";
import { auth } from "../lib/db";

// Vehicle QR landing — /v/<token>. Anyone signed in can resolve the token
// (vehicle_by_qr_token RPC, SECURITY DEFINER); the page shows the vehicle and
// routes the driver to the right place in THE VEHICLE'S organization.
// This is the "which vehicle am I in" half of physical-world identity; the
// booking side stays org-stamped by the signed-in user (0005 trigger).

const CHECKLIST = [
  { key: "tires", label: "Tires — pressure & condition (all 4 + spare)" },
  { key: "fuel", label: "Fuel level sufficient for the trip" },
  { key: "lights", label: "Lights, brake lights & turn signals working" },
  { key: "brakes", label: "Brakes responsive (test before moving)" },
  { key: "fluids", label: "Oil, coolant & washer fluid levels OK" },
  { key: "docs", label: "OR/CR, insurance & registration inside the vehicle" },
  { key: "clean", label: "Interior clean & ready for guests" },
  { key: "tools", label: "Spare tire, jack & early-warning devices present" },
];

export default function VehicleScan() {
  const { token } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [state, setState] = useState("loading"); // loading | found | notfound | error
  const [errorMsg, setErrorMsg] = useState("");
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        if (!data || (Array.isArray(data) && data.length === 0)) {
          setState("notfound");
          return;
        }
        setVehicle(Array.isArray(data) ? data[0] : data);
        setState("found");
      } catch (e) {
        setErrorMsg(e.message || "Lookup failed");
        setState("error");
      }
    })();
  }, [token]);

  const allChecked = useMemo(
    () => CHECKLIST.every((c) => checked[c.key]),
    [checked]
  );

  const saveChecklist = async () => {
    if (!vehicle || !allChecked) return;
    setSaving(true);
    try {
      const sb = getSupabaseClient();
      await sb.from("pending_vehicle_checklists").insert({
        vehicle_id: vehicle.id,
        plate_number: vehicle.plate_number,
        answers: checked,
        completed_at: new Date().toISOString(),
      });
      sessionStorage.setItem(
        `ff:checklist:${vehicle.id}`,
        JSON.stringify({ at: Date.now(), answers: checked })
      );
      setSaved(true);
    } catch {
      // Even if the table is missing (0030 not fully applied), the local
      // cache still lets the driver proceed — the checklist answers are
      // attached to the mission at start.
      sessionStorage.setItem(
        `ff:checklist:${vehicle.id}`,
        JSON.stringify({ at: Date.now(), answers: checked })
      );
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

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

        {state === "found" && vehicle && (
          <>
            <div className="rounded-3xl bg-white p-6 shadow-card border border-sand/60">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand">
                <ScanLine className="h-4 w-4" /> Vehicle verified
              </p>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint/50 border border-brand/20">
                  <Car className="h-7 w-7 text-brand" />
                </div>
                <div>
                  <p className="font-heading text-2xl font-bold text-cocoa">{vehicle.plate_number}</p>
                  <p className="text-sm text-taupe">
                    {[vehicle.unit_name, vehicle.model].filter(Boolean).join(" · ") || "Company vehicle"}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm">
                <p className="text-taupe">
                  Belongs to <span className="font-semibold text-cocoa">{vehicle.organization_name || "your organization"}</span>
                </p>
                {vehicle.start_odometer_km != null && (
                  <p className="text-xs text-taupe mt-0.5">
                    Baseline ODO on record: {vehicle.start_odometer_km.toLocaleString()} km
                  </p>
                )}
                <p className={`text-xs mt-1 font-medium ${vehicle.status === "available" ? "text-brand" : "text-accent-dark"}`}>
                  Status: {vehicle.status}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl bg-white p-6 shadow-card border border-sand/60">
              <p className="flex items-center gap-2 text-sm font-bold text-cocoa">
                <ClipboardCheck className="h-4 w-4 text-brand" /> Pre-mission checklist
              </p>
              <p className="text-xs text-taupe mt-1 mb-3">
                Walk around the vehicle and check each item before you drive. Takes ~5 minutes.
              </p>
              <div className="space-y-2">
                {CHECKLIST.map((c) => (
                  <label
                    key={c.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      checked[c.key] ? "border-brand/40 bg-mint/30" : "border-sand/60 bg-white hover:bg-cream/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[c.key]}
                      onChange={(e) => setChecked((ch) => ({ ...ch, [c.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-[#1A2B48]"
                    />
                    <span className="text-sm text-cocoa">{c.label}</span>
                  </label>
                ))}
              </div>
              <Button
                variant="primary"
                className="mt-4 w-full"
                disabled={!allChecked || saving || saved}
                onClick={saveChecklist}
              >
                {saved ? (
                  <><ShieldCheck className="h-4 w-4" /> Checklist saved — you're clear to drive</>
                ) : (
                  <>Save checklist ({Object.values(checked).filter(Boolean).length}/{CHECKLIST.length})</>
                )}
              </Button>
              {saved && (
                <p className="mt-3 rounded-xl bg-mint/40 border border-brand/30 px-3 py-2 text-xs text-brand">
                  Checklist recorded for {vehicle.plate_number} at {new Date().toLocaleTimeString()}. Now open your
                  mission and capture the Start ODO photo.
                </p>
              )}
              <Link
                to="/"
                className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-brand hover:underline"
              >
                Go to my missions <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
