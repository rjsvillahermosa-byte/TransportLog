import { useEffect, useMemo, useState } from "react";
import dayjs from "../lib/day";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/db";
import { BOOKING_TYPES } from "../lib/utils";
import { Input, Label, EmptyState } from "../components/ui";
import { themeColors } from "../lib/theme";

function Stat({ value, label, sub, tone }) {
  const tones = {
    blue: "text-brand",
    green: "text-brand",
    amber: "text-accent-dark",
    slate: "text-cocoa",
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-4">
      <p className={`text-2xl font-bold ${tones[tone] || tones.slate}`}>{value}</p>
      <p className="text-sm font-medium text-mocha">{label}</p>
      <p className="text-xs text-taupe">{sub}</p>
    </div>
  );
}

export default function FoDashboard() {
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
      <h1 className="text-2xl font-heading font-bold text-cocoa">Front Office Dashboard</h1>
      <p className="text-sm text-taupe mt-1 mb-6">Bookings & mileage by date range</p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
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
        <Stat value={`${totalKm} km`} label="Total Mileage" sub="this month" tone="blue" />
        <Stat value={activeNow} label="Active Now" sub="in progress" tone="slate" />
        <Stat value={completed} label="Completed" sub="this month" tone="green" />
        <Stat value={pending} label="Pending" sub="scheduled" tone="amber" />
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

      <div className="grid md:grid-cols-2 gap-6">
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
              <div key={t.type} className="bg-mint/40 border border-sand/70 rounded-lg p-3">
                <p className="text-xs text-taupe">{t.type}</p>
                <p className="text-xl font-bold text-cocoa">{t.count}</p>
              </div>
            ))}
            <div className="bg-orange/10 border border-orange/20 rounded-lg p-3">
              <p className="text-xs text-orange">Errands (internal)</p>
              <p className="text-xl font-bold text-cocoa">{errandCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5 mt-6">
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
                <Bar dataKey="km" fill={themeColors().accent} radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
