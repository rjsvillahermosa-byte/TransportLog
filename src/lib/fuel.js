// ---------------------------------------------------------------------------
// Fuel integrity engine — explainable rules, no black box.
//
// Method follows fleet-industry practice:
//  • Consumption is computed FULL-TANK-TO-FULL-TANK (the "full-to-full"
//    method): distance between two full fills ÷ liters added in between
//    (partials accumulate into the next full fill). This is the only way to
//    get an honest km/L from pump receipts.
//  • Every fill is scored against per-fill rules (tank capacity, odometer
//    monotonicity, receipt ₱/L vs market band) and every segment against
//    efficiency rules (plausible km/L ceiling/floor vs the vehicle's rated
//    and observed baseline, z-score vs its own history, unaccounted distance
//    vs GPS/ODO-verified mission kilometers).
//  • Every flag carries its numbers, so a reviewer sees WHY it fired.
// ---------------------------------------------------------------------------

const CFG_KEY = "fleetflow:fuelcfg";

// Metro Manila pump bands (₱/L), Sept 2026 — GasWatch PH / DOE weekly monitor.
export const DEFAULT_FUEL_CONFIG = {
  gasoline: { min: 70, max: 90 },
  diesel: { min: 80, max: 95 },
};

export function getFuelConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return { ...DEFAULT_FUEL_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_FUEL_CONFIG };
}

export function saveFuelConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

const RULES = {
  tank_capacity: {
    severity: "red",
    title: "Ghost fill — more liters than the tank holds",
  },
  odo_reversed: {
    severity: "red",
    title: "Odometer did not advance since the last fill",
  },
  eff_high: {
    severity: "red",
    title: "Impossible efficiency — inflated liters or odometer mismatch",
  },
  eff_low: {
    severity: "red",
    title: "Abnormal thirst — underfilled receipt, siphoning, or a leak",
  },
  price_band: {
    severity: "amber",
    title: "Receipt price outside the market band",
  },
  pattern_outlier: {
    severity: "amber",
    title: "Statistical outlier vs this vehicle's own pattern",
  },
  unaccounted_km: {
    severity: "amber",
    title: "Unaccounted distance — kilometers with no verified mission",
  },
};

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * @param {Array} fills      FuelLog rows (any order)
 * @param {Array} vehicles   Vehicle rows (needs fuel_type, tank_liters, rated_km_per_liter)
 * @param {Array} mileageLogs MileageLog rows (verified distances for cross-check)
 * @param {Object} config    { gasoline:{min,max}, diesel:{min,max} } ₱/L bands
 * @returns fillAudits (per fill, with flags), segments (per full-to-full),
 *          vehicleSummaries (integrity score, avg km/L, spend)
 */
export function auditFuel(fills, vehicles, mileageLogs, config) {
  const cfg = config || getFuelConfig();
  const specs = new Map(vehicles.map((v) => [v.plate_number, v]));
  const byPlate = new Map();
  fills.forEach((f) => {
    if (!byPlate.has(f.vehicle_plate)) byPlate.set(f.vehicle_plate, []);
    byPlate.get(f.vehicle_plate).push(f);
  });

  const fillAudits = [];
  const segments = [];
  const summaries = [];

  for (const [plate, plateFills] of byPlate) {
    const spec = specs.get(plate) || {};
    const tank = Number(spec.tank_liters) || 60;
    const rated = Number(spec.rated_km_per_liter) || 9;
    const fuelType = spec.fuel_type || "diesel";
    const sorted = [...plateFills].sort(
      (a, b) => Number(a.odometer) - Number(b.odometer) || String(a.fill_date).localeCompare(String(b.fill_date))
    );

    const audits = new Map();
    sorted.forEach((f) => audits.set(f.id, { fill: f, flags: [] }));
    const histKmpl = []; // valid segment km/L history for z-score
    let seg = null; // open segment { startOdo, liters, fillIds, startDate }
    let prevFill = null;

    for (const f of sorted) {
      const a = audits.get(f.id);
      const liters = Number(f.liters) || 0;
      const pricePerL = liters > 0 ? Number(f.cost) / liters : 0;

      // --- per-fill rules -------------------------------------------------
      if (liters > tank) {
        a.flags.push({
          code: "tank_capacity",
          ...RULES.tank_capacity,
          detail: `${liters.toFixed(1)} L logged but the tank holds only ${tank} L.`,
        });
      }
      if (prevFill && Number(f.odometer) <= Number(prevFill.odometer)) {
        a.flags.push({
          code: "odo_reversed",
          ...RULES.odo_reversed,
          detail: `Odometer ${Number(f.odometer).toLocaleString()} km is not after the previous fill at ${Number(
            prevFill.odometer
          ).toLocaleString()} km.`,
        });
      }
      const band = cfg[fuelType];
      if (band && pricePerL > 0 && (pricePerL < band.min || pricePerL > band.max)) {
        a.flags.push({
          code: "price_band",
          ...RULES.price_band,
          detail: `₱${pricePerL.toFixed(2)}/L on this receipt vs the ${fuelType} band ₱${band.min}–${band.max}/L. Wrong amount encoded, or a suspicious receipt.`,
        });
      }

      // --- full-to-full segment accounting --------------------------------
      if (!seg) {
        if (f.full_tank) seg = { startOdo: Number(f.odometer), liters: 0, fillIds: [], startDate: f.fill_date };
        // fills before the first full fill have no baseline — no segment math
      } else {
        seg.liters += liters;
        seg.fillIds.push(f.id);
        if (f.full_tank) {
          const km = Number(f.odometer) - seg.startOdo;
          const kmpl = seg.liters > 0 ? km / seg.liters : 0;
          const segObj = {
            id: `seg-${f.id}`,
            vehicle_plate: plate,
            fromOdo: seg.startOdo,
            toOdo: Number(f.odometer),
            km,
            liters: seg.liters,
            kmpl,
            endDate: f.fill_date,
            fillsInSegment: seg.fillIds.length,
          };
          segments.push(segObj);

          // efficiency ceiling: rated spec + generous headroom, or own history
          const histMax = histKmpl.length ? Math.max(...histKmpl) : 0;
          const ceiling = Math.max(rated * 1.35, histMax > 0 ? histMax * 1.25 : 0);
          if (kmpl > ceiling) {
            a.flags.push({
              code: "eff_high",
              ...RULES.eff_high,
              detail: `${km} km on ${seg.liters.toFixed(1)} L = ${kmpl.toFixed(1)} km/L, above the plausible ceiling of ${ceiling.toFixed(
                1
              )} km/L (rated ${rated}). Either the liters were inflated on the receipt or the odometer reading is wrong.`,
            });
          }
          const histMean = histKmpl.length ? mean(histKmpl) : rated;
          const floor = Math.min(rated * 0.55, histMean * 0.6);
          if (kmpl < floor && km > 20) {
            a.flags.push({
              code: "eff_low",
              ...RULES.eff_low,
              detail: `${km} km on ${seg.liters.toFixed(1)} L = ${kmpl.toFixed(1)} km/L, below the floor of ${floor.toFixed(
                1
              )} km/L (rated ${rated}). Fuel may have been underfilled on the receipt, siphoned, or the vehicle has a problem.`,
            });
          }

          // z-score vs this vehicle's own clean history (≥3 segments)
          if (histKmpl.length >= 3) {
            const s = std(histKmpl);
            const z = s > 0 ? (kmpl - mean(histKmpl)) / s : 0;
            if (Math.abs(z) >= 2) {
              a.flags.push({
                code: "pattern_outlier",
                ...RULES.pattern_outlier,
                detail: `${kmpl.toFixed(1)} km/L is ${Math.abs(z).toFixed(1)}σ away from this vehicle's average of ${mean(
                  histKmpl
                ).toFixed(1)} km/L.`,
              });
            }
          }

          // cross-check vs verified mission kilometers in the same window.
          // Only fires on egregious gaps — everyday non-mission trips (repositioning,
          // refuel runs) are normal, so the threshold is deliberately high.
          const verifiedKm = mileageLogs
            .filter(
              (l) =>
                l.vehicle_plate === plate &&
                Number(l.start_odometer || 0) >= seg.startOdo &&
                Number(l.end_odometer || 0) <= Number(f.odometer)
            )
            .reduce((s2, l) => s2 + (Number(l.distance) || 0), 0);
          if (verifiedKm > 0 && km > 0 && (km - verifiedKm) / km > 0.6) {
            a.flags.push({
              code: "unaccounted_km",
              ...RULES.unaccounted_km,
              detail: `Odometer advanced ${km} km but only ${verifiedKm} km are covered by verified missions — ${Math.round(
                ((km - verifiedKm) / km) * 100
              )}% unaccounted. Possible personal use or unlogged trips.`,
            });
          }

          if (!a.flags.some((x) => x.code === "eff_high" || x.code === "eff_low")) histKmpl.push(kmpl);
          seg = { startOdo: Number(f.odometer), liters: 0, fillIds: [], startDate: f.fill_date };
        }
      }
      prevFill = f;
    }

    const plateAudits = sorted.map((f) => audits.get(f.id));
    fillAudits.push(...plateAudits);

    // integrity score over the last 10 fills
    const recent = plateAudits.slice(-10);
    const red = recent.reduce((n, a) => n + a.flags.filter((x) => x.severity === "red").length, 0);
    const amber = recent.reduce((n, a) => n + a.flags.filter((x) => x.severity === "amber").length, 0);
    const score = Math.max(0, 100 - red * 25 - amber * 10);
    const segs = segments.filter((s) => s.vehicle_plate === plate);
    summaries.push({
      vehicle_plate: plate,
      fuel_type: fuelType,
      rated_km_per_liter: rated,
      tank_liters: tank,
      integrityScore: score,
      avgKmpl: segs.length ? mean(segs.map((s) => s.kmpl)) : null,
      lastKmpl: segs.length ? segs[segs.length - 1].kmpl : null,
      totalSpend: plateFills.reduce((s, f) => s + (Number(f.cost) || 0), 0),
      totalLiters: plateFills.reduce((s, f) => s + (Number(f.liters) || 0), 0),
      fillCount: plateFills.length,
      flaggedCount: plateAudits.filter((a) => a.flags.length > 0).length,
    });
  }

  return { fillAudits, segments, vehicleSummaries: summaries };
}

export function severityStyle(severity) {
  return severity === "red"
    ? { chip: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", label: "High risk" }
    : { chip: "bg-accent/15 text-accent-dark border-accent/40", dot: "bg-accent", label: "Review" };
}

export function scoreStyle(score) {
  if (score >= 85) return { text: "text-brand", bar: "bg-brand", label: "Clean" };
  if (score >= 60) return { text: "text-accent-dark", bar: "bg-accent", label: "Watch" };
  return { text: "text-red-600", bar: "bg-red-500", label: "Investigate" };
}
