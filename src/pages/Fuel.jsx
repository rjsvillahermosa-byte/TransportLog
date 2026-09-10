import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Fuel as FuelIcon,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import dayjs from "../lib/day";
import { themeColors } from "../lib/theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/db";
import { auditFuel, getFuelConfig, scoreStyle, severityStyle } from "../lib/fuel";
import { Button, EmptyState, Input, Label, Modal, Select, Spinner } from "../components/ui";
import { useToast } from "../components/Layout";
import { cn } from "../lib/utils";

const pieColors = () => {
  const t = themeColors();
  return [t.primary, t.accent, "#B4552D", "#B9D4C4", "#8A8378", "#C0392B", "#D9A441"];
};

// ---------------------------------------------------------------------------
// Log fill-up modal
// ---------------------------------------------------------------------------
function LogFillModal({ open, onClose, vehicles, onSaved }) {
  const [form, setForm] = useState({
    vehicle_plate: "",
    fill_date: dayjs().format("YYYY-MM-DD"),
    odometer: "",
    liters: "",
    cost: "",
    full_tank: true,
    station: "",
  });
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState("");
  const fileRef = useRef(null);
  const toast = useToast();

  const cfg = getFuelConfig();
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const pricePerL =
    Number(form.liters) > 0 && Number(form.cost) > 0 ? Number(form.cost) / Number(form.liters) : 0;
  const veh = vehicles.find((v) => v.plate_number === form.vehicle_plate);
  const band = veh ? cfg[veh.fuel_type] : null;
  const priceOk = band ? pricePerL >= band.min && pricePerL <= band.max : true;

  const pickVehicle = async (plate) => {
    setForm((f) => ({ ...f, vehicle_plate: plate, odometer: "" }));
    if (!plate) return;
    const fills = await api.entities.FuelLog.list("-fill_date", 500);
    const last = fills.filter((x) => x.vehicle_plate === plate).sort((a, b) => b.odometer - a.odometer)[0];
    // Suggest the last odometer, but never overwrite a value the user already typed
    if (last) setForm((f) => (f.odometer === "" ? { ...f, odometer: String(last.odometer) } : f));
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => setPhoto(fr.result);
    fr.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.vehicle_plate || !form.odometer || !form.liters || !form.cost) return;
    setBusy(true);
    try {
      await api.entities.FuelLog.create({
        ...form,
        odometer: Number(form.odometer),
        liters: Number(form.liters),
        cost: Number(form.cost),
        receipt_photo: photo,
        encoded_by: "Front Office",
      });
      setBusy(false);
      toast({ title: "Fill-up logged", description: "Consumption audit will update instantly." });
      onSaved();
    } catch {
      setBusy(false);
      toast({ title: "Error", description: "Failed to log fill-up." });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Fill-up">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Vehicle *</Label>
          <Select value={form.vehicle_plate} onChange={(e) => pickVehicle(e.target.value)}>
            <option value="">Select vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.plate_number}>
                {v.plate_number} — {v.model || v.unit_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date *</Label>
          <Input type="date" value={form.fill_date} onChange={set("fill_date")} />
        </div>
        <div className="space-y-1.5">
          <Label>Odometer (km) *</Label>
          <Input type="number" value={form.odometer} onChange={set("odometer")} placeholder="e.g. 38420" />
        </div>
        <div className="space-y-1.5">
          <Label>Liters *</Label>
          <Input type="number" step="0.1" value={form.liters} onChange={set("liters")} placeholder="e.g. 42.5" />
        </div>
        <div className="space-y-1.5">
          <Label>Total Cost (₱) *</Label>
          <Input type="number" step="0.01" value={form.cost} onChange={set("cost")} placeholder="e.g. 3900" />
        </div>
        {pricePerL > 0 && (
          <div className="col-span-2">
            <p className={cn("text-xs", priceOk ? "text-brand" : "text-red-600")}>
              ₱{pricePerL.toFixed(2)}/L{" "}
              {priceOk
                ? `— within the ${veh?.fuel_type} band (₱${band?.min}–${band?.max}/L) ✓`
                : `— OUTSIDE the ${veh?.fuel_type} band (₱${band?.min}–₱${band?.max}/L); this fill will be flagged ⚠`}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Station</Label>
          <Input value={form.station} onChange={set("station")} placeholder="Shell EDSA" />
        </div>
        <div className="space-y-1.5 flex items-end">
          <label className="flex items-center gap-2 text-sm text-mocha pb-2">
            <input type="checkbox" checked={form.full_tank} onChange={set("full_tank")} className="w-4 h-4" />
            Full tank
          </label>
        </div>
        <div className="col-span-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
          {photo ? (
            <div className="relative">
              <img src={photo} alt="Receipt" className="w-full h-36 object-cover rounded-lg border border-sand" />
              <button
                onClick={() => setPhoto("")}
                className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow"
              >
                <X className="w-4 h-4 text-mocha" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-sand rounded-lg py-3 text-sm text-taupe hover:border-brand/50 hover:text-brand flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Attach receipt photo (optional)
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>
          {busy && <Spinner className="w-4 h-4" />} Save Fill-up
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function FlagCard({ audit }) {
  const [open, setOpen] = useState(false);
  const { fill, flags } = audit;
  const worst = flags.some((f) => f.severity === "red") ? "red" : "amber";
  return (
    <div className="bg-white rounded-3xl shadow-card overflow-hidden">
      <button className="w-full p-4 text-left flex items-start justify-between gap-3" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className={cn("w-5 h-5 flex-none mt-0.5", worst === "red" ? "text-red-500" : "text-accent-dark")} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cocoa">
              {dayjs(fill.fill_date).format("MMM D, YYYY")} · {Number(fill.odometer).toLocaleString()} km
            </p>
            <p className="text-xs text-taupe truncate">
              {Number(fill.liters).toFixed(1)} L · ₱{Number(fill.cost).toLocaleString()} · {fill.station || "—"}
            </p>
          </div>
        </div>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border flex-none", severityStyle(worst).chip)}>
          {flags.length} flag{flags.length > 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="border-t border-sand/70 px-4 py-3 space-y-3 bg-mint/40/60">
          {flags.map((f, i) => {
            const st = severityStyle(f.severity);
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className={cn("w-2 h-2 rounded-full mt-1.5 flex-none", st.dot)} />
                <div>
                  <p className="text-sm font-medium text-cocoa">{f.title}</p>
                  <p className="text-xs text-taupe mt-0.5 leading-relaxed">{f.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, sub, tone }) {
  const tones = {
    blue: "text-brand",
    green: "text-brand",
    red: "text-red-600",
    slate: "text-cocoa",
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-4">
      <p className={cn("text-2xl font-bold", tones[tone] || tones.slate)}>{value}</p>
      <p className="text-sm font-medium text-mocha">{label}</p>
      <p className="text-xs text-taupe">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company (fleet) summary view
// ---------------------------------------------------------------------------
function CompanySummary({ audit, fills, onSelectVehicle }) {
  const spendAll = fills.reduce((s, f) => s + (Number(f.cost) || 0), 0);
  const litersAll = fills.reduce((s, f) => s + (Number(f.liters) || 0), 0);
  const spend30d = fills
    .filter((f) => dayjs(f.fill_date).isAfter(dayjs().subtract(30, "day")))
    .reduce((s, f) => s + (Number(f.cost) || 0), 0);
  const auditedKm = audit.segments.reduce((s, x) => s + x.km, 0);
  const fleetAvgKmpl = audit.segments.length
    ? audit.segments.reduce((s, x) => s + x.kmpl, 0) / audit.segments.length
    : 0;
  const costPerKm = auditedKm > 0 ? spendAll / auditedKm : 0;
  const avgPrice = litersAll > 0 ? spendAll / litersAll : 0;

  // last 6 months spend trend
  const monthly = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, "month");
      const cost = fills
        .filter((f) => dayjs(f.fill_date).format("YYYY-MM") === m.format("YYYY-MM"))
        .reduce((s, f) => s + (Number(f.cost) || 0), 0);
      months.push({ month: m.format("MMM"), cost: Math.round(cost) });
    }
    return months;
  }, [fills]);

  // expense share per vehicle
  const share = audit.vehicleSummaries
    .map((s) => ({ plate: s.vehicle_plate, cost: Math.round(s.totalSpend) }))
    .filter((x) => x.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const shareTotal = share.reduce((s, x) => s + x.cost, 0);

  const redCount = audit.fillAudits.filter((a) => a.flags.some((f) => f.severity === "red")).length;
  const flaggedCount = audit.fillAudits.filter((a) => a.flags.length > 0).length;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat
          value={`₱${Math.round(spendAll).toLocaleString()}`}
          label="Total fuel expense"
          sub={`₱${Math.round(spend30d).toLocaleString()} in the last 30 days`}
          tone="slate"
        />
        <Stat
          value={`${litersAll.toFixed(0)} L`}
          label="Total liters"
          sub={`avg ₱${avgPrice.toFixed(2)}/L paid`}
          tone="blue"
        />
        <Stat
          value={fleetAvgKmpl ? fleetAvgKmpl.toFixed(1) : "—"}
          label="Fleet avg km/L"
          sub={`${auditedKm.toLocaleString()} audited km`}
          tone="green"
        />
        <Stat
          value={costPerKm ? `₱${costPerKm.toFixed(2)}` : "—"}
          label="Cost per km (fleet)"
          sub={`${flaggedCount} flagged fills · ${redCount} high-risk`}
          tone={redCount > 0 ? "red" : "slate"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-1">Monthly Fuel Spend</h3>
          <p className="text-xs text-taupe mb-3">Company-wide, last 6 months</p>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE6D8" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8A8378" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8A8378" }} />
                <Tooltip
                  formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Fuel spend"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #EFE6D8", fontSize: 12 }}
                />
                <Bar dataKey="cost" fill="#1E7A5A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-1">Expense Share by Vehicle</h3>
          <p className="text-xs text-taupe mb-3">Who is burning the budget</p>
          {share.length === 0 ? (
            <EmptyState>No fuel expenses logged yet</EmptyState>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div style={{ width: 150, height: 150, flex: "none", maxWidth: "100%" }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={share} dataKey="cost" nameKey="plate" innerRadius={38} outerRadius={70} paddingAngle={2}>
                      {share.map((_, i) => (
                        <Cell key={i} fill={pieColors()[i % pieColors().length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [`₱${Number(v).toLocaleString()}`, ""]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #EFE6D8", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {share.map((s, i) => (
                  <button
                    key={s.plate}
                    className="w-full flex items-center gap-2 text-left hover:bg-mint/50 rounded-md px-1.5 py-1"
                    onClick={() => onSelectVehicle(s.plate)}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: pieColors()[i % pieColors().length] }} />
                    <span className="text-xs font-medium text-cocoa flex-1 truncate">{s.plate}</span>
                    <span className="text-xs text-taupe">₱{s.cost.toLocaleString()}</span>
                    <span className="text-xs text-taupe w-10 text-right">
                      {Math.round((s.cost / shareTotal) * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <h3 className="text-sm font-semibold text-cocoa mb-3 flex items-center gap-2">
        <FuelIcon className="w-4 h-4 text-brand" /> Vehicle Breakdown — tap for details
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        {audit.vehicleSummaries.map((s) => {
          const st = scoreStyle(s.integrityScore);
          const segs = audit.segments.filter((x) => x.vehicle_plate === s.vehicle_plate);
          const km = segs.reduce((a, x) => a + x.km, 0);
          const cpk = km > 0 ? s.totalSpend / km : null;
          return (
            <button
              key={s.vehicle_plate}
              className="bg-white rounded-3xl shadow-card p-4 text-left hover:shadow-md transition-shadow"
              onClick={() => onSelectVehicle(s.vehicle_plate)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm text-cocoa">{s.vehicle_plate}</p>
                  <p className="text-xs text-taupe capitalize">
                    {s.fuel_type} · rated {s.rated_km_per_liter} km/L · {s.fillCount} fills
                  </p>
                </div>
                <span className={cn("text-xs font-semibold", st.text)}>
                  {s.integrityScore} · {st.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-mint/40 rounded-lg p-1.5">
                  <p className="text-xs font-bold text-cocoa">₱{Math.round(s.totalSpend).toLocaleString()}</p>
                  <p className="text-[10px] text-taupe">spend</p>
                </div>
                <div className="bg-mint/40 rounded-lg p-1.5">
                  <p className="text-xs font-bold text-cocoa">{s.avgKmpl ? s.avgKmpl.toFixed(1) : "—"}</p>
                  <p className="text-[10px] text-taupe">km/L avg</p>
                </div>
                <div className="bg-mint/40 rounded-lg p-1.5">
                  <p className={cn("text-xs font-bold", s.flaggedCount > 0 ? "text-red-600" : "text-brand")}>
                    {cpk ? `₱${cpk.toFixed(1)}` : "—"}
                  </p>
                  <p className="text-[10px] text-taupe">per km</p>
                </div>
              </div>
              <p className="text-xs text-brand mt-2.5 flex items-center gap-1">
                View breakdown <ChevronRight className="w-3.5 h-3.5" />
              </p>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-vehicle detail view
// ---------------------------------------------------------------------------
function VehicleDetail({ plate, audit, vehicles, onBack }) {
  const summary = audit.vehicleSummaries.find((s) => s.vehicle_plate === plate);
  const veh = vehicles.find((v) => v.plate_number === plate);
  if (!summary) return null;

  const st = scoreStyle(summary.integrityScore);
  const myFlags = audit.fillAudits.filter((a) => a.fill.vehicle_plate === plate && a.flags.length > 0);
  const mySegs = audit.segments
    .filter((s) => s.vehicle_plate === plate)
    .sort((a, b) => a.toOdo - b.toOdo);
  const myFills = audit.fillAudits
    .filter((a) => a.fill.vehicle_plate === plate)
    .sort((a, b) => b.fill.odometer - a.fill.odometer);
  const km = mySegs.reduce((s, x) => s + x.km, 0);
  const cpk = km > 0 ? summary.totalSpend / km : null;
  const trend = mySegs.map((s) => ({ odo: s.toOdo.toLocaleString(), kmpl: Number(s.kmpl.toFixed(2)) }));

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> All vehicles
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-2 mb-5">
        <div>
          <h2 className="text-xl font-heading font-bold text-cocoa">{plate}</h2>
          <p className="text-sm text-taupe">
            {veh?.model || veh?.unit_name || ""} · {summary.fuel_type} · tank {summary.tank_liters} L · rated{" "}
            {summary.rated_km_per_liter} km/L
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-2xl font-bold", st.text)}>{summary.integrityScore}</p>
          <p className={cn("text-xs font-medium", st.text)}>integrity · {st.label}</p>
        </div>
      </div>
      <div className="h-1.5 bg-mint/60 rounded-full overflow-hidden mb-5">
        <div className={cn("h-full", st.bar)} style={{ width: `${summary.integrityScore}%` }} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat value={`₱${Math.round(summary.totalSpend).toLocaleString()}`} label="Total spend" sub={`${summary.totalLiters.toFixed(0)} L purchased`} />
        <Stat value={summary.avgKmpl ? summary.avgKmpl.toFixed(1) : "—"} label="Avg km/L" sub={`rated ${summary.rated_km_per_liter}`} tone="green" />
        <Stat value={cpk ? `₱${cpk.toFixed(2)}` : "—"} label="Cost per km" sub={`${km.toLocaleString()} audited km`} tone="blue" />
        <Stat value={String(summary.flaggedCount)} label="Flagged fills" sub={`of ${summary.fillCount} total`} tone={summary.flaggedCount > 0 ? "red" : "slate"} />
      </div>

      {trend.length >= 2 && (
        <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
          <h3 className="text-sm font-semibold text-cocoa mb-1">Consumption Trend</h3>
          <p className="text-xs text-taupe mb-3">Full-to-full km/L per fill (dashed = rated)</p>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid stroke="#EFE6D8" />
                <XAxis dataKey="odo" tick={{ fontSize: 11, fill: "#8A8378" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8A8378" }} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v) => [`${v} km/L`, "Full-to-full"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #EFE6D8", fontSize: 12 }}
                />
                <ReferenceLine y={summary.rated_km_per_liter} stroke="#94a3b8" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="kmpl" stroke={themeColors().primary} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {myFlags.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-cocoa mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent-dark" /> Flags for this vehicle — tap for evidence
          </h3>
          <div className="space-y-3">
            {myFlags.map((a) => (
              <FlagCard key={a.fill.id} audit={a} />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-sand/70">
          <h3 className="text-sm font-semibold text-cocoa">Full Fill-up History</h3>
        </div>
        {myFills.length === 0 ? (
          <EmptyState>No fill-ups logged for this vehicle</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mint/40 border-b border-sand text-left text-xs text-taupe uppercase tracking-wide">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">ODO</th>
                <th className="px-4 py-2.5 text-right">Liters</th>
                <th className="px-4 py-2.5 text-right">₱/L</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Station</th>
                <th className="px-4 py-2.5 text-right">Audit</th>
              </tr>
            </thead>
            <tbody>
              {myFills.map(({ fill, flags }) => {
                const pp = fill.liters > 0 ? Number(fill.cost) / Number(fill.liters) : 0;
                const red = flags.some((f) => f.severity === "red");
                const amber = flags.length > 0 && !red;
                return (
                  <tr key={fill.id} className="border-b border-sand/70 last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">{dayjs(fill.fill_date).format("MMM D, YYYY")}</td>
                    <td className="px-4 py-2.5 text-right">{Number(fill.odometer).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">{Number(fill.liters).toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right">{pp ? pp.toFixed(2) : "—"}</td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-mocha">{fill.station || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {flags.length === 0 ? (
                        <span className="text-brand">✓ clean</span>
                      ) : (
                        <span className={cn("text-xs font-medium", red ? "text-red-600" : "text-accent-dark")}>
                          ⚠ {flags.length} flag{flags.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {mySegs.length > 0 && (
        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-1">Full-to-Full Segments</h3>
          <p className="text-xs text-taupe mb-3">
            Distance between full fills ÷ liters added — the honest way to read consumption
          </p>
          <div className="space-y-2">
            {mySegs.map((s) => {
              const bad = s.kmpl > summary.rated_km_per_liter * 1.35 || (s.kmpl < summary.rated_km_per_liter * 0.55 && s.km > 20);
              return (
                <div key={s.id} className="flex items-center justify-between bg-mint/40 border border-sand/70 rounded-lg px-3 py-2 text-sm">
                  <span className="text-mocha">
                    {s.fromOdo.toLocaleString()} → {s.toOdo.toLocaleString()} km
                  </span>
                  <span className="text-taupe text-xs">
                    {s.km.toLocaleString()} km · {s.liters.toFixed(1)} L
                  </span>
                  <span className={cn("font-semibold", bad ? "text-red-600" : "text-brand")}>
                    {s.kmpl.toFixed(1)} km/L
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fuel page
// ---------------------------------------------------------------------------
export default function Fuel() {
  const [fills, setFills] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [f, v, l] = await Promise.all([
        api.entities.FuelLog.list("-fill_date", 500),
        api.entities.Vehicle.list(),
        api.entities.MileageLog.list("-time_out", 500),
      ]);
      setFills(f);
      setVehicles(v);
      setLogs(l);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const audit = useMemo(() => auditFuel(fills, vehicles, logs), [fills, vehicles, logs]);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">Fuel & Consumption</h1>
          <p className="text-sm text-taupe mt-1">
            {selected
              ? "Vehicle breakdown — full audit history"
              : "Company fuel expense summary · full-to-full audit with fraud flags"}
          </p>
        </div>
        <div className="flex gap-2">
          {selected && (
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              <Wallet className="w-4 h-4" /> Company Summary
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => setModal(true)}>
            <Plus className="w-4 h-4" /> Log Fill-up
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="w-6 h-6 text-taupe" />
        </div>
      ) : selected ? (
        <VehicleDetail plate={selected} audit={audit} vehicles={vehicles} onBack={() => setSelected(null)} />
      ) : (
        <CompanySummary audit={audit} fills={fills} onSelectVehicle={setSelected} />
      )}

      {!loading && !selected && (
        <p className="text-xs text-taupe mt-6 flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5" />
          Audit rules: tank capacity · odometer sequence · impossible efficiency · abnormal thirst ·
          market ₱/L band · statistical outlier · unaccounted km vs verified missions — bands configurable in Settings
        </p>
      )}

      {modal && (
        <LogFillModal
          open
          onClose={() => setModal(false)}
          vehicles={vehicles}
          onSaved={() => {
            setModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
