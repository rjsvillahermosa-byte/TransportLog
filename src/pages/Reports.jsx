import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import dayjs from "../lib/day";
import {
  FileBarChart2,
  FileDown,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/db";
import { computeRenewal } from "../lib/pms";
import { getBranding } from "../lib/branding";
import { Button, Input, Label, Select } from "../components/ui";
import { useToast } from "../components/Layout";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Custom Report Builder — Supervisor/Admin tool.
// Pick a dataset, filter it, choose columns, preview, then print to a local
// printer or save as PDF (both go through the browser's print dialog — the
// PDF destination renders the exact same sheet).
// ---------------------------------------------------------------------------

const KIND_OF = (r) =>
  r.requester_type === "Errand" ? `Errand · ${r.department || "Internal"}` : r.booking_type;

const DATASETS = {
  missions: {
    label: "Missions & Bookings",
    entity: "TransportRequest",
    sort: "-schedule_date",
    dated: true,
    columns: [
      ["schedule_date", "Date"], ["schedule_time", "Time"], ["mission_id", "Mission #"],
      ["name", "Guest / Requested by"], ["kind", "Type"], ["department", "Department"],
      ["pickup_location", "Pickup"], ["destination", "Destination"], ["vehicle_plate", "Vehicle"],
      ["assigned_driver_name", "Driver"], ["pax_count", "Pax"], ["status", "Status"],
    ],
    defaults: ["schedule_date", "schedule_time", "mission_id", "name", "kind", "vehicle_plate", "assigned_driver_name", "status"],
    filters: ["range", "status", "kind", "vehicle"],
  },
  trips: {
    label: "Trip Logs & Mileage",
    entity: "MileageLog",
    sort: "-time_out",
    dated: true,
    columns: [
      ["date", "Date"], ["mission_id", "Mission #"], ["driver_name", "Driver"],
      ["vehicle_plate", "Vehicle"], ["guest_name", "Guest"], ["route", "Route"],
      ["start_odometer", "Start ODO"], ["end_odometer", "End ODO"], ["distance", "Km"],
      ["remarks", "Remarks"],
    ],
    defaults: ["date", "mission_id", "driver_name", "vehicle_plate", "guest_name", "route", "distance"],
    filters: ["range", "vehicle"],
    sums: { distance: "Total km" },
  },
  incidents: {
    label: "Incident Log",
    entity: "IncidentLog",
    sort: "-created_date",
    dated: true,
    columns: [
      ["date", "Date"], ["time", "Time"], ["type", "Type"], ["detail", "Details"],
      ["vehicle_plate", "Vehicle"], ["reported_by", "Reported by"], ["source", "Channel"],
    ],
    defaults: ["date", "time", "type", "detail", "vehicle_plate", "reported_by"],
    filters: ["range", "vehicle"],
  },
  fuel: {
    label: "Fuel Fill-ups",
    entity: "FuelLog",
    sort: "-fill_date",
    dated: true,
    columns: [
      ["fill_date", "Date"], ["vehicle_plate", "Vehicle"], ["odometer", "Odometer"],
      ["liters", "Liters"], ["cost", "Cost ₱"], ["price_per_l", "₱/L"],
      ["station", "Station"], ["full_tank", "Full tank"],
    ],
    defaults: ["fill_date", "vehicle_plate", "odometer", "liters", "cost", "price_per_l", "station"],
    filters: ["range", "vehicle"],
    sums: { liters: "Total liters", cost: "Total ₱" },
  },
  services: {
    label: "Service & PMS Records",
    entity: "ServiceLog",
    sort: "-service_date",
    dated: true,
    columns: [
      ["service_date", "Date"], ["vehicle_plate", "Vehicle"], ["service_type", "Type"],
      ["odometer_at_service", "Odometer"], ["service_provider", "Provider"],
      ["cost", "Cost ₱"], ["next_service_km", "Next (km)"], ["source", "Source"],
    ],
    defaults: ["service_date", "vehicle_plate", "service_type", "odometer_at_service", "service_provider", "cost"],
    filters: ["range", "vehicle"],
    sums: { cost: "Total ₱" },
  },
  vehicles: {
    label: "Vehicle Registry",
    entity: "Vehicle",
    sort: "plate_number",
    dated: false,
    columns: [
      ["plate_number", "Plate"], ["model", "Model"], ["unit_name", "Unit"],
      ["fuel_type", "Fuel"], ["tank_liters", "Tank L"], ["rated_km_per_liter", "Rated km/L"],
      ["pms_interval_km", "PMS km"], ["pms_interval_months", "PMS mo"], ["status", "Status"],
    ],
    defaults: ["plate_number", "model", "unit_name", "fuel_type", "pms_interval_km", "pms_interval_months", "status"],
    filters: [],
  },
  drivers: {
    label: "Drivers & Compliance",
    entity: "Driver",
    sort: "full_name",
    dated: false,
    columns: [
      ["full_name", "Driver"], ["employee_id", "Employee ID"], ["contact_number", "Contact"],
      ["license_number", "License #"], ["license_expiry", "License expiry"],
      ["license_status", "License status"], ["assigned_vehicle_plate", "Vehicle"], ["status", "Status"],
    ],
    defaults: ["full_name", "employee_id", "contact_number", "license_number", "license_expiry", "license_status"],
    filters: [],
  },
};

function buildRow(dsKey, r) {
  if (dsKey === "missions")
    return {
      schedule_date: r.schedule_date ? dayjs(r.schedule_date).format("MMM D, YYYY") : "—",
      schedule_time: r.schedule_time || "—",
      mission_id: r.mission_id,
      name: r.requester_type === "Errand" ? r.requested_by || r.guest_name : r.guest_name,
      kind: KIND_OF(r),
      department: r.department || "—",
      pickup_location: r.pickup_location || "—",
      destination: r.destination || "—",
      vehicle_plate: r.vehicle_plate || "Unassigned",
      assigned_driver_name: r.assigned_driver_name || "Unassigned",
      pax_count: r.pax_count,
      status: r.status,
    };
  if (dsKey === "trips")
    return {
      date: r.time_out ? dayjs(r.time_out).format("MMM D, YYYY") : "—",
      mission_id: r.mission_id,
      driver_name: r.driver_name || "—",
      vehicle_plate: r.vehicle_plate || "—",
      guest_name: r.guest_name || "—",
      route: `${r.pickup_location || "—"} → ${r.destination || "—"}`,
      start_odometer: r.start_odometer != null ? Number(r.start_odometer).toLocaleString() : "—",
      end_odometer: r.end_odometer != null ? Number(r.end_odometer).toLocaleString() : "—",
      distance: r.distance ?? "—",
      remarks: r.remarks || "",
    };
  if (dsKey === "incidents") {
    const d = r.created_date ? new Date(r.created_date) : null;
    return {
      date: d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
      time: d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—",
      type: r.type,
      detail: r.detail,
      vehicle_plate: r.vehicle_plate || "—",
      reported_by: r.reported_by || "—",
      source: r.source === "voice" ? "Voice" : "Manual",
    };
  }
  if (dsKey === "fuel")
    return {
      fill_date: r.fill_date ? dayjs(r.fill_date).format("MMM D, YYYY") : "—",
      vehicle_plate: r.vehicle_plate,
      odometer: Number(r.odometer).toLocaleString(),
      liters: Number(r.liters).toFixed(1),
      cost: Number(r.cost).toLocaleString(),
      price_per_l: r.liters > 0 ? (Number(r.cost) / Number(r.liters)).toFixed(2) : "—",
      station: r.station || "—",
      full_tank: r.full_tank ? "Yes" : "Partial",
    };
  if (dsKey === "services")
    return {
      service_date: r.service_date ? dayjs(r.service_date).format("MMM D, YYYY") : "—",
      vehicle_plate: r.vehicle_plate,
      service_type: r.service_type,
      odometer_at_service: r.odometer_at_service != null ? Number(r.odometer_at_service).toLocaleString() : "—",
      service_provider: r.service_provider || "—",
      cost: r.cost != null ? Number(r.cost).toLocaleString() : "—",
      next_service_km: r.next_service_km ? Number(r.next_service_km).toLocaleString() : "—",
      source: r.source === "ocr" ? "OCR (casa report)" : "Manual",
    };
  if (dsKey === "vehicles")
    return {
      plate_number: r.plate_number,
      model: r.model || "—",
      unit_name: r.unit_name || "—",
      fuel_type: r.fuel_type,
      tank_liters: r.tank_liters,
      rated_km_per_liter: r.rated_km_per_liter,
      pms_interval_km: Number(r.pms_interval_km || 0).toLocaleString(),
      pms_interval_months: r.pms_interval_months,
      status: r.status,
    };
  if (dsKey === "drivers") {
    const lic = computeRenewal(r.license_expiry);
    return {
      full_name: r.full_name,
      employee_id: r.employee_id || "—",
      contact_number: r.contact_number || "—",
      license_number: r.license_number || "—",
      license_expiry: r.license_expiry ? dayjs(r.license_expiry).format("MMM D, YYYY") : "—",
      license_status: lic ? lic.message : "n/a",
      assigned_vehicle_plate: r.assigned_vehicle_plate || "—",
      status: r.status,
    };
  }
  return {};
}

const SAVED_KEY = "fleetflow:reports";
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
  } catch {
    return [];
  }
};

export default function Reports({ user }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [dsKey, setDsKey] = useState("missions");
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [vehicle, setVehicle] = useState("all");
  const [cols, setCols] = useState(DATASETS.missions.defaults);
  const [title, setTitle] = useState("Custom Report");
  const [totals, setTotals] = useState(true);
  const [landscape, setLandscape] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [saved, setSaved] = useState(loadSaved());
  const [saveName, setSaveName] = useState("");

  const ds = DATASETS[dsKey];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.entities[ds.entity].list(ds.sort, 1000);
        setRows(data);
        if (!vehicles.length) setVehicles(await api.entities.Vehicle.list());
      } finally {
        setLoading(false);
      }
    })();
  }, [dsKey]); // eslint-disable-line

  const switchDataset = (key) => {
    setDsKey(key);
    setCols(DATASETS[key].defaults);
    setStatus("all");
    setKind("all");
    setVehicle("all");
  };

  const filtered = useMemo(() => {
    let out = rows;
    if (ds.dated) {
      const start = dayjs(from).startOf("day");
      const end = dayjs(to).endOf("day");
      out = out.filter((r) => {
        const d =
          r.schedule_date || r.time_out || r.created_date || r.fill_date || r.service_date;
        return d && dayjs(d).isBetween(start, end, "day", "[]");
      });
    }
    if (ds.filters.includes("status") && status !== "all")
      out = out.filter((r) => r.status === status);
    if (ds.filters.includes("kind") && kind !== "all")
      out = out.filter((r) => (kind === "errand" ? r.requester_type === "Errand" : r.requester_type !== "Errand"));
    if (ds.filters.includes("vehicle") && vehicle !== "all")
      out = out.filter((r) => r.vehicle_plate === vehicle);
    return out;
  }, [rows, ds, from, to, status, kind, vehicle]);

  const tableRows = useMemo(
    () => filtered.map((r) => buildRow(dsKey, r)),
    [filtered, dsKey]
  );

  const sums = useMemo(() => {
    if (!ds.sums) return null;
    const out = {};
    Object.keys(ds.sums).forEach((k) => {
      out[k] = tableRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    });
    return out;
  }, [tableRows, ds]);

  const visibleCols = ds.columns.filter(([key]) => cols.includes(key));

  // ---------------- saved reports ----------------
  const saveConfig = () => {
    const name = saveName.trim() || `${ds.label} — ${dayjs(from).format("MMM D")} to ${dayjs(to).format("MMM D")}`;
    const rec = {
      id: Date.now().toString(36),
      name,
      config: { dsKey, from, to, status, kind, vehicle, cols, title, totals, landscape },
      created: new Date().toISOString(),
      by: user?.full_name,
    };
    const next = [rec, ...loadSaved()].slice(0, 20);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setSaved(next);
    setSaveName("");
    toast({ title: "Report saved", description: `“${name}” can be re-run anytime.` });
  };
  const runSaved = (rec) => {
    const c = rec.config;
    setDsKey(c.dsKey);
    setCols(c.cols);
    setTitle(c.title);
    setTotals(c.totals);
    setLandscape(c.landscape);
    setFrom(c.from);
    setTo(c.to);
    setStatus(c.status || "all");
    setKind(c.kind || "all");
    setVehicle(c.vehicle || "all");
    toast({ title: "Report loaded", description: rec.name });
  };
  const deleteSaved = (rec) => {
    if (!window.confirm(`Delete saved report “${rec.name}”?`)) return;
    const next = loadSaved().filter((x) => x.id !== rec.id);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setSaved(next);
  };

  // ---------------- print ----------------
  const openSheet = () => setSheet(true);
  const doPrint = () => window.print();
  const doPdf = () => {
    toast({
      title: "Choose “Save as PDF”",
      description: "In the print dialog, pick “Save as PDF” as the destination.",
    });
    setTimeout(() => window.print(), 350);
  };

  const generatedAt = dayjs().format("MMM D, YYYY · h:mm A");
  const brandName = getBranding().name;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">Custom Reports</h1>
          <p className="text-sm text-taupe mt-1">
            Build, preview, then print or save as PDF — Supervisor tools
          </p>
        </div>
        <Button variant="primary" onClick={openSheet} disabled={loading || tableRows.length === 0}>
          <Printer className="w-4 h-4" /> Print / PDF Preview
        </Button>
      </div>

      {/* dataset picker */}
      <div className="bg-white rounded-3xl shadow-card p-5 mb-5">
        <Label className="text-xs">Step 1 — Choose data</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-2">
          {Object.entries(DATASETS).map(([key, d]) => (
            <button
              key={key}
              onClick={() => switchDataset(key)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-xs font-semibold text-left transition-all",
                dsKey === key
                  ? "border-brand bg-brand/10 text-brand shadow-sm"
                  : "border-sand text-mocha hover:bg-mint/40"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* filters */}
        <div className="mt-4 pt-4 border-t border-sand/70">
          <Label className="text-xs">Step 2 — Filters</Label>
          <div className="flex flex-wrap items-end gap-3 mt-2">
            {ds.dated && (
              <>
                <div>
                  <Label className="text-[11px] text-taupe">From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
                </div>
                <div>
                  <Label className="text-[11px] text-taupe">To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
                </div>
              </>
            )}
            {ds.filters.includes("status") && (
              <div>
                <Label className="text-[11px] text-taupe">Status</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-36">
                  <option value="all">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </Select>
              </div>
            )}
            {ds.filters.includes("kind") && (
              <div>
                <Label className="text-[11px] text-taupe">Kind</Label>
                <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-36">
                  <option value="all">All requests</option>
                  <option value="guest">Guests only</option>
                  <option value="errand">Errands only</option>
                </Select>
              </div>
            )}
            {ds.filters.includes("vehicle") && (
              <div>
                <Label className="text-[11px] text-taupe">Vehicle</Label>
                <Select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-9 w-44">
                  <option value="all">All vehicles</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.plate_number}>
                      {v.plate_number}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <p className="text-xs text-taupe ml-auto">
              {loading ? "Loading…" : `${filtered.length} matching record${filtered.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {/* columns */}
        <div className="mt-4 pt-4 border-t border-sand/70">
          <Label className="text-xs">Step 3 — Columns</Label>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {ds.columns.map(([key, label]) => {
              const on = cols.includes(key);
              return (
                <button
                  key={key}
                  onClick={() =>
                    setCols((c) => (on ? c.filter((x) => x !== key) : [...c, key]))
                  }
                  className={cn(
                    "text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors",
                    on
                      ? "bg-brand text-white border-brand"
                      : "bg-mint/40 text-taupe border-transparent hover:bg-mint/70"
                  )}
                >
                  {on ? "✓ " : "+ "}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* options + save */}
        <div className="mt-4 pt-4 border-t border-sand/70 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-[11px] text-taupe">Report title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px] text-taupe">Orientation</Label>
            <Select value={landscape ? "L" : "P"} onChange={(e) => setLandscape(e.target.value === "L")} className="h-9 w-32 mt-1">
              <option value="P">Portrait</option>
              <option value="L">Landscape</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-mocha pb-2">
            <input type="checkbox" checked={totals} onChange={(e) => setTotals(e.target.checked)} className="w-4 h-4" />
            Totals row
          </label>
          <div className="flex items-end gap-2 ml-auto">
            <div>
              <Label className="text-[11px] text-taupe">Save this setup</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Weekly incidents"
                className="h-9 w-44 mt-1"
              />
            </div>
            <Button variant="outline" size="sm" className="mb-0.5" onClick={saveConfig}>
              <Save className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
        </div>
      </div>

      {/* saved reports */}
      {saved.length > 0 && (
        <div className="bg-white rounded-3xl shadow-card p-5 mb-5">
          <h3 className="text-sm font-semibold text-cocoa mb-3">Saved Reports</h3>
          <div className="space-y-2">
            {saved.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between gap-3 bg-mint/30 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-cocoa truncate">{rec.name}</p>
                  <p className="text-[11px] text-taupe">
                    {DATASETS[rec.config.dsKey]?.label} · saved {dayjs(rec.created).format("MMM D")} {rec.by ? `by ${rec.by}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-none">
                  <Button size="sm" variant="primary" onClick={() => runSaved(rec)}>
                    Run
                  </Button>
                  <button onClick={() => deleteSaved(rec)} className="text-taupe hover:text-red-500 p-1.5">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* on-screen preview */}
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="text-sm font-semibold text-cocoa mb-3 flex items-center gap-2">
          <FileBarChart2 className="w-4 h-4 text-brand" /> Preview
        </h3>
        {loading ? (
          <p className="text-sm text-taupe py-6 text-center">Loading data…</p>
        ) : tableRows.length === 0 ? (
          <p className="text-sm text-taupe py-6 text-center">
            No records match these filters. Widen the date range or clear a filter.
          </p>
        ) : (
          <ReportTable
            cols={visibleCols}
            rows={tableRows}
            sums={totals ? sums : null}
            sumLabels={ds.sums}
          />
        )}
      </div>

      {/* print sheet (portal — prints independently of the app chrome) */}
      {sheet &&
        createPortal(
          <div className="report-sheet">
            <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }`}</style>
            <div className="report-toolbar">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-cocoa">
                  Print preview — choose a local printer, or “Save as PDF” as the destination.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setSheet(false)} className="rbtn rbtn-ghost">
                    <X className="w-4 h-4" /> Close
                  </button>
                  <button onClick={doPdf} className="rbtn rbtn-outline">
                    <FileDown className="w-4 h-4" /> Save as PDF
                  </button>
                  <button onClick={doPrint} className="rbtn rbtn-primary">
                    <Printer className="w-4 h-4" /> Print
                  </button>
                </div>
              </div>
            </div>

            <div className="report-body">
              <div className="rp-head">
                <div className="rp-brand">
                  <span className="rp-dot" />
                  {brandName}
                </div>
                <h1 className="rp-title">{title}</h1>
                <p className="rp-sub">
                  {ds.label}
                  {ds.dated ? ` · ${dayjs(from).format("MMM D, YYYY")} to ${dayjs(to).format("MMM D, YYYY")}` : ""}
                  {` · ${tableRows.length} record${tableRows.length === 1 ? "" : "s"}`}
                </p>
              </div>

              <ReportTable
                cols={visibleCols}
                rows={tableRows}
                sums={totals ? sums : null}
                sumLabels={ds.sums}
                print
              />

              <div className="rp-foot">
                Generated by {brandName} · {user?.full_name || "Supervisor"} · {generatedAt}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ---------------- shared table ----------------
function ReportTable({ cols, rows, sums, sumLabels, print = false }) {
  return (
    <div className={cn("overflow-x-auto", print ? "rp-table-wrap" : "rounded-xl border border-sand/70")}>
      <table className={print ? "rp-table" : "w-full text-sm"}>
        <thead>
          <tr className={print ? "" : "bg-mint/40"}>
            {cols.map(([key, label]) => (
              <th key={key} className={print ? "" : "px-3 py-2 text-left text-[11px] font-bold text-mocha uppercase tracking-wide whitespace-nowrap"}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={print ? "" : "border-t border-sand/70"}>
              {cols.map(([key]) => (
                <td key={key} className={print ? "" : "px-3 py-2 text-mocha"}>
                  {r[key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
          {sums && (
            <tr className={print ? "rp-total" : "border-t-2 border-brand/40 bg-mint/30 font-bold"}>
              {cols.map(([key], ci) => {
                if (ci === 0)
                  return (
                    <td key={key} className={print ? "" : "px-3 py-2 text-cocoa"}>
                      TOTAL
                    </td>
                  );
                const v = sums[key];
                return (
                  <td key={key} className={print ? "" : "px-3 py-2 text-cocoa"}>
                    {v != null
                      ? `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}${sumLabels?.[key]?.includes("km") ? " km" : sumLabels?.[key]?.includes("₱") ? " ₱" : ""}`
                      : ""}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
