package com.rhex.fleetflow.nativeapp.data

import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Port of src/lib/fuel.js — the fuel integrity engine. Explainable rules, no
 * black box.
 *
 *  • Consumption is computed FULL-TANK-TO-FULL-TANK: distance between two full
 *    fills / liters added in between (partials accumulate into the next full
 *    fill). It is the only honest km/L you can get from pump receipts.
 *  • Every fill is scored against per-fill rules (tank capacity, odometer
 *    monotonicity, receipt ₱/L vs the market band) and every segment against
 *    efficiency rules (plausible km/L ceiling/floor vs rated + observed
 *    baseline, z-score vs its own history, unaccounted distance vs ODO-verified
 *    mission kilometers).
 *  • Every flag carries its numbers, so a reviewer sees WHY it fired.
 */

@Serializable
data class PriceBand(val min: Double, val max: Double)

@Serializable
data class FuelConfig(
    val gasoline: PriceBand = PriceBand(70.0, 90.0),
    val diesel: PriceBand = PriceBand(80.0, 95.0),
) {
    fun bandFor(fuelType: String?): PriceBand? = when (fuelType) {
        "gasoline" -> gasoline
        "diesel" -> diesel
        else -> null
    }

    companion object {
        /** Metro Manila pump bands (₱/L) — DOE / GasWatch PH weekly monitor. */
        val DEFAULT = FuelConfig()
    }
}

enum class Severity { RED, AMBER }

data class FuelFlag(
    val code: String,
    val severity: Severity,
    val title: String,
    val detail: String,
)

data class FillAudit(val fill: FuelLog, val flags: List<FuelFlag>) {
    val worst: Severity? = when {
        flags.any { it.severity == Severity.RED } -> Severity.RED
        flags.isNotEmpty() -> Severity.AMBER
        else -> null
    }
}

data class FuelSegment(
    val id: String,
    val vehicleId: String,
    val fromOdo: Int,
    val toOdo: Int,
    val km: Int,
    val liters: Double,
    val kmpl: Double,
    val endDate: String,
    val fillsInSegment: Int,
)

data class VehicleFuelSummary(
    val vehicleId: String,
    val plate: String,
    val fuelType: String,
    val ratedKmPerLiter: Double,
    val tankLiters: Double,
    val integrityScore: Int,
    val avgKmpl: Double?,
    val lastKmpl: Double?,
    val totalSpend: Double,
    val totalLiters: Double,
    val fillCount: Int,
    val flaggedCount: Int,
)

data class FuelAuditResult(
    val fillAudits: List<FillAudit>,
    val segments: List<FuelSegment>,
    val vehicleSummaries: List<VehicleFuelSummary>,
)

object FuelAuditor {

    private object Rules {
        const val TANK_CAPACITY = "Ghost fill — more liters than the tank holds"
        const val ODO_REVERSED = "Odometer did not advance since the last fill"
        const val EFF_HIGH = "Impossible efficiency — inflated liters or odometer mismatch"
        const val EFF_LOW = "Abnormal thirst — underfilled receipt, siphoning, or a leak"
        const val PRICE_BAND = "Receipt price outside the market band"
        const val PATTERN_OUTLIER = "Statistical outlier vs this vehicle's own pattern"
        const val UNACCOUNTED_KM = "Unaccounted distance — kilometers with no verified mission"
    }

    private fun mean(xs: List<Double>): Double = if (xs.isEmpty()) 0.0 else xs.sum() / xs.size

    private fun std(xs: List<Double>): Double {
        if (xs.size < 2) return 0.0
        val m = mean(xs)
        return sqrt(mean(xs.map { (it - m) * (it - m) }))
    }

    fun audit(
        fills: List<FuelLog>,
        vehicles: List<Vehicle>,
        mileageLogs: List<MileageLog>,
        config: FuelConfig = FuelConfig.DEFAULT,
    ): FuelAuditResult {
        val specs = vehicles.associateBy { it.id }
        val byVehicle = fills.groupBy { it.vehicleId }

        val fillAudits = mutableListOf<FillAudit>()
        val segments = mutableListOf<FuelSegment>()
        val summaries = mutableListOf<VehicleFuelSummary>()

        for ((vehicleId, vehicleFills) in byVehicle) {
            val spec = specs[vehicleId]
            val tank = spec?.tankLiters?.takeIf { it > 0 } ?: 60.0
            val rated = spec?.ratedKmPerLiter?.takeIf { it > 0 } ?: 9.0
            val fuelType = spec?.fuelType ?: "diesel"
            val plate = spec?.plateNumber ?: "Unknown vehicle"

            val sorted = vehicleFills.sortedWith(
                compareBy<FuelLog> { it.odometer }.thenBy { it.fillDate }
            )

            val flagsByFill = linkedMapOf<String, MutableList<FuelFlag>>()
            sorted.forEach { flagsByFill[it.id] = mutableListOf() }

            val histKmpl = mutableListOf<Double>() // clean segment history, for the z-score
            var segStartOdo: Int? = null
            var segLiters = 0.0
            var segFillCount = 0
            var prevFill: FuelLog? = null

            for (f in sorted) {
                val flags = flagsByFill.getValue(f.id)
                val liters = f.liters
                val pricePerL = if (liters > 0) f.cost / liters else 0.0

                // --- per-fill rules -------------------------------------------
                if (liters > tank) {
                    flags += FuelFlag(
                        "tank_capacity", Severity.RED, Rules.TANK_CAPACITY,
                        "%.1f L logged but the tank holds only %s L.".format(liters, tank.thousands()),
                    )
                }
                prevFill?.let { prev ->
                    if (f.odometer <= prev.odometer) {
                        flags += FuelFlag(
                            "odo_reversed", Severity.RED, Rules.ODO_REVERSED,
                            "Odometer ${f.odometer.thousands()} km is not after the previous fill at " +
                                "${prev.odometer.thousands()} km.",
                        )
                    }
                }
                val band = config.bandFor(fuelType)
                if (band != null && pricePerL > 0 && (pricePerL < band.min || pricePerL > band.max)) {
                    flags += FuelFlag(
                        "price_band", Severity.AMBER, Rules.PRICE_BAND,
                        "₱%.2f/L on this receipt vs the %s band ₱%s–%s/L. Wrong amount encoded, or a suspicious receipt."
                            .format(pricePerL, fuelType, band.min.thousands(), band.max.thousands()),
                    )
                }

                // --- full-to-full segment accounting ---------------------------
                val openSegStart = segStartOdo
                if (openSegStart == null) {
                    // Fills before the first full fill have no baseline — no segment math.
                    if (f.fullTank) {
                        segStartOdo = f.odometer
                        segLiters = 0.0
                        segFillCount = 0
                    }
                } else {
                    segLiters += liters
                    segFillCount += 1
                    if (f.fullTank) {
                        val startOdo = openSegStart
                        val km = f.odometer - startOdo
                        val kmpl = if (segLiters > 0) km / segLiters else 0.0
                        segments += FuelSegment(
                            id = "seg-${f.id}",
                            vehicleId = vehicleId,
                            fromOdo = startOdo,
                            toOdo = f.odometer,
                            km = km,
                            liters = segLiters,
                            kmpl = kmpl,
                            endDate = f.fillDate,
                            fillsInSegment = segFillCount,
                        )

                        // Efficiency ceiling: rated spec + generous headroom, or own history.
                        val histMax = histKmpl.maxOrNull() ?: 0.0
                        val ceiling = max(rated * 1.35, if (histMax > 0) histMax * 1.25 else 0.0)
                        if (kmpl > ceiling) {
                            flags += FuelFlag(
                                "eff_high", Severity.RED, Rules.EFF_HIGH,
                                "%s km on %.1f L = %.1f km/L, above the plausible ceiling of %.1f km/L (rated %s). Either the liters were inflated on the receipt or the odometer reading is wrong."
                                    .format(km.thousands(), segLiters, kmpl, ceiling, rated.trimNumber()),
                            )
                        }
                        val histMean = if (histKmpl.isEmpty()) rated else mean(histKmpl)
                        val floor = min(rated * 0.55, histMean * 0.6)
                        if (kmpl < floor && km > 20) {
                            flags += FuelFlag(
                                "eff_low", Severity.RED, Rules.EFF_LOW,
                                "%s km on %.1f L = %.1f km/L, below the floor of %.1f km/L (rated %s). Fuel may have been underfilled on the receipt, siphoned, or the vehicle has a problem."
                                    .format(km.thousands(), segLiters, kmpl, floor, rated.trimNumber()),
                            )
                        }

                        // z-score vs this vehicle's own clean history (>= 3 segments)
                        if (histKmpl.size >= 3) {
                            val s = std(histKmpl)
                            val z = if (s > 0) (kmpl - mean(histKmpl)) / s else 0.0
                            if (abs(z) >= 2) {
                                flags += FuelFlag(
                                    "pattern_outlier", Severity.AMBER, Rules.PATTERN_OUTLIER,
                                    "%.1f km/L is %.1fσ away from this vehicle's average of %.1f km/L."
                                        .format(kmpl, abs(z), mean(histKmpl)),
                                )
                            }
                        }

                        // Cross-check against ODO-verified mission kilometers in the same
                        // window. Only egregious gaps fire — repositioning and refuel runs
                        // are normal, so the threshold is deliberately high (60%).
                        val verifiedKm = mileageLogs
                            .filter {
                                it.vehicleId == vehicleId &&
                                    (it.startOdometer ?: 0) >= startOdo &&
                                    (it.endOdometer ?: 0) <= f.odometer
                            }
                            .sumOf { it.distance ?: 0 }
                        if (verifiedKm > 0 && km > 0 && (km - verifiedKm).toDouble() / km > 0.6) {
                            val pct = (((km - verifiedKm).toDouble() / km) * 100).roundToInt()
                            flags += FuelFlag(
                                "unaccounted_km", Severity.AMBER, Rules.UNACCOUNTED_KM,
                                "Odometer advanced ${km.thousands()} km but only ${verifiedKm.thousands()} km are covered by verified missions — $pct% unaccounted. Possible personal use or unlogged trips.",
                            )
                        }

                        if (flags.none { it.code == "eff_high" || it.code == "eff_low" }) histKmpl += kmpl

                        segStartOdo = f.odometer
                        segLiters = 0.0
                        segFillCount = 0
                    }
                }
                prevFill = f
            }

            val plateAudits = sorted.map { FillAudit(it, flagsByFill.getValue(it.id).toList()) }
            fillAudits += plateAudits

            // Integrity score over the last 10 fills.
            val recent = plateAudits.takeLast(10)
            val red = recent.sumOf { a -> a.flags.count { it.severity == Severity.RED } }
            val amber = recent.sumOf { a -> a.flags.count { it.severity == Severity.AMBER } }
            val score = max(0, 100 - red * 25 - amber * 10)
            val segs = segments.filter { it.vehicleId == vehicleId }

            summaries += VehicleFuelSummary(
                vehicleId = vehicleId,
                plate = plate,
                fuelType = fuelType,
                ratedKmPerLiter = rated,
                tankLiters = tank,
                integrityScore = score,
                avgKmpl = if (segs.isEmpty()) null else mean(segs.map { it.kmpl }),
                lastKmpl = segs.lastOrNull()?.kmpl,
                totalSpend = vehicleFills.sumOf { it.cost },
                totalLiters = vehicleFills.sumOf { it.liters },
                fillCount = vehicleFills.size,
                flaggedCount = plateAudits.count { it.flags.isNotEmpty() },
            )
        }

        return FuelAuditResult(
            fillAudits = fillAudits,
            segments = segments,
            vehicleSummaries = summaries.sortedByDescending { it.totalSpend },
        )
    }

    /** Clean / Watch / Investigate banding for an integrity score. */
    fun scoreLabel(score: Int): String = when {
        score >= 85 -> "Clean"
        score >= 60 -> "Watch"
        else -> "Investigate"
    }
}

/** "9.0" -> "9", "8.5" -> "8.5" — matches how the web app prints rated km/L. */
private fun Double.trimNumber(): String =
    if (this % 1.0 == 0.0) this.toLong().toString() else "%.1f".format(this)
