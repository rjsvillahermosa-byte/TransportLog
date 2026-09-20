import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, ClipboardList, LogOut, Trash2, Clock, MapPin, Calendar, Car } from "lucide-react";
import dayjs from "../lib/day";
import { api, auth, isOnline } from "../lib/db";
import { AlertTriangle } from "lucide-react";
import { formatTime } from "../lib/voice";
import { cn, STATUS_STYLES, BOOKING_ICONS } from "../lib/utils";
import { Button, EmptyState, Spinner } from "../components/ui";
import { useToast } from "../components/Layout";

const FILTERS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All" },
];

function MissionCard({ request: r, onDelete }) {
  const [busy, setBusy] = useState(false);
  const del = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete booking for ${r.guest_name}?`)) return;
    setBusy(true);
    try {
      await api.entities.TransportRequest.delete(r.id);
      onDelete?.();
    } catch {
      alert("Failed to delete booking");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Link to={`/mission/${r.id}`}>
      <div className="bg-white rounded-3xl shadow-card p-4 hover:shadow-md transition-shadow active:scale-[0.99]">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-mint/50 flex items-center justify-center">
              {r.requester_type === "Errand" ? (
                <Briefcase className="w-5 h-5 text-orange" />
              ) : (
                <span className="text-brand text-lg leading-none">
                  {BOOKING_ICONS[r.booking_type] || "•"}
                </span>
              )}
            </div>
            <div>
              <p className="font-semibold text-sm text-cocoa">{r.guest_name}</p>
              <p className="text-xs text-taupe">
                {r.requester_type === "Errand"
                  ? `Errand · ${r.department || "Internal"}`
                  : r.booking_type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full border",
                STATUS_STYLES[r.status] || STATUS_STYLES.Pending
              )}
            >
              {r.status}
            </span>
            <button
              onClick={del}
              disabled={busy}
              className="text-sand hover:text-red-500 p-1"
              title="Delete booking"
            >
              {busy ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-taupe mt-0.5 flex-none" />
            <div>
              <p className="text-taupe">Pickup</p>
              <p className="text-mocha truncate">{r.pickup_location || "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <Clock className="w-3.5 h-3.5 text-taupe mt-0.5 flex-none" />
            <div>
              <p className="text-taupe">Schedule</p>
              <p className="text-mocha">
                {r.schedule_date ? dayjs(r.schedule_date).format("MMM D") : "—"} {r.schedule_time || ""}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <Car className="w-3.5 h-3.5 text-taupe mt-0.5 flex-none" />
            <div>
              <p className="text-taupe">Vehicle</p>
              <p className="text-mocha truncate">{r.vehicle_plate || "Unassigned"}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Missions({ user }) {
  const [requests, setRequests] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("today");
  const [kind, setKind] = useState("all"); // all | guest | errand
  const toast = useToast();
  const navigate = useNavigate();
  const notifiedRef = useRef(new Set);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.entities.TransportRequest.list("-schedule_date", 100);
      setRequests(rows);
    } finally {
      setLoading(false);
    }
  };

  const loadIncidents = async () => {
    try {
      setIncidents(await api.entities.IncidentLog.list("-created_date", 5));
    } catch {}
  };

  useEffect(() => {
    load();
    loadIncidents();
    const onIncident = () => loadIncidents();
    window.addEventListener("app:incident", onIncident);
    return () => window.removeEventListener("app:incident", onIncident);
  }, []);

  // "Pickup in 30 Minutes" reminder — browser notification + toast, deduped,
  // exactly like the original's scheduler.
  useEffect(() => {
    const check = () => {
      const now = dayjs();
      requests
        .filter((r) => r.status === "Pending" && r.schedule_date && r.schedule_time)
        .forEach((r) => {
          const dt = dayjs(`${r.schedule_date} ${r.schedule_time}`, "YYYY-MM-DD HH:mm");
          const diffMin = dt.diff(now, "minutes");
          const key = `upcoming-${r.id}`;
          if (diffMin >= 0 && diffMin <= 30 && !notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            const body = `${r.guest_name} — ${r.pickup_location || r.destination || ""}`;
            toast({ title: "Pickup in 30 Minutes", description: body });
            if (Notification.permission === "granted") {
              new Notification("Pickup in 30 Minutes", { body, icon: "/favicon.ico" });
            }
          }
          const newKey = `new-${r.id}`;
          const ageMin = dayjs().diff(dayjs(r.created_date), "minutes");
          if (ageMin <= 5 && !notifiedRef.current.has(newKey)) {
            notifiedRef.current.add(newKey);
            toast({
              title: "New booking received",
              description: `${r.guest_name} · ${r.booking_type}`,
            });
          }
        });
    };
    const id = setInterval(check, 30000);
    check();
    return () => clearInterval(id);
  }, [requests]); // eslint-disable-line

  const filtered = useMemo(() => {
    let rows = requests;
    if (kind === "guest") rows = rows.filter((r) => r.requester_type !== "Errand");
    if (kind === "errand") rows = rows.filter((r) => r.requester_type === "Errand");
    if (filter === "all") return rows;
    const now = dayjs();
    if (filter === "today")
      return rows.filter((r) => r.schedule_date === now.format("YYYY-MM-DD"));
    if (filter === "week")
      return rows.filter((r) =>
        dayjs(r.schedule_date).isBetween(now.startOf("week"), now.endOf("week"), null, "[]")
      );
    if (filter === "month")
      return rows.filter((r) => dayjs(r.schedule_date).month() === now.month());
    return rows;
  }, [requests, filter, kind]);

  const active = requests.filter((r) => r.status === "In Progress").length;
  const pending = requests.filter((r) => r.status === "Pending").length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">
            Welcome, {user?.full_name?.split(" ")[0] || "Driver"}
          </h1>
          <p className="text-sm text-taupe mt-1">Your transport missions dashboard</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-none"
          onClick={async () => {
            await auth.logout();
            window.location.href = "/login"; // full reload clears in-memory session
          }}
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
        <div className="flex gap-2">
          <div className="bg-mint/50 border border-brand/20 rounded-lg px-3 py-2 text-center min-w-[64px]">
            <p className="text-lg font-bold text-brand">{active}</p>
            <p className="text-[11px] text-brand">Active</p>
          </div>
          <div className="bg-accent/15 border border-accent/30 rounded-lg px-3 py-2 text-center min-w-[64px]">
            <p className="text-lg font-bold text-accent-dark">{pending}</p>
            <p className="text-[11px] text-accent-dark">Pending</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
        <div className="inline-flex h-8 items-center rounded-md bg-mint/60 p-0.5 text-taupe">
          {[
            { value: "all", label: "All" },
            { value: "guest", label: "Guests" },
            { value: "errand", label: "Errands" },
          ].map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-sm transition-all",
                kind === k.value ? "bg-white text-cocoa shadow-sm" : "hover:text-mocha"
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => navigate("/new-booking")}>
          <Calendar className="w-4 h-4" /> New Booking
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="w-6 h-6 text-taupe" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList}>No missions found for this period</EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <MissionCard key={r.id} request={r} onDelete={load} />
          ))}
        </div>
      )}

      {/* Incident log — voice-reported events with timestamps */}
      {incidents.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-cocoa mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent-dark" /> Incident Log
            <span className="text-xs font-normal text-taupe">reported via voice or log</span>
          </h3>
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="bg-white rounded-2xl shadow-card p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-cocoa">{inc.detail}</p>
                  <p className="text-xs text-taupe mt-0.5">
                    {inc.type}
                    {inc.vehicle_plate ? " · " + inc.vehicle_plate : ""}
                    {inc.reported_by ? " · " + inc.reported_by : ""}
                    {inc.source === "voice" ? " · 🎙 via voice" : ""}
                  </p>
                </div>
                <div className="text-right flex-none">
                  <p className="text-xs font-semibold text-brand">{formatTime(new Date(inc.created_date))}</p>
                  <p className="text-[10px] text-taupe">
                    {new Date(inc.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
