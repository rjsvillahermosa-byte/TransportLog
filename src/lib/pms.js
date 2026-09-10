import dayjs from "./day";

// ---------------------------------------------------------------------------
// PMS (Preventive Maintenance Schedule) — casa-standard intervals suggested
// from the vehicle model, due when KM OR months elapse, whichever comes
// first. Current odometer is derived from the app's own verified streams:
// mission end-odometers and fuel fill readings.
// ---------------------------------------------------------------------------

// Casa-standard templates by model family (PH market defaults).
export const PMS_MODEL_TEMPLATES = [
  { match: /hiace|grandia|starex|h-?100|van|urgent|traviz|cargo/i, intervalKm: 10000, intervalMonths: 6, label: "Casa standard — van/commercial diesel: 10,000 km / 6 mo" },
  { match: /vios|city|corolla|civic|accent|altis|sedan|mazda|mirage/i, intervalKm: 10000, intervalMonths: 6, label: "Casa standard — sedan: 10,000 km / 6 mo" },
  { match: /innova|rush|monsuno|mobility|avanza|xpander|suv/i, intervalKm: 10000, intervalMonths: 6, label: "Casa standard — AUV/SUV: 10,000 km / 6 mo" },
  { match: /ev|electric|leaf|byd|model\s?3/i, intervalKm: 20000, intervalMonths: 12, label: "EV standard: 20,000 km / 12 mo" },
];
export const PMS_DEFAULT = { intervalKm: 5000, intervalMonths: 6, label: "Conservative default: 5,000 km / 6 mo" };

export function suggestPms(model = "") {
  const tpl = PMS_MODEL_TEMPLATES.find((t) => t.match.test(model));
  return tpl || PMS_DEFAULT;
}

/** Latest known odometer for a plate from missions + fuel fills. */
export function getCurrentOdo(plate, mileageLogs = [], fuelFills = []) {
  const fromMissions = mileageLogs
    .filter((l) => l.vehicle_plate === plate && l.end_odometer != null)
    .reduce((max, l) => Math.max(max, Number(l.end_odometer)), 0);
  const fromFuel = fuelFills
    .filter((f) => f.vehicle_plate === plate && f.odometer != null)
    .reduce((max, f) => Math.max(max, Number(f.odometer)), 0);
  const odo = Math.max(fromMissions, fromFuel);
  const source = odo === 0 ? null : fromFuel > fromMissions ? "fuel log" : "missions";
  return { odo, source };
}

/**
 * Whichever-comes-first PMS status for one vehicle.
 * @returns { status: 'overdue'|'due-soon'|'ok', basis, message, ... }
 */
export function computePmsStatus(vehicle, serviceLogs = [], currentOdo = 0, today = dayjs()) {
  const intervalKm = Number(vehicle.pms_interval_km) || suggestPms(vehicle.model).intervalKm;
  const intervalMonths = Number(vehicle.pms_interval_months) || suggestPms(vehicle.model).intervalMonths;

  const myServices = serviceLogs
    .filter((s) => s.vehicle_plate === vehicle.plate_number && s.service_date)
    .sort((a, b) => dayjs(b.service_date).valueOf() - dayjs(a.service_date).valueOf());
  const last = myServices[0] || null;

  const baseOdo = last?.odometer_at_service != null ? Number(last.odometer_at_service) : 0;
  const baseDate = last?.service_date ? dayjs(last.service_date) : dayjs(vehicle.created_date).subtract(intervalMonths, "month");

  const kmDueAt = baseOdo + intervalKm;
  const dateDueAt = baseDate.add(intervalMonths, "month");

  const kmRemaining = kmDueAt - currentOdo;
  const daysRemaining = dateDueAt.startOf("day").diff(today.startOf("day"), "day");

  const kmOver = kmRemaining <= 0;
  const timeOver = daysRemaining <= 0;
  const kmSoon = kmRemaining <= 1000;
  const timeSoon = daysRemaining <= 14;

  let status = "ok";
  if (kmOver || timeOver) status = "overdue";
  else if (kmSoon || timeSoon) status = "due-soon";

  // whichever comes first wins the message
  let basis = null;
  let message = null;
  if (status !== "ok") {
    const kmFirst = kmRemaining <= daysRemaining; // km headroom smaller than day headroom (≈1:1)
    if (kmOver || (status === "due-soon" && kmSoon && (!timeSoon || kmFirst))) {
      basis = "km";
      message = kmOver
        ? `Overdue by ${Math.abs(kmRemaining).toLocaleString()} km`
        : `Due in ${kmRemaining.toLocaleString()} km`;
    } else {
      basis = "months";
      message = timeOver
        ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"}`
        : `Due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
    }
  }

  return {
    intervalKm,
    intervalMonths,
    lastService: last,
    baseOdo,
    baseDate: baseDate.toISOString(),
    kmDueAt,
    dateDueAt: dateDueAt.format("MMM D, YYYY"),
    kmRemaining,
    daysRemaining,
    kmProgress: intervalKm > 0 ? Math.min(1, Math.max(0, (currentOdo - baseOdo) / intervalKm)) : 0,
    timeProgress: Math.min(1, Math.max(0, 1 - daysRemaining / (intervalMonths * 30.4))),
    status,
    basis,
    message,
  };
}

export function pmsStatusStyle(status) {
  if (status === "overdue")
    return { chip: "bg-red-50 text-red-700 border-red-200", bar: "bg-red-500", icon: "🔴" };
  if (status === "due-soon")
    return { chip: "bg-accent/15 text-accent-dark border-accent/40", bar: "bg-accent", icon: "🟡" };
  return { chip: "bg-mint/70 text-brand border-brand/30", bar: "bg-brand", icon: "🟢" };
}

// ---------------------------------------------------------------------------
// Calendar renewals — registration (OR/CR), insurance, driver's license.
// Pure date-based: overdue past the date, due-soon inside the window
// (60 days gives procurement time for government/corporate renewals).
// ---------------------------------------------------------------------------
export function computeRenewal(dateStr, soonDays = 60, today = dayjs()) {
  if (!dateStr) return null;
  const due = dayjs(dateStr);
  if (!due.isValid()) return null;
  const daysRemaining = due.startOf("day").diff(today.startOf("day"), "day");
  const status = daysRemaining < 0 ? "overdue" : daysRemaining <= soonDays ? "due-soon" : "ok";
  return {
    dueDate: due.format("MMM D, YYYY"),
    daysRemaining,
    status,
    message:
      daysRemaining < 0
        ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"}`
        : daysRemaining <= soonDays
        ? `Due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
        : `${daysRemaining} days left`,
    progress: Math.min(1, Math.max(0, 1 - daysRemaining / 365)),
  };
}

// ---------------------------------------------------------------------------
// Tire wear — odometer-based. Whenever a "Tire Replacement" service is logged,
// tire_changed_odometer updates, and wear restarts. Due-soon at 85% of life.
// ---------------------------------------------------------------------------
export function computeTireWear(vehicle, currentOdo = 0) {
  const life = Number(vehicle.tire_life_km) || 40000;
  const changed = Number(vehicle.tire_changed_odometer) || 0;
  if (changed <= 0) return null; // never replaced / not tracked yet
  const used = Math.max(0, currentOdo - changed);
  const wearPct = life > 0 ? used / life : 0;
  const kmRemaining = life - used;
  const status = wearPct >= 1 ? "overdue" : wearPct >= 0.85 ? "due-soon" : "ok";
  return {
    life,
    changed,
    used,
    wearPct: Math.min(wearPct, 1.5),
    kmRemaining,
    status,
    message:
      kmRemaining < 0
        ? `${Math.abs(kmRemaining).toLocaleString()} km past tire life`
        : `${kmRemaining.toLocaleString()} km of tread left`,
    progress: Math.min(1, wearPct),
  };
}
