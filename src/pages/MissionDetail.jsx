import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  Navigation,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react";
import dayjs from "dayjs";
import { themeColors } from "../lib/theme";
import { setMissionContext, onOdoValue } from "../lib/voice";
import { api, auth, integrations, isOnline, enqueueAction } from "../lib/db";
import { cn, STATUS_STYLES } from "../lib/utils";
import { Button, Spinner, Textarea, Select, Label } from "../components/ui";
import { useToast } from "../components/Layout";
import { useOrgLogo } from "../lib/orgLogo";

// Incident Reporting (0038, plan-gated per org) — grouped like a real fleet
// incident intake form, not a flat list. "Other" opens a free-text box
// instead of forcing a detail into an unrelated category.
const INCIDENT_GROUPS = [
  { label: "Collision & Accidents", options: [
    "Minor Collision — No Injury / Drivable", "Collision — Vehicle Damage Only",
    "Collision — With Injury", "Collision — Third-Party Vehicle",
    "Collision — Fixed Object (Gate/Wall/Post)", "Rear-Ended / Struck from Behind",
    "Side-Swipe / Grazing", "Hit-and-Run — Other Party Left Scene", "Rollover / Overturn",
  ]},
  { label: "Mechanical & Vehicle Fault", options: [
    "Flat Tire / Puncture", "Tire Blowout", "Battery / Low Voltage / Won't Start",
    "Engine Stalling / Cut Out", "Engine Overheating", "Brake Issue — Squeal / Drag / Warning",
    "Brake Failure — Loss of Pressure", "Alternator / Charging System Fault",
    "Transmission / Gearbox Fault", "Fuel Leak / Fuel System Fault",
    "Electrical / Wiring / Light Fault", "Suspension / Steering Fault",
    "Radiator / Coolant Leak", "Dashboard Warning Light On",
  ]},
  { label: "Fuel & Metering", options: [
    "Low Fuel / Fuel Level Warning", "Fuel Discrepancy — Logged vs Actual Differ",
    "Suspected Fuel Theft / Siphoning", "Poor Mileage / Higher Consumption", "Wrong Fuel Type Filled",
  ]},
  { label: "Route, Traffic & Environment", options: [
    "Traffic Delay / Congestion", "Road Blocked — Diversion Taken",
    "Road Hazard — Pothole / Bump Struck", "Flooding / High Water on Route",
    "Weather — Rain / Storm / Fog / Visibility", "Debris / Obstacle on Road",
    "Animal Struck / Wildlife Encounter",
  ]},
  { label: "Passenger & Conduct", options: [
    "Passenger Illness / Medical Concern", "Passenger No-Show — Booking Missed",
    "Late Arrival / Schedule Delay", "Passenger Complaint / Feedback",
    "Dispute / Altercation — Third Party", "Traffic Violation / Citation Issued",
    "Unauthorized Stop / Route Deviation", "Driver Fatigue / Unfit for Duty",
  ]},
  { label: "Cargo, Asset & Property", options: [
    "Luggage / Item Left Behind", "Luggage Shift / Item Damaged", "Window / Glass Damage",
    "Light / Mirror Broken", "Door / Lock / Access Fault", "Fire / Smoke — Vehicle",
    "Lost Property Found / Returned",
  ]},
  { label: "Other", options: ["Other — Please Describe Below"] },
];
const OTHER_INCIDENT = "Other — Please Describe Below";

const ODO_PROMPT =
  "Look at this odometer/dashboard photo and extract ONLY the odometer reading number. " +
  "Return just the numeric value with no text, no units, no commas, no periods for thousands.";

function OdoCapture({ label, onCaptured, existing }) {
  const inputRef = useRef(null);
  const [photo, setPhoto] = useState(existing?.photoUrl || "");
  const [reading, setReading] = useState(existing?.reading ? String(existing.reading) : "");
  const [readingAi, setReadingAi] = useState(false);
  const [manual, setManual] = useState(false);

  // "Odometer 38400" from the voice assistant fills this field
  useEffect(() => onOdoValue((v) => {
    setManual(true);
    setReading(String(v));
  }), []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setManual(false);
    setReadingAi(true);
    setReading("");
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setPhoto(file_url);
      if (isOnline()) {
        const res = await integrations.Core.InvokeLLM({
          kind: "odometer",
          prompt: ODO_PROMPT,
          image_urls: [file_url],
          response_json_schema: { type: "object", properties: { odo_reading: { type: "number" } } },
        });
        setReading(String(res.odo_reading || ""));
      } else {
        setManual(true); // enter manually — offline mode
      }
    } catch (D) {
      console.error("ODO capture failed:", D);
      setManual(true);
    } finally {
      setReadingAi(false);
    }
  };

  const retake = () => {
    setPhoto("");
    setReading("");
    onCaptured(null);
  };

  useEffect(() => {
    // A reading alone (voice-dictated or manual) arms the mission; the photo
    // stays optional so drivers can proceed when the camera isn't available.
    if (reading) onCaptured({ photoUrl: photo, reading: parseFloat(reading), offline: manual, photoless: !photo });
    else onCaptured(null);
  }, [photo, reading]); // eslint-disable-line

  return (
    <div className="bg-white rounded-3xl shadow-card p-4">
      <p className="text-sm font-semibold text-cocoa mb-3">{label}</p>
      {!photo ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-sand rounded-xl py-8 flex flex-col items-center gap-2 text-taupe hover:border-brand/50 hover:text-brand transition-colors"
        >
          <Camera className="w-8 h-8" />
          <span className="text-sm font-medium">Tap to capture odometer</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-lg overflow-hidden border border-sand">
            <img src={photo} alt="Odometer" className="w-full h-48 object-cover" />
            {!readingAi && (
              <button
                onClick={retake}
                className="absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-1.5 shadow"
              >
                <X className="w-4 h-4 text-mocha" />
              </button>
            )}
          </div>
          {readingAi && (
            <div className="flex items-center gap-2 text-sm text-taupe">
              <Loader2 className="w-4 h-4 animate-spin" /> Reading odometer...
            </div>
          )}
          {!readingAi && (
            <div className="space-y-2">
              <label className="text-xs text-taupe flex items-center gap-2">
                ODO Reading {manual && <span className="text-accent-dark">(enter manually — offline mode)</span>}
                {reading && !manual && (
                  <span className="text-[10px] text-brand font-medium bg-mint/60 border border-mintdark rounded-full px-2 py-0.5">
                    AI verified
                  </span>
                )}
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                placeholder="e.g. 38420"
                className="flex h-10 w-full rounded-md border border-sand bg-white px-3 py-2 text-lg font-semibold text-cocoa focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}

// GPS route recorder — mirrors the original's watchPosition collector.
function useRouteTracker() {
  const [recording, setRecording] = useState(false);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState(null);
  const watchRef = useRef(null);
  const ptsRef = useRef([]);

  const start = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported on this device");
      return;
    }
    ptsRef.current = [];
    setPoints([]);
    setError(null);
    setRecording(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: new Date().toISOString() };
        ptsRef.current.push(p);
        setPoints([...ptsRef.current]);
      },
      (err) => {
        setError(err.message);
        setRecording(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const stop = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setRecording(false);
    return ptsRef.current;
  };

  useEffect(() => () => stop(), []);

  return { recording, points, error, start, stop };
}

// Lightweight polyline trace of the recorded GPS points (the original renders
// these on a Leaflet/OpenStreetMap map; SVG keeps the duplicate fully offline).
function RouteMap({ routeCoordinates }) {
  let pts = [];
  try {
    pts = typeof routeCoordinates === "string" ? JSON.parse(routeCoordinates) : routeCoordinates || [];
  } catch {
    pts = [];
  }
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 300, H = 140, PAD = 14;
  const sx = (lng) => PAD + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * PAD);
  const sy = (lat) => H - PAD - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * PAD);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.lng).toFixed(1)},${sy(p.lat).toFixed(1)}`).join(" ");
  return (
    <div className="bg-white rounded-3xl shadow-card p-4">
      <p className="text-sm font-semibold text-cocoa mb-2 flex items-center gap-2">
        <Navigation className="w-4 h-4 text-brand" /> Route Taken
        <span className="text-xs font-normal text-taupe">{pts.length} GPS points</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-mint/40 border border-sand/70">
        <path d={d} fill="none" stroke={themeColors().primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={sx(lngs[0])} cy={sy(lats[0])} r="4" fill="#16a34a" />
        <circle cx={sx(lngs.at(-1))} cy={sy(lats.at(-1))} r="4" fill="#dc2626" />
      </svg>
      <div className="flex justify-between text-[10px] text-taupe mt-1">
        <span>● start</span>
        <span>● end</span>
      </div>
    </div>
  );
}

export default function MissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [request, setRequest] = useState(null);
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startOdo, setStartOdo] = useState(null);
  const [baselineOdo, setBaselineOdo] = useState(null);
  // 0030 vehicle QR binding: resolved vehicle row + today's checklist (from
  // the /v/<token> scan page). vehicle_qr_verified=true means the driver
  // scanned THAT physical vehicle's QR and completed the walk-around.
  const [vehicleId, setVehicleId] = useState(null);
  const [vehicleModel, setVehicleModel] = useState("");
  const [checklistData, setChecklistData] = useState(null);
  const [endOdo, setEndOdo] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tracker = useRouteTracker();
  const orgInfo = useOrgLogo();
  const [me, setMe] = useState(null);
  const [reportingIncident, setReportingIncident] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [incidentDetail, setIncidentDetail] = useState("");
  const [incidentOther, setIncidentOther] = useState("");
  const [submittingIncident, setSubmittingIncident] = useState(false);

  useEffect(() => {
    auth.currentUser().then(setMe).catch(() => {});
  }, []);

  const submitIncident = async () => {
    if (!incidentType) {
      toast({ title: "Pick an incident type first" });
      return;
    }
    // "Other" requires real free text (the type alone says nothing); every
    // other type already names the incident, so an empty detail box just
    // falls back to repeating the type — incidents.detail is NOT NULL.
    const detail = incidentType === OTHER_INCIDENT ? incidentOther.trim() : incidentDetail.trim() || incidentType;
    if (incidentType === OTHER_INCIDENT && !detail) {
      toast({ title: "Describe the incident before submitting" });
      return;
    }
    setSubmittingIncident(true);
    try {
      await api.entities.IncidentLog.create({
        type: incidentType,
        detail,
        mission_id: request.mission_id,
        vehicle_plate: request.vehicle_plate || "",
        reported_by: me?.full_name || "Staff",
        source: "manual",
      });
      toast({ title: "Incident reported", description: "Logged for this mission." });
      setIncidentType("");
      setIncidentDetail("");
      setIncidentOther("");
      setReportingIncident(false);
    } catch (e) {
      toast({ title: "Couldn't report incident", description: e.message });
    } finally {
      setSubmittingIncident(false);
    }
  };

  // expose start/end to the voice assistant ("start mission" / "end mission")
  useEffect(() => {
    if (!request) return;
    setMissionContext({
      missionId: request.mission_id,
      guest: request.guest_name,
      vehiclePlate: request.vehicle_plate || "",
      status: request.status,
      odoArmed: !!startOdo,
      endArmed: !!endOdo,
      start: () => startMission(),
      end: () => endMission(),
    });
    return () => setMissionContext(null);
  }, [request, startOdo, endOdo, log, remarks]); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.entities.TransportRequest.get(id);
      setRequest(r);
      const logs = await api.entities.MileageLog.filter({ request_id: id });
      if (logs.length > 0) {
        setLog(logs[0]);
        setRemarks(logs[0].remarks || "");
      }
      // Resolves the assigned vehicle's row — always, not just pre-start,
      // since the car model is needed for the "CAR - Plate Number" display
      // on completed missions too.
      if (r?.vehicle_plate) {
        try {
          const vehicles = await api.entities.Vehicle.filter({ plate_number: r.vehicle_plate });
          if (vehicles[0]) {
            setVehicleId(vehicles[0].id);
            setVehicleModel(vehicles[0].model || vehicles[0].unit_name || "");
            // Baseline ODO suggestion + QR checklist binding only matter
            // before the mission has started.
            if (!logs.length) {
              if (vehicles[0].start_odometer_km != null) {
                setBaselineOdo(vehicles[0].start_odometer_km);
              }
              const cl = sessionStorage.getItem(`ff:checklist:${vehicles[0].id}`);
              if (cl) {
                const parsed = JSON.parse(cl);
                // Valid for the working day — a morning walk-around covers the
                // day's missions in the same vehicle.
                if (Date.now() - parsed.at < 12 * 3600 * 1000 && parsed.answers) {
                  setChecklistData(parsed);
                }
              }
            }
          }
        } catch {
          /* optional field — absence is fine */
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line

  const del = async () => {
    if (!window.confirm(`Delete booking for ${request.guest_name}?`)) return;
    setDeleting(true);
    try {
      if (log?.id) await api.entities.MileageLog.delete(log.id);
      await api.entities.TransportRequest.delete(id);
      toast({ title: "Booking deleted" });
      navigate("/");
    } catch (err) {
      console.error("Failed to delete booking:", err);
      toast({ title: "Error", description: err?.message || "Failed to delete booking." });
    } finally {
      setDeleting(false);
    }
  };

  const startMission = async () => {
    if (!startOdo) {
      toast({
        title: "Capture ODO",
        description: "Please capture the start odometer reading first.",
      });
      return;
    }
    // 0030 pre-mission gate: the driver must have scanned the vehicle QR and
    // completed the walk-around checklist (same vehicle, last 12 hours).
    if (vehicleId && !checklistData) {
      toast({
        title: "Pre-mission checklist required",
        description: "Scan the QR code inside this vehicle and complete the checklist before starting.",
      });
      return;
    }
    setBusy(true);
    try {
      const data = {
        request_id: id,
        mission_id: request.mission_id,
        driver_name: request.assigned_driver_name || "Driver",
        driver_id: request.assigned_driver_id || "",
        vehicle_plate: request.vehicle_plate || "",
        vehicle_id: vehicleId || null,
        vehicle_qr_verified: !!checklistData,
        checklist: checklistData?.answers || null,
        checklist_completed_at: checklistData ? new Date(checklistData.at).toISOString() : null,
        time_out: new Date().toISOString(),
        odo_start_photo: startOdo.photoUrl,
        start_odometer: startOdo.reading,
        guest_name: request.guest_name,
        requester_type: request.requester_type || "Guest",
        department: request.department || "",
        pax_count: request.pax_count,
        booking_type: request.booking_type,
        pickup_location: request.pickup_location,
        destination: request.destination,
      };
      if (isOnline()) {
        const created = await api.entities.MileageLog.create(data);
        setLog(created);
        await api.entities.TransportRequest.update(id, { status: "In Progress" });
        setRequest((r) => ({ ...r, status: "In Progress" }));
        toast({ title: "Mission started!", description: "Drive safely." });
      } else {
        await enqueueAction({ id: `start_${id}_${Date.now()}`, type: "create_mileage_log", id_ref: id, data });
        await enqueueAction({
          id: `req_start_${id}_${Date.now()}`,
          type: "update_request",
          id_ref: id,
          data: { status: "In Progress" },
        });
        setLog({ ...data, id: "pending" });
        setRequest((r) => ({ ...r, status: "In Progress" }));
        toast({ title: "Mission started (offline)", description: "Saved offline. Will sync when back online." });
      }
      tracker.start();
    } catch (err) {
      console.error("Failed to start mission:", err);
      toast({ title: "Error", description: err?.message || "Failed to start mission." });
    } finally {
      setBusy(false);
    }
  };

  const endMission = async () => {
    if (!endOdo) {
      toast({
        title: "Capture ODO",
        description: "Please capture the end odometer reading first.",
      });
      return;
    }
    setBusy(true);
    try {
      const route = tracker.stop();
      const distance = Math.max(0, endOdo.reading - (log?.start_odometer || 0));
      const patch = {
        time_in: new Date().toISOString(),
        odo_end_photo: endOdo.photoUrl,
        end_odometer: endOdo.reading,
        distance,
        remarks,
        status: "Completed",
        route_coordinates: route.length > 0 ? JSON.stringify(route) : "",
      };
      if (isOnline()) {
        if (log?.id && log.id !== "pending") await api.entities.MileageLog.update(log.id, patch);
        else await api.entities.MileageLog.create({ ...(log ?? {}), ...patch, request_id: id });
        await api.entities.TransportRequest.update(id, { status: "Completed" });
        toast({ title: "Mission completed!", description: `Total distance: ${distance > 0 ? distance : 0} km` });
      } else {
        await enqueueAction({
          id: `end_${log?.id || id}_${Date.now()}`,
          type: log?.id === "pending" ? "update_request" : "update_request",
          id_ref: id,
          data: { status: "Completed" },
        });
        toast({
          title: "Mission completed (offline)",
          description: "Saved offline. Will sync when back online.",
        });
      }
      setRequest((r) => ({ ...r, status: "Completed" }));
      navigate("/");
    } catch (err) {
      console.error("Failed to end mission:", err);
      toast({ title: "Error", description: err?.message || "Failed to end mission." });
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="w-6 h-6 text-taupe" />
      </div>
    );
  if (!request)
    return (
      <div className="text-center py-16">
        <p className="text-taupe">Mission not found.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" /> Back to Missions
        </Button>
      </div>
    );

  const done = request.status === "Completed" && log?.end_odometer != null;
  const inProgress = request.status === "In Progress";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <button
          onClick={del}
          disabled={deleting}
          className="text-sand hover:text-red-500 p-2 rounded-lg hover:bg-red-50"
          title="Delete booking"
        >
          {deleting ? <Spinner className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-xl font-heading font-bold text-cocoa">
              Mission {request.mission_id}
            </h1>
            <p className="text-sm text-taupe mt-0.5">
              {request.guest_name}
              {request.requester_type === "Errand" && request.department
                ? ` · Errand — ${request.department}`
                : ` · ${request.pax_count} pax`}{" "}
              · {request.booking_type}
            </p>
          </div>
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full border",
              STATUS_STYLES[request.status] || STATUS_STYLES.Pending
            )}
          >
            {request.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-taupe">Pickup</p>
            <p className="text-mocha">{request.pickup_location || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-taupe">Destination</p>
            <p className="text-mocha">{request.destination || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-taupe">Schedule</p>
            <p className="text-mocha">
              {request.schedule_date ? dayjs(request.schedule_date).format("MMM D, YYYY") : "—"}{" "}
              {request.schedule_time || ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-taupe">Vehicle</p>
            <p className="text-mocha">
              {request.vehicle_plate
                ? vehicleModel
                  ? `${vehicleModel} - ${request.vehicle_plate}`
                  : request.vehicle_plate
                : "Unassigned"}
            </p>
          </div>
          {request.special_notes && (
            <div className="col-span-2">
              <p className="text-xs text-taupe">Special Notes</p>
              <p className="text-mocha">{request.special_notes}</p>
            </div>
          )}
        </div>
      </div>

      {!done && (
        <div className="space-y-4">
          {!inProgress && (
            <OdoCapture
              label={
                baselineOdo != null
                  ? `Start ODO — before the trip (vehicle baseline: ${Number(baselineOdo).toLocaleString()} km)`
                  : "Start ODO — before the trip"
              }
              onCaptured={setStartOdo}
            />
          )}
          {inProgress && (
            <>
              {log?.start_odometer != null && (
                <div className="bg-mint/50 border border-brand/20 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-brand">
                    Started {log.time_out ? dayjs(log.time_out).format("h:mm A, MMM D") : ""}
                  </p>
                  <p>Start ODO: {log.start_odometer} km</p>
                  {tracker.recording && (
                    <p className="text-xs text-brand flex items-center gap-1.5">
                      <Navigation className="w-3 h-3 animate-pulse" /> GPS tracking active —{" "}
                      {tracker.points.length} points
                    </p>
                  )}
                </div>
              )}

              {orgInfo?.incident_reporting_enabled && (
                <div className="bg-white rounded-3xl shadow-card p-4">
                  {!reportingIncident ? (
                    <button
                      onClick={() => setReportingIncident(true)}
                      className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-red-600 hover:underline"
                    >
                      <AlertTriangle className="w-4 h-4" /> Report an Incident
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-cocoa flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600" /> Report an Incident
                        </p>
                        <button
                          onClick={() => setReportingIncident(false)}
                          className="text-taupe hover:text-mocha"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Incident type</Label>
                        <Select value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                          <option value="" disabled>Select incident type…</option>
                          {INCIDENT_GROUPS.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                              {g.options.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      </div>
                      {incidentType === OTHER_INCIDENT ? (
                        <div className="space-y-1.5">
                          <Label>Describe the incident</Label>
                          <Textarea
                            value={incidentOther}
                            onChange={(e) => setIncidentOther(e.target.value)}
                            placeholder="What happened?"
                          />
                        </div>
                      ) : incidentType ? (
                        <div className="space-y-1.5">
                          <Label>Additional details (optional but recommended)</Label>
                          <Textarea
                            value={incidentDetail}
                            onChange={(e) => setIncidentDetail(e.target.value)}
                            placeholder="Location, what happened, anyone involved…"
                          />
                        </div>
                      ) : null}
                      <Button
                        variant="primary"
                        className="w-full"
                        disabled={submittingIncident || !incidentType}
                        onClick={submitIncident}
                      >
                        {submittingIncident ? <Spinner className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        Submit Report
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <OdoCapture label="End ODO — after the trip" onCaptured={setEndOdo} />
              <div className="bg-white rounded-3xl shadow-card p-4">
                <p className="text-sm font-semibold text-cocoa mb-2">Remarks</p>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Traffic, tolls, guest notes…"
                />
              </div>
            </>
          )}

          <Button
            variant="primary"
            className="w-full h-12"
            disabled={busy}
            onClick={inProgress ? endMission : startMission}
          >
            {busy ? (
              <Spinner className="w-5 h-5" />
            ) : inProgress ? (
              <>
                <Square className="w-5 h-5" /> End Mission
              </>
            ) : (
              <>
                <Play className="w-5 h-5" /> Start Mission
              </>
            )}
          </Button>
        </div>
      )}

      {done && log && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl shadow-card p-5 space-y-4">
            <p className="flex items-center gap-2 text-brand font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4" /> Mission completed
            </p>

            {/* Guest — the star of the receipt */}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-taupe">
                {request.requester_type === "Errand" ? "Requested by" : "Guest"}
              </p>
              <p className="text-2xl font-heading font-extrabold text-cocoa leading-tight">
                {request.guest_name}
              </p>
            </div>

            {/* People: booked by + driver */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-mint/40 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wide text-taupe">Booked by</p>
                <p className="text-sm font-semibold text-cocoa mt-0.5">
                  {request.booked_by || request.department || "—"}
                </p>
              </div>
              <div className="bg-mint/40 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wide text-taupe">Driver</p>
                <p className="text-sm font-semibold text-cocoa mt-0.5">
                  {log.driver_name || request.assigned_driver_name || "—"}
                </p>
              </div>
            </div>

            {/* Trip facts */}
            <div className="grid grid-cols-2 gap-2 text-sm text-mocha border-t border-sand/70 pt-3">
              <p>
                Time out: {log.time_out ? dayjs(log.time_out).format("h:mm A, MMM D") : "—"}
              </p>
              <p>
                Time in: {log.time_in ? dayjs(log.time_in).format("h:mm A, MMM D") : "—"}
              </p>
              <p>Start ODO: {Number(log.start_odometer).toLocaleString()} km</p>
              <p>End ODO: {Number(log.end_odometer).toLocaleString()} km</p>
              {request.vehicle_plate && (
                <p>Vehicle: {vehicleModel ? `${vehicleModel} - ${request.vehicle_plate}` : request.vehicle_plate}</p>
              )}
              {request.requester_type === "Errand" && request.department && (
                <p>Department: {request.department}</p>
              )}
            </div>
            <p className="text-2xl font-bold text-brand">
              {log.distance} km total
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {log.odo_start_photo && (
              <img src={log.odo_start_photo} alt="Start ODO" className="rounded-lg border border-brand/30 w-full h-24 object-cover" />
            )}
            {log.odo_end_photo && (
              <img src={log.odo_end_photo} alt="End ODO" className="rounded-lg border border-brand/30 w-full h-24 object-cover" />
            )}
          </div>
          {log.remarks && (
            <div className="bg-white rounded-3xl shadow-card p-4">
              <p className="text-xs text-taupe mb-1">Remarks</p>
              <p className="text-sm text-mocha">{log.remarks}</p>
            </div>
          )}
          {log.route_coordinates && <RouteMap routeCoordinates={log.route_coordinates} />}
        </div>
      )}
    </div>
  );
}
