import { useEffect, useRef, useState } from "react";
import { MapPin, Clock, Tags, Plus, Trash2, Loader2, ClipboardList, UploadCloud, Undo2 } from "lucide-react";
import { Button, Input, Label, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { loadOrgPrefs, saveOrgPrefs, DEFAULT_PREFS } from "../lib/orgPrefs";
import { BOOKING_TYPES, cn } from "../lib/utils";

// Client Booking Preferences — per-org config for the client-facing UI:
// booking locations, the 24h/12h time standard, and role terminology.
// Admin-only surface (Settings is admin-gated in App.jsx and the nav).

const ROLES = ["Driver", "Staff", "Supervisor", "Admin", "Super Admin"];
const KINDS = [
  { value: "both", label: "Pickup & Destination" },
  { value: "pickup", label: "Pickup only" },
  { value: "dropoff", label: "Destination only" },
];

// Seeds the draft from the app's original hardcoded list the first time an
// org has never customized Booking Type — so there's something real to
// edit instead of an empty list, without that fallback ever silently
// overriding a real (possibly empty-on-purpose) published list again later.
const seedBookingTypes = (opts) =>
  (opts.length ? opts : BOOKING_TYPES.map((v) => ({ value: v, enabled: true })));

export default function ClientPrefsCard() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locName, setLocName] = useState("");
  const [locKind, setLocKind] = useState("both");
  const [newBookingType, setNewBookingType] = useState("");
  // Booking Type and Location lists are edited as a local DRAFT — nothing
  // reaches New Booking until "Publish changes" is clicked. `snapshot` is
  // the JSON of the last-published state, so dirty-checking and Discard
  // both just compare/reset against it instead of needing a second round
  // trip to the server.
  const [draftLocations, setDraftLocations] = useState([]);
  const [draftBookingTypes, setDraftBookingTypes] = useState([]);
  const [snapshot, setSnapshot] = useState("");
  const [publishing, setPublishing] = useState(false);
  // Role-terms inputs used to persist(...) on every keystroke: a network
  // round trip per character, and the field disabled itself (busy) for
  // the duration of each one — the field could only ever accept one
  // letter before locking up until that save returned. Local state here
  // makes typing instant; the actual save is debounced below.
  const [localTerms, setLocalTerms] = useState({});
  const localTermsRef = useRef({});
  const debounceRef = useRef(null);

  useEffect(() => {
    loadOrgPrefs(true).then((p) => {
      setPrefs(p);
      const locs = p.location_presets.map((l) => ({ ...l, enabled: l.enabled !== false }));
      const types = seedBookingTypes(p.booking_type_options).map((t) => ({ ...t, enabled: t.enabled !== false }));
      setDraftLocations(locs);
      setDraftBookingTypes(types);
      setSnapshot(JSON.stringify({ location_presets: locs, booking_type_options: types }));
      setLocalTerms(p.role_terms);
      localTermsRef.current = p.role_terms;
      setLoaded(true);
    });
  }, []);

  useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), []);

  const isDirty =
    loaded &&
    JSON.stringify({ location_presets: draftLocations, booking_type_options: draftBookingTypes }) !== snapshot;

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

  const publishLists = async () => {
    setPublishing(true);
    try {
      const next = await saveOrgPrefs({ location_presets: draftLocations, booking_type_options: draftBookingTypes });
      setPrefs(next);
      setSnapshot(JSON.stringify({ location_presets: draftLocations, booking_type_options: draftBookingTypes }));
      toast({ title: "Published", description: "New Booking now shows your updated lists." });
    } catch (e) {
      toast({ title: "Publish failed", description: e.message });
    } finally {
      setPublishing(false);
    }
  };

  const discardDraft = () => {
    const snap = JSON.parse(snapshot);
    setDraftLocations(snap.location_presets);
    setDraftBookingTypes(snap.booking_type_options);
  };

  const addLocation = () => {
    const name = locName.trim();
    if (!name) return;
    if (draftLocations.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Already in the list", description: name });
      return;
    }
    setDraftLocations([...draftLocations, { name, kind: locKind, enabled: true }]);
    setLocName("");
    setLocKind("both");
  };

  const removeLocation = (name) => setDraftLocations(draftLocations.filter((l) => l.name !== name));
  const toggleLocation = (name) =>
    setDraftLocations(draftLocations.map((l) => (l.name === name ? { ...l, enabled: !l.enabled } : l)));

  const addBookingType = () => {
    const value = newBookingType.trim();
    if (!value) return;
    if (draftBookingTypes.some((t) => t.value.toLowerCase() === value.toLowerCase())) {
      toast({ title: "Already in the list", description: value });
      return;
    }
    setDraftBookingTypes([...draftBookingTypes, { value, enabled: true }]);
    setNewBookingType("");
  };

  const removeBookingType = (value) => setDraftBookingTypes(draftBookingTypes.filter((t) => t.value !== value));
  const toggleBookingType = (value) =>
    setDraftBookingTypes(draftBookingTypes.map((t) => (t.value === value ? { ...t, enabled: !t.enabled } : t)));

  const setTerm = (role, term) => {
    const next = { ...localTermsRef.current, [role]: term };
    localTermsRef.current = next;
    setLocalTerms(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Saves 700ms after the last keystroke, not on every one.
    debounceRef.current = setTimeout(() => {
      persist({ role_terms: localTermsRef.current });
    }, 700);
  };

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-cocoa">Client Booking Preferences</h3>
        {isDirty && (
          <div className="flex items-center gap-2 flex-none">
            <span className="text-[11px] font-medium text-orange bg-orange/10 rounded-full px-2.5 py-1">
              Unpublished changes
            </span>
            <Button size="sm" variant="outline" onClick={discardDraft} disabled={publishing}>
              <Undo2 className="w-3.5 h-3.5" /> Discard
            </Button>
            <Button size="sm" variant="primary" onClick={publishLists} disabled={publishing}>
              {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              Publish changes
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-taupe mb-4">
        Booking locations, booking types, the time standard, and how roles are titled —
        applied to every member of your organization. Locations and booking types are edited
        as a draft here; New Booking only sees your changes once you click Publish.
      </p>

      {/* Booking types */}
      <div className="mb-5">
        <Label className="mb-1.5 flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" /> Booking types
        </Label>
        <p className="text-[11px] text-taupe mb-2">
          Shown in the Booking Type dropdown on New Booking. Toggle one off to hide it without
          losing your wording — it stays here, just unpublished.
        </p>
        <div className="flex gap-2 mb-2">
          <Input
            value={newBookingType}
            onChange={(e) => setNewBookingType(e.target.value)}
            placeholder="e.g. (Procurement) Departmental Errand Booking"
            onKeyDown={(e) => e.key === "Enter" && addBookingType()}
          />
          <Button size="sm" variant="primary" onClick={addBookingType} className="flex-none">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        {draftBookingTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draftBookingTypes.map((t) => (
              <span
                key={t.value}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border",
                  t.enabled ? "bg-mint/50 border-brand/20 text-brand" : "bg-sand/30 border-sand text-taupe line-through"
                )}
              >
                <button
                  onClick={() => toggleBookingType(t.value)}
                  title={t.enabled ? "Click to hide from New Booking" : "Click to show on New Booking"}
                >
                  {t.value}
                </button>
                <button
                  onClick={() => removeBookingType(t.value)}
                  className="text-taupe hover:text-red-600"
                  title="Delete permanently"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Booking locations */}
      <div className="mb-5">
        <Label className="mb-1.5 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Booking locations
        </Label>
        <p className="text-[11px] text-taupe mb-2">
          Offered as quick picks on New Booking. Members can still choose "Others" and type
          any custom place — the dispatcher gets the exact details. Toggle one off to hide it
          without losing it — it stays here, just unpublished.
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
          <Button size="sm" variant="primary" onClick={addLocation} className="flex-none">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        {draftLocations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draftLocations.map((l) => (
              <span
                key={l.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border",
                  l.enabled ? "bg-mint/50 border-brand/20 text-brand" : "bg-sand/30 border-sand text-taupe line-through"
                )}
              >
                <button
                  onClick={() => toggleLocation(l.name)}
                  title={l.enabled ? "Click to hide from New Booking" : "Click to show on New Booking"}
                >
                  {l.name}
                </button>
                <span className="text-[10px] text-taupe no-underline">
                  {l.kind === "pickup" ? "pickup" : l.kind === "dropoff" ? "drop-off" : "both"}
                </span>
                <button
                  onClick={() => removeLocation(l.name)}
                  className="text-taupe hover:text-red-600"
                  title="Delete permanently"
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
                value={localTerms[role] || ""}
                onChange={(e) => setTerm(role, e.target.value)}
                placeholder={role}
              />
            </div>
          ))}
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-taupe mt-2" />}
      </div>
    </div>
  );
}
