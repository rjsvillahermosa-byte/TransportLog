import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, UserRound } from "lucide-react";
import dayjs from "../lib/day";
import { api, integrations, nextMissionId } from "../lib/db";
import { BOOKING_TYPES, DEPARTMENTS } from "../lib/utils";
import { Button, Input, Label, Select, Textarea, Spinner } from "../components/ui";
import { useToast } from "../components/Layout";
import { cn } from "../lib/utils";

const emptyForm = {
  guest_name: "",
  pax_count: 1,
  booking_type: "",
  pickup_location: "",
  destination: "",
  schedule_date: "",
  schedule_time: "",
  assigned_driver_id: "",
  assigned_driver_name: "",
  vehicle_id: "",
  vehicle_plate: "",
  department: "",
  special_notes: "",
  // errand fields
  requested_by: "",
};

export default function NewBooking({ user }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState("guest"); // "guest" | "errand"
  const [form, setForm] = useState({
    ...emptyForm,
    schedule_date: dayjs().format("YYYY-MM-DD"),
  });
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, v] = await Promise.all([
          api.entities.Driver.list(),
          api.entities.Vehicle.list(),
        ]);
        setDrivers(d);
        setVehicles(v);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickDriver = (id) => {
    const d = drivers.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      assigned_driver_id: id,
      assigned_driver_name: d?.full_name || "",
    }));
  };
  const pickVehicle = (id) => {
    const v = vehicles.find((x) => x.id === id);
    setForm((f) => ({ ...f, vehicle_id: id, vehicle_plate: v?.plate_number || "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "guest" && !form.booking_type) return;
    if (mode === "errand" && (!form.requested_by || !form.department)) return;
    setLoading(true);
    try {
      const mission_id = nextMissionId();
      const rec = {
        ...form,
        mission_id,
        booked_by: user?.full_name || "Front Office",
        requester_type: mode === "errand" ? "Errand" : "Guest",
        booking_type: mode === "errand" ? "Errand" : form.booking_type,
        guest_name: mode === "errand" ? form.requested_by : form.guest_name,
        pax_count: mode === "errand" ? 1 : form.pax_count,
        status: "Pending",
      };
      await api.entities.TransportRequest.create(rec);

      const subject =
        mode === "errand"
          ? `[Errand] ${form.department} — ${form.requested_by} (${mission_id})`
          : `New Booking — ${form.guest_name} (${mission_id})`;
      const body = `${rec.booking_type} · ${form.schedule_date} ${form.schedule_time}\n` +
        `${form.pickup_location || "Hotel Lobby"} → ${form.destination || "TBA"}\n` +
        `Driver: ${form.assigned_driver_name || "Unassigned"} · Vehicle: ${form.vehicle_plate || "Unassigned"}`;
      integrations.Core.SendEmail({ to: "fo@hotel.local", subject, body }).catch(() => {});

      toast({
        title: mode === "errand" ? "Errand created" : "Booking created",
        description: `Mission ${mission_id} has been scheduled.`,
      });
      navigate("/");
    } catch {
      toast({ title: "Error", description: "Failed to create booking." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-heading font-bold text-cocoa">
        {mode === "errand" ? "New Errand" : "New Booking"}
      </h1>
      <p className="text-sm text-taupe mt-1 mb-5">
        {mode === "errand"
          ? "Department errand with the same tracked mission workflow"
          : "Create a transport request for a guest"}
      </p>

      <div className="inline-flex h-10 items-center rounded-md bg-mint/60 p-1 text-taupe mb-6">
        {[
          { value: "guest", label: "Guest Booking", icon: UserRound },
          { value: "errand", label: "Department Errand", icon: Briefcase },
        ].map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
              mode === m.value ? "bg-white text-cocoa shadow-sm" : "hover:text-mocha"
            )}
          >
            <m.icon className="w-4 h-4" />
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-5">
        {mode === "guest" ? (
          <section className="bg-white rounded-3xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-cocoa mb-4">Guest Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Guest Name *</Label>
                <Input
                  required
                  value={form.guest_name}
                  onChange={set("guest_name")}
                  placeholder="John Smith"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Number of Guests</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.pax_count}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, pax_count: Number(e.target.value) || 1 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input
                    value={form.department}
                    onChange={set("department")}
                    placeholder="Front Office"
                  />
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-3xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-cocoa mb-1">Errand Request</h3>
            <p className="text-xs text-taupe mb-4">
              Internal trips follow the same ODO + GPS tracked mission workflow
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Requested By *</Label>
                  <Input
                    required
                    value={form.requested_by}
                    onChange={set("requested_by")}
                    placeholder="e.g. Liza Manalo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select value={form.department} onChange={set("department")} required>
                    <option value="">Select department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Purpose / Notes</Label>
                <Textarea
                  value={form.special_notes}
                  onChange={set("special_notes")}
                  placeholder="What is the errand for? (e.g. collect supplies, bank, event materials)"
                  className="min-h-[60px]"
                />
              </div>
            </div>
          </section>
        )}

        <section className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-4">Trip Details</h3>
          <div className="space-y-4">
            {mode === "guest" && (
              <div className="space-y-2">
                <Label>Booking Type *</Label>
                <Select
                  required
                  value={form.booking_type}
                  onChange={(e) => setForm((f) => ({ ...f, booking_type: e.target.value }))}
                >
                  <option value="" disabled>
                    Select type
                  </option>
                  {BOOKING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Pickup Location</Label>
              <Input
                value={form.pickup_location}
                onChange={set("pickup_location")}
                placeholder="Hotel Lobby"
              />
            </div>
            <div className="space-y-2">
              <Label>{mode === "errand" ? "Destination *" : "Destination"}</Label>
              <Input
                value={form.destination}
                onChange={set("destination")}
                placeholder={mode === "errand" ? "e.g. Supplier warehouse — Pasay" : "Airport Terminal 3"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  required
                  value={form.schedule_date}
                  onChange={set("schedule_date")}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={form.schedule_time}
                  onChange={set("schedule_time")}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-cocoa mb-4">Assignment</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign Driver</Label>
              <Select
                value={form.assigned_driver_id}
                onChange={(e) => pickDriver(e.target.value)}
              >
                <option value="">Select driver</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Select value={form.vehicle_id} onChange={(e) => pickVehicle(e.target.value)}>
                <option value="">Select vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number} — {v.model || v.unit_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        {mode === "guest" && (
          <section className="bg-white rounded-3xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-cocoa mb-4">Special Notes</h3>
            <Textarea
              value={form.special_notes}
              onChange={set("special_notes")}
              placeholder="Any special instructions..."
            />
          </section>
        )}

        <Button variant="primary" className="w-full h-12" disabled={loading}>
          {loading && <Spinner className="w-4 h-4" />}
          {mode === "errand" ? "Create Errand Mission" : "Create Booking"}
        </Button>
      </form>
    </div>
  );
}
