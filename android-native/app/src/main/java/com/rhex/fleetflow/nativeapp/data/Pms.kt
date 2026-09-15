package com.rhex.fleetflow.nativeapp.data

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Port of src/lib/pms.js.
 *
 * PMS (Preventive Maintenance Schedule) — casa-standard intervals suggested from
 * the vehicle model, due when KM *or* months elapse, whichever comes first. The
 * current odometer is derived from the app's own verified streams: mission end
 * odometers and fuel-fill readings. Registration / insurance / licences are pure
 * calendar renewals; tire wear is odometer-based.
 */

enum class DueStatus { OVERDUE, DUE_SOON, OK }

data class PmsTemplate(val pattern: Regex, val intervalKm: Int, val intervalMonths: Int, val label: String)

object Pms {

    private val MODEL_TEMPLATES = listOf(
        PmsTemplate(
            Regex("hiace|grandia|starex|h-?100|van|urgent|traviz|cargo", RegexOption.IGNORE_CASE),
            10000, 6, "Casa standard — van/commercial diesel: 10,000 km / 6 mo",
        ),
        PmsTemplate(
            Regex("vios|city|corolla|civic|accent|altis|sedan|mazda|mirage", RegexOption.IGNORE_CASE),
            10000, 6, "Casa standard — sedan: 10,000 km / 6 mo",
        ),
        PmsTemplate(
            Regex("innova|rush|monsuno|mobility|avanza|xpander|suv", RegexOption.IGNORE_CASE),
            10000, 6, "Casa standard — AUV/SUV: 10,000 km / 6 mo",
        ),
        PmsTemplate(
            Regex("ev|electric|leaf|byd|model\\s?3", RegexOption.IGNORE_CASE),
            20000, 12, "EV standard: 20,000 km / 12 mo",
        ),
    )

    val DEFAULT = PmsTemplate(Regex("^$"), 5000, 6, "Conservative default: 5,000 km / 6 mo")

    /** Services that must NOT reset the change-oil clock. */
    private val NON_PMS_TYPES = setOf("Tire Replacement", "Registration Renewal", "Repair")

    private val DISPLAY = DateTimeFormatter.ofPattern("MMM d, yyyy")

    fun suggest(model: String?): PmsTemplate =
        MODEL_TEMPLATES.firstOrNull { it.pattern.containsMatchIn(model.orEmpty()) } ?: DEFAULT

    /** Parses a Postgres date/timestamp string leniently; null when unusable. */
    fun parseDate(value: String?): LocalDate? {
        val raw = value?.trim().orEmpty()
        if (raw.isBlank()) return null
        return runCatching { LocalDate.parse(raw.take(10)) }.getOrNull()
    }

    fun formatDate(date: LocalDate): String = DISPLAY.format(date)

    fun formatDate(value: String?): String = parseDate(value)?.let { DISPLAY.format(it) } ?: "—"

    /** Latest known odometer for a vehicle, from mission end-odometers + fuel fills. */
    fun currentOdometer(
        vehicleId: String,
        mileageLogs: List<MileageLog>,
        fuelLogs: List<FuelLog>,
    ): OdoReading {
        val fromMissions = mileageLogs
            .filter { it.vehicleId == vehicleId && it.endOdometer != null }
            .maxOfOrNull { it.endOdometer ?: 0 } ?: 0
        val fromFuel = fuelLogs
            .filter { it.vehicleId == vehicleId }
            .maxOfOrNull { it.odometer } ?: 0
        val odo = max(fromMissions, fromFuel)
        val source = when {
            odo == 0 -> null
            fromFuel > fromMissions -> "fuel log"
            else -> "missions"
        }
        return OdoReading(odo, source)
    }

    /** Whichever-comes-first PMS status for one vehicle. */
    fun computePmsStatus(
        vehicle: Vehicle,
        serviceLogs: List<ServiceLog>,
        currentOdo: Int,
        today: LocalDate = LocalDate.now(),
    ): PmsStatus {
        val suggestion = suggest(vehicle.model)
        val intervalKm = vehicle.pmsIntervalKm?.takeIf { it > 0 } ?: suggestion.intervalKm
        val intervalMonths = vehicle.pmsIntervalMonths?.takeIf { it > 0 } ?: suggestion.intervalMonths

        val last = serviceLogs
            .filter {
                it.vehicleId == vehicle.id &&
                    it.serviceDate.isNotBlank() &&
                    it.serviceType !in NON_PMS_TYPES
            }
            .sortedByDescending { parseDate(it.serviceDate) ?: LocalDate.MIN }
            .firstOrNull()

        val baseOdo = last?.odometerAtService ?: 0
        val baseDate = parseDate(last?.serviceDate)
            ?: (parseDate(vehicle.createdAt) ?: today).minusMonths(intervalMonths.toLong())

        val kmDueAt = baseOdo + intervalKm
        val dateDueAt = baseDate.plusMonths(intervalMonths.toLong())

        val kmRemaining = kmDueAt - currentOdo
        val daysRemaining = ChronoUnit.DAYS.between(today, dateDueAt).toInt()

        val kmOver = kmRemaining <= 0
        val timeOver = daysRemaining <= 0
        val kmSoon = kmRemaining <= 1000
        val timeSoon = daysRemaining <= 14

        val status = when {
            kmOver || timeOver -> DueStatus.OVERDUE
            kmSoon || timeSoon -> DueStatus.DUE_SOON
            else -> DueStatus.OK
        }

        // Whichever comes first wins the message.
        var basis: String? = null
        var message: String? = null
        if (status != DueStatus.OK) {
            val kmFirst = kmRemaining <= daysRemaining
            if (kmOver || (status == DueStatus.DUE_SOON && kmSoon && (!timeSoon || kmFirst))) {
                basis = "km"
                message = if (kmOver) "Overdue by ${abs(kmRemaining).thousands()} km"
                else "Due in ${kmRemaining.thousands()} km"
            } else {
                basis = "months"
                message = if (timeOver) "Overdue by ${abs(daysRemaining)} ${dayWord(abs(daysRemaining))}"
                else "Due in $daysRemaining ${dayWord(daysRemaining)}"
            }
        }

        return PmsStatus(
            intervalKm = intervalKm,
            intervalMonths = intervalMonths,
            lastService = last,
            baseOdo = baseOdo,
            kmDueAt = kmDueAt,
            dateDueAt = formatDate(dateDueAt),
            kmRemaining = kmRemaining,
            daysRemaining = daysRemaining,
            kmProgress = if (intervalKm > 0)
                min(1f, max(0f, (currentOdo - baseOdo).toFloat() / intervalKm)) else 0f,
            timeProgress = min(1f, max(0f, 1f - daysRemaining / (intervalMonths * 30.4f))),
            status = status,
            basis = basis,
            message = message,
        )
    }

    /**
     * Calendar renewals — registration (OR/CR), insurance, driver's licence.
     * 60 days of warning gives procurement time for government renewals.
     */
    fun computeRenewal(
        dateStr: String?,
        soonDays: Int = 60,
        today: LocalDate = LocalDate.now(),
    ): Renewal? {
        val due = parseDate(dateStr) ?: return null
        val daysRemaining = ChronoUnit.DAYS.between(today, due).toInt()
        val status = when {
            daysRemaining < 0 -> DueStatus.OVERDUE
            daysRemaining <= soonDays -> DueStatus.DUE_SOON
            else -> DueStatus.OK
        }
        return Renewal(
            dueDate = formatDate(due),
            daysRemaining = daysRemaining,
            status = status,
            message = when {
                daysRemaining < 0 -> "Overdue by ${abs(daysRemaining)} ${dayWord(abs(daysRemaining))}"
                daysRemaining <= soonDays -> "Due in $daysRemaining ${dayWord(daysRemaining)}"
                else -> "$daysRemaining days left"
            },
            progress = min(1f, max(0f, 1f - daysRemaining / 365f)),
        )
    }

    /**
     * Tire wear — odometer-based. Logging a "Tire Replacement" service updates
     * tire_changed_odometer and wear restarts. Due-soon at 85% of life.
     */
    fun computeTireWear(vehicle: Vehicle, currentOdo: Int): TireWear? {
        val life = vehicle.tireLifeKm?.takeIf { it > 0 } ?: 40000
        val changed = vehicle.tireChangedOdometer ?: 0
        if (changed <= 0) return null // never replaced / not tracked yet
        val used = max(0, currentOdo - changed)
        val wearPct = used.toFloat() / life
        val kmRemaining = life - used
        val status = when {
            wearPct >= 1f -> DueStatus.OVERDUE
            wearPct >= 0.85f -> DueStatus.DUE_SOON
            else -> DueStatus.OK
        }
        return TireWear(
            life = life,
            changed = changed,
            used = used,
            kmRemaining = kmRemaining,
            status = status,
            message = if (kmRemaining < 0) "${abs(kmRemaining).thousands()} km past tire life"
            else "${kmRemaining.thousands()} km of tread left",
            progress = min(1f, wearPct),
        )
    }

    private fun dayWord(n: Int) = if (n == 1) "day" else "days"
}

data class OdoReading(val odo: Int, val source: String?)

data class PmsStatus(
    val intervalKm: Int,
    val intervalMonths: Int,
    val lastService: ServiceLog?,
    val baseOdo: Int,
    val kmDueAt: Int,
    val dateDueAt: String,
    val kmRemaining: Int,
    val daysRemaining: Int,
    val kmProgress: Float,
    val timeProgress: Float,
    val status: DueStatus,
    val basis: String?,
    val message: String?,
)

data class Renewal(
    val dueDate: String,
    val daysRemaining: Int,
    val status: DueStatus,
    val message: String,
    val progress: Float,
)

data class TireWear(
    val life: Int,
    val changed: Int,
    val used: Int,
    val kmRemaining: Int,
    val status: DueStatus,
    val message: String,
    val progress: Float,
)

/** One row of the unified renewals board (PMS + reg + insurance + tires + licences). */
data class RenewalItem(
    val key: String,
    val kind: RenewalKind,
    val title: String,
    val entity: String,
    val detail: String,
    val sub: String?,
    val status: DueStatus,
    val progress: Float?,
    /** Vehicle id for the inline "Log" action (PMS rows only). */
    val logForVehicleId: String? = null,
)

enum class RenewalKind { PMS, REGISTRATION, INSURANCE, TIRE, LICENSE }

/** 1,234 formatting without pulling in a locale-specific NumberFormat everywhere. */
fun Int.thousands(): String = "%,d".format(this)

fun Double.thousands(): String = "%,.0f".format(this)
