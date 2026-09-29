import { useEffect, useState } from "react";
import { MapPin, Clock, Tags, Plus, Trash2, Loader2 } from "lucide-react";
import { Button, Input, Label, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { loadOrgPrefs, saveOrgPrefs, DEFAULT_PREFS } from "../lib/orgPrefs";

// Client Booking Preferences — per-org config for the client-facing UI:
// booking locations, the 24h/12h time standard, and role terminology.
// Admin-only surface (Settings is admin-gated in App.jsx and the nav).

const ROLES = ["Driver", "Staff", "Supervisor", "Admin", "Super Admin"];
const KINDS = [
  { value: "both", label: "Pickup & Destination" },
  { value: "pickup", label: "Pickup only" },
  { value: "dropoff", label: "Destination only" },
];

export default function ClientPrefsCard() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locName, setLocName] = useState("");
  const [locKind, setLocKind] = useState("both");

  useEffect(() => {
    loadOrgPrefs(true).then((p) => {
      setPrefs(p);
      setLoaded(true);
    });
  }, []);

  const persist = async (patch) => {
    setBusy(true);
    try {
      const next = await saveOrgPrefs(patch);
      setPrefs(next);
      toast({ title: "Preferences saved" });
    } catch (e) {
      toast({ title: "Save failed", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const addLocation = () => {
    const name = locName.trim();
    if (!name) return;
    if (prefs.location_presets.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Already in the list", description: name });
      return;
    }
    const next = [...prefs.location_presets, { name, kind: locKind }];
    setLocName("");
    setLocKind("both");
    persist({ location_presets: next });
  };

  const removeLocation = (name) => {
    persist({ location_presets: prefs.location_presets.filter((l) => l.name !== name) });
  };

  const setTerm = (role, term) => {
    persist({ role_terms: { ...prefs.role_terms, [role]: term } });
  };

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <h3 className="text-sm font-semibold text-cocoa mb-1">Client Booking Preferences</h3>
      <p className="text-xs text-taupe mb-4">
        Booking locations, the time standard, and how roles are titled — applied to every
        member of your organization.
      </p>

      {/* Booking locations */}
      <div className="mb-5">
        <Label className="mb-1.5 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Booking locations
        </Label>
        <p className="text-[11px] text-taupe mb-2">
          Offered as quick picks on New Booking. Members can still choose "Others" and type
          any custom place — the dispatcher gets the exact details.
        </p>
        <div className="flex gap-2 mb-2">
          <Input
            value={locName}
            onChange={(e) => setLocName(e.target.value)}
            placeholder="e.g. Mactan Cebu Airport T2"
            onKeyDown={(e) => e.key === "Enter" && addLocation()}
          />
          <Select value={locKind} onChange={(e) => setLocKind(e.target.value)} className="w-44 flex-none">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
          <Button size="sm" variant="primary" onClick={addLocation} disabled={busy} className="flex-none">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        {prefs.location_presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {prefs.location_presets.map((l) => (
              <span
                key={l.name}
                className="inline-flex items-center gap-1.5 bg-mint/50 border border-brand/20 rounded-full px-3 py-1 text-xs font-medium text-brand"
              >
                {l.name}
                <span className="text-[10px] text-taupe">
                  {l.kind === "pickup" ? "pickup" : l.kind === "dropoff" ? "drop-off" : "both"}
                </span>
                <button
                  onClick={() => removeLocation(l.name)}
                  className="text-taupe hover:text-red-600"
                  title="Remove location"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Time standard */}
      <div className="mb-5">
        <Label className="mb-1.5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Time standard
        </Label>
        <p className="text-[11px] text-taupe mb-2">
          24-hour is the standard — it removes AM/PM scheduling confusion. Change it here if
          your team prefers 12-hour. Stored times are always 24h internally, so schedules
          never shift when you switch.
        </p>
        <Select
          value={prefs.time_format}
          onChange={(e) => persist({ time_format: e.target.value })}
          disabled={busy}
          className="w-56"
        >
          <option value="24h">24-hour (00:00–23:59) — recommended</option>
          <option value="12h">12-hour (AM/PM)</option>
        </Select>
      </div>

      {/* Role terminology */}
      <div>
        <Label className="mb-1.5 flex items-center gap-1.5">
          <Tags className="w-3.5 h-3.5" /> Role terminology
        </Label>
        <p className="text-[11px] text-taupe mb-2">
          Rename what each role is called across your workspace — e.g. Admin → "Dispatcher"
          or "Front Office". Access levels never change; only the label.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
          {ROLES.map((role) => (
            <div key={role} className="flex items-center gap-2">
              <span className="text-xs text-taupe w-24 flex-none">{role}</span>
              <Input
                value={prefs.role_terms[role] || ""}
                onChange={(e) => setTerm(role, e.target.value)}
                placeholder={role}
                disabled={busy}
              />
            </div>
          ))}
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-taupe mt-2" />}
      </div>
    </div>
  );
}
