import { useEffect, useMemo, useState } from "react";
import dayjs from "../lib/day";
import { History as HistoryIcon, Printer } from "lucide-react";
import { api } from "../lib/db";
import { Button, EmptyState, Input, Label, Spinner } from "../components/ui";

export default function History() {
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const rows = await api.entities.TransportRequest.filter(
          { status: "Completed" },
          "-schedule_date",
          500
        );
        const start = dayjs(from).startOf("day");
        const end = dayjs(to).endOf("day");
        setTrips(rows.filter((r) => dayjs(r.schedule_date).isBetween(start, end, "day", "[]")));
      } finally {
        setLoading(false);
      }
    })();
  }, [from, to]);

  const logsByReq = useMemo(() => new Map(), []);
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    api.entities.MileageLog.list("-time_out", 500).then(setLogs);
  }, []);
  logs.forEach((l) => logsByReq.set(l.request_id, l));

  const totalKm = trips.reduce((s, t) => s + (logsByReq.get(t.id)?.distance || 0), 0);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">Trip History</h1>
          <p className="text-sm text-taupe mt-1">Completed transport missions</p>
        </div>
        <Button variant="outline" size="sm" disabled={trips.length === 0} onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5" /> Export PDF
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        {trips.length > 0 && (
          <p className="text-sm text-taupe ml-auto">
            {trips.length} trip{trips.length > 1 ? "s" : ""} · {totalKm} km total
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="w-6 h-6 text-taupe" />
        </div>
      ) : trips.length === 0 ? (
        <EmptyState icon={HistoryIcon}>No completed trips for this period</EmptyState>
      ) : (
        <div className="bg-white rounded-3xl shadow-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-mint/40 border-b border-sand text-left text-xs text-taupe uppercase tracking-wide">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3 hidden sm:table-cell">Type</th>
                <th className="px-4 py-3 hidden md:table-cell">Route</th>
                <th className="px-4 py-3 text-right">Distance</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const l = logsByReq.get(t.id);
                return (
                  <tr key={t.id} className="border-b border-sand/70 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {dayjs(t.schedule_date).format("MMM D")}
                      {t.schedule_time ? ` · ${t.schedule_time}` : ""}
                    </td>
                    <td className="px-4 py-3 font-medium text-cocoa">
                      {t.guest_name}
                      {t.requester_type === "Errand" && (
                        <span className="block text-xs font-normal text-orange">
                          Errand · {t.department}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-mocha">{t.booking_type}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-mocha">
                      {t.pickup_location || "—"} → {t.destination || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-cocoa">
                      {l?.distance ?? "—"} km
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
