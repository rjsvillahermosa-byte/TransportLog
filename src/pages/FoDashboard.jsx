import { useEffect, useMemo, useState } from "react";
import dayjs from "../lib/day";
import { LogOut } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { themeColors } from "../lib/theme";
import { api, auth } from "../lib/db";
import { BOOKING_TYPES } from "../lib/utils";
import { Button, Input, Label, EmptyState } from "../components/ui";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";

function Stat({ value, label, sub, tone }) {
  const tones = {
    brand: "text-brand",
    green: "text-teal",
    amber: "text-accent-dark",
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

function StatusChip({ status }) {
  const map = {
    Pending: "bg-accent/15 text-accent-dark border-accent/40",
    "In Progress": "bg-brand text-white border-brand",
    Completed: "bg-mint/70 text-teal border-teal/30",
  };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", map[status] || "bg-mint/60 text-mocha border-sand")}>
      {status}
    </span>
  );
}

export default function FoDashboard() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [requests, setRequests] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r, l] = await Promise.all([
          api.entities.TransportRequest.list("-schedule_date", 500),
          api.entities.MileageLog.list("-time_out", 500),
        ]);
        setRequests(r);
        setLogs(l);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = dayjs().format("YYYY-MM-DD");

  // ------------------------------------------------------------------
  // TODAY AT THE LOBBY — the daily run sheet
  // ------------------------------------------------------------------
  const todays = useMemo(
    () =>
      requests
        .filter((r) => r.schedule_date === today)
        .sort((a, b) => (a.schedule_time || "99:99").localeCompare(b.schedule_time || "99:99")),
    [requests, today]
  );

  const todaysPending = todays.filter((r) => r.status === "Pending");
  const todaysActive = todays.filter((r) => r.status === "In Progress");
  const todaysDone = todays.filter((r) => r.status === "Completed");
  const nextPickup = todaysPending[0] || null;
  const vehiclesOut = [...new Set(todaysActive.map((r) => r.vehicle_plate).filter(Boolean))];

  const inRange = useMemo(() => {
    const start = dayjs(from).startOf("day");
    const end = dayjs(to).endOf("day");
    const reqs = requests.filter((r) =>
      dayjs(r.schedule_date).isBetween(start, end, "day", "[]")
    );
    const miles = logs.filter(
      (l) => l.time_out && dayjs(l.time_out).isBetween(start, end, null, "[]")
    );
    return { reqs, miles };
  }, [requests, logs, from, to]);

  const totalKm = inRange.miles.reduce((s, l) => s + (l.distance || 0), 0);
  const activeNow = inRange.reqs.filter((r) => r.status === "In Progress").length;
  const completed = inRange.reqs.filter((r) => r.status === "Completed").length;
  const pending = inRange.reqs.filter((r) => r.status === "Pending").length;

  const daily = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = dayjs().subtract(i, "day");
      const km = inRange.miles
        .filter((l) => dayjs(l.time_out).format("YYYY-MM-DD") === d.format("YYYY-MM-DD"))
        .reduce((s, l) => s + (l.distance || 0), 0);
      days.push({ day: d.format("MMM D"), km });
    }
    return days;
  }, [inRange]);

  const vehicleUsage = useMemo(() => {
    const byPlate = {};
    inRange.miles.forEach((l) => {
      const req = requests.find((r) => r.id === l.request_id);
      const plate = req?.vehicle_plate || l.vehicle_plate || "Unassigned";
      byPlate[plate] = (byPlate[plate] || 0) + (l.distance || 0);
    });
    return Object.entries(byPlate).map(([plate, km]) => ({ plate, km }));
  }, [inRange, requests]);

  const byType = BOOKING_TYPES.map((t) => ({
    type: t,
    count: inRange.reqs.filter((r) => r.booking_type === t).length,
  }));

  // Errand mileage by department — verified km per department for chargeback
  const byDepartment = useMemo(() => {
    const map = {};
    inRange.reqs
      .filter((r) => r.requester_type === "Errand" && r.department)
      .forEach((r) => {
        const log = logs.find((l) => l.request_id === r.id);
        map[r.department] = (map[r.department] || 0) + (log?.distance || 0);
      });
    return Object.entries(map).map(([dept, km]) => ({ dept, km }));
  }, [inRange, logs]);

  const errandCount = inRange.reqs.filter((r) => r.requester_type === "Errand").length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">Front Office Dashboard</h1>
          <p className="text-sm text-taupe mt-1">
            {dayjs().format("dddd, MMMM D, YYYY")} — the lobby's daily briefing
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-none"
          onClick={() => {
            auth.logout();
            navigate("/login");
          }}
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>

      {/* ================= TODAY AT THE LOBBY ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat value={todays.length} label="Trips today" sub="scheduled" tone="brand" />
        <Stat value={todaysPending.length} label="Awaiting pickup" sub="pending" tone="amber" />
        <Stat value={todaysActive.length} label="On the road" sub="in progress" tone="slate" />
        <Stat value={todaysDone.length} label="Completed today" sub="done & logged" tone="green" />
      </div>

      {/* next pickup banner */}
      {nextPickup && (
        <Link to={`/mission/${nextPickup.id}`} className="block mb-5">
          <div className="bg-brand text-white rounded-3xl p-5 shadow-lift flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-80">Next pickup</p>
              <p className="text-3xl font-heading font-extrabold leading-none mt-1">
                {nextPickup.schedule_time || "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">{nextPickup.guest_name}</p>
              <p className="text-sm opacity-85 truncate">
                {nextPickup.pickup_location || "Hotel"} → {nextPickup.destination || "TBA"}
              </p>
            </div>
            <div className="ml-auto text-sm opacity-90">
              <p>🧑‍✈️ {nextPickup.assigned_driver_name || "Unassigned"}</p>
              <p>🚗 {nextPickup.vehicle_plate || "Unassigned"}</p>
            </div>
          </div>
        </Link>
      )}
      {!nextPickup && todays.length > 0 && (
        <div className="bg-white rounded-3xl shadow-card p-4 mb-5 text-center text-sm text-mocha">
          {todaysActive.length
            ? "All pickups done for now — a trip is currently on the road."
            : "Every scheduled pickup today has been completed. Clear board. ✅"}
        </div>
      )}

      {/* run sheet */}
      <div className="bg-white rounded-3xl shadow-card p-5 mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-cocoa">
            Today's Run Sheet — {dayjs().format("MMM D")}
          </h3>
          {vehiclesOut.length > 0 && (
            <p className="text-xs text-accent-dark font-semibold">
              🚗 Out now: {vehiclesOut.join(", ")}
            </p>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-taupe py-6 text-center">Loading today's schedule…</p>
        ) : todays.length === 0 ? (
          <EmptyState>No trips scheduled today — quiet day in the lobby.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {todays.map((r) => {
              const isNext = nextPickup && r.id === nextPickup.id;
              const log = logs.find((l) => l.request_id === r.id);
              return (
                <Link
                  key={r.id}
                  to={`/mission/${r.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-3 transition-all hover:shadow-card",
                    isNext ? "border-brand bg-brand/5" : "border-sand/70 bg-white"
                  )}
                >
                  <div className="text-center flex-none w-14">
                    <p className={cn("text-sm font-extrabold", isNext ? "text-brand" : "text-cocoa")}>
                      {r.schedule_time || "—"}
                    </p>
                    {isNext && <p className="text-[9px] font-bold text-brand uppercase">Next</p>}
                  </div>
                  <div
                    className={cn(
                      "w-1 self-stretch rounded-full flex-none",
                      r.status === "Completed" ? "bg-mintdark" : r.status === "In Progress" ? "bg-gold" : "bg-sand"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-cocoa truncate">
                      {r.guest_name}
                      <span className="ml-2 text-[10px] font-medium text-taupe align-middle">
                        {r.requester_type === "Errand" ? `Errand · ${r.department}` : r.booking_type}
                      </span>
                    </p>
                    <p className="text-xs text-taupe truncate">
                      {r.pickup_location || "Hotel"} → {r.destination || "TBA"}
                      {log?.distance != null && ` · ${log.distance} km done`}
                    </p>
                  </div>
                  <div className="hidden sm:block text-right text-xs text-mocha flex-none">
                    <p>{r.assigned_driver_name || "— driver"}</p>
                    <p className="text-taupe">{r.vehicle_plate || "no vehicle"}</p>
                  </div>
                  <StatusChip status={r.status} />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= REPORTS & ANALYTICS (details below) ================= */}
      <h2 className="text-lg font-heading font-bold text-cocoa mb-1">Reports & Analytics</h2>
      <p className="text-sm text-taupe mb-4">Date-range history, mileage and breakdowns</p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat value={`${totalKm} km`} label="Total Mileage" sub="in range" tone="brand" />
        <Stat value={activeNow} label="Active Now" sub="in progress" tone="slate" />
        <Stat value={completed} label="Completed" sub="in range" tone="green" />
        <Stat value={pending} label="Pending" sub="in range" tone="amber" />
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-cocoa mb-4">Daily Mileage — Last 14 Days</h3>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFE6D8" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8A8378" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "#8A8378" }} />
              <Tooltip
                formatter={(v) => [`${v} km`, "Mileage"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #EFE6D8", fontSize: 12 }}
              />
              <Bar dataKey="km" fill={themeColors().primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-4">Vehicle Usage</h3>
          {vehicleUsage.length === 0 ? (
            <EmptyState>No data this month</EmptyState>
          ) : (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={vehicleUsage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFE6D8" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#8A8378" }} />
                  <YAxis type="category" dataKey="plate" width={90} tick={{ fontSize: 11, fill: "#5A4C3F" }} />
                  <Tooltip
                    formatter={(v) => [`${v} km`, "Distance"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #EFE6D8", fontSize: 12 }}
                  />
                  <Bar dataKey="km" fill={themeColors().primarySoft} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-4">Bookings by Type</h3>
          <div className="grid grid-cols-2 gap-3">
            {byType.map((t) => (
              <div key={t.type} className="bg-mint/40 rounded-lg p-3">
                <p className="text-xs text-taupe">{t.type}</p>
                <p className="text-xl font-bold text-cocoa">{t.count}</p>
              </div>
            ))}
            <div className="bg-orange/10 rounded-lg p-3">
              <p className="text-xs text-orange">Errands (internal)</p>
              <p className="text-xl font-bold text-cocoa">{errandCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="text-sm font-semibold text-cocoa mb-4">
          Department Errand Mileage — verified km
        </h3>
        {byDepartment.length === 0 ? (
          <EmptyState>No department errands in this period</EmptyState>
        ) : (
          <div style={{ width: "100%", height: 40 + byDepartment.length * 44 }}>
            <ResponsiveContainer>
              <BarChart data={byDepartment} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE6D8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#8A8378" }} />
                <YAxis type="category" dataKey="dept" width={130} tick={{ fontSize: 11, fill: "#5A4C3F" }} />
                <Tooltip
                  formatter={(v) => [`${v} km`, "Verified distance"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #EFE6D8", fontSize: 12 }}
                />
                <Bar dataKey="km" fill="#B4552D" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
