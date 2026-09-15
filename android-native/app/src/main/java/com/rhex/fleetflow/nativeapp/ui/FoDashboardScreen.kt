package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.MileageLog
import com.rhex.fleetflow.nativeapp.data.Pms
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.data.Vocab
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Front Office dashboard — mirrors src/pages/FoDashboard.jsx.
 *
 * Every number here is recomputed from the raw transport_requests and
 * mileage_logs rows on each render. Nothing reads a stored counter, so the
 * figures stay independently verifiable against the tables.
 */
@Composable
fun FoDashboardScreen() {
    val brand = LocalBrand.current

    var from by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1).toString()) }
    var to by remember { mutableStateOf(LocalDate.now().toString()) }
    var requests by remember { mutableStateOf<List<TransportRequest>>(emptyList()) }
    var logs by remember { mutableStateOf<List<MileageLog>>(emptyList()) }
    var vehicles by remember { mutableStateOf<List<Vehicle>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        loading = true
        runCatching {
            requests = ServiceLocator.repo.missions(500)
            logs = ServiceLocator.repo.mileageLogs()
            vehicles = ServiceLocator.repo.vehicles()
        }
        loading = false
    }

    val start = Pms.parseDate(from) ?: LocalDate.now().withDayOfMonth(1)
    val end = Pms.parseDate(to) ?: LocalDate.now()

    val reqsInRange = remember(requests, from, to) {
        requests.filter {
            val d = Pms.parseDate(it.scheduleDate) ?: return@filter false
            !d.isBefore(start) && !d.isAfter(end)
        }
    }
    val milesInRange = remember(logs, from, to) {
        logs.filter {
            val d = timeOutDate(it.timeOut) ?: return@filter false
            !d.isBefore(start) && !d.isAfter(end)
        }
    }

    val totalKm = milesInRange.sumOf { it.distance ?: 0 }
    val activeNow = reqsInRange.count { it.status == TransportRequest.STATUS_ONGOING }
    val completed = reqsInRange.count { it.status == TransportRequest.STATUS_COMPLETED }
    val pending = reqsInRange.count { it.status == TransportRequest.STATUS_PENDING }

    // Daily mileage, last 14 days.
    val daily = remember(milesInRange) {
        val fmt = DateTimeFormatter.ofPattern("MMM d")
        (13 downTo 0).map { offset ->
            val day = LocalDate.now().minusDays(offset.toLong())
            val kmThatDay = milesInRange
                .filter { timeOutDate(it.timeOut) == day }
                .sumOf { it.distance ?: 0 }
            BarDatum(fmt.format(day), kmThatDay.toDouble())
        }.filter { it.value > 0 }
    }

    val plateOf = remember(vehicles) { vehicles.associate { it.id to it.plateNumber } }

    val vehicleUsage = remember(milesInRange, plateOf) {
        milesInRange
            .groupBy { it.vehicleId }
            .map { (vid, rows) ->
                BarDatum(
                    plateOf[vid] ?: "Unassigned",
                    rows.sumOf { it.distance ?: 0 }.toDouble(),
                )
            }
            .filter { it.value > 0 }
            .sortedByDescending { it.value }
    }

    // Verified errand kilometers per department — the chargeback view.
    val byDepartment = remember(reqsInRange, logs) {
        val logByRequest = logs.associateBy { it.requestId }
        reqsInRange
            .filter { it.isErrand && !it.department.isNullOrBlank() }
            .groupBy { it.department!! }
            .map { (dept, rows) ->
                BarDatum(dept, rows.sumOf { (logByRequest[it.id]?.distance ?: 0) }.toDouble())
            }
            .filter { it.value > 0 }
            .sortedByDescending { it.value }
    }

    val errandCount = reqsInRange.count { it.isErrand }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Column {
                Text("Front Office Dashboard", color = Cocoa, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Text("Bookings & mileage by date range", color = Taupe, fontSize = 12.sp)
            }
        }

        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) { DateField(from, { from = it }, "From") }
                Column(Modifier.weight(1f)) { DateField(to, { to = it }, "To") }
            }
        }

        if (loading) {
            item { LoadingBlock() }
        } else {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile("%,d km".format(totalKm), "Total Mileage", "verified odometer", brand.primary, Modifier.weight(1f))
                    StatTile(activeNow.toString(), "Active Now", "ongoing", Cocoa, Modifier.weight(1f))
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(completed.toString(), "Completed", "in range", brand.primary, Modifier.weight(1f))
                    StatTile(pending.toString(), "Pending", "scheduled", brand.accentDark, Modifier.weight(1f))
                }
            }

            item {
                SurfaceCard {
                    Text("Daily Mileage — last 14 days", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    MiniBarChart(daily, brand.primary) { "%,.0f km".format(it) }
                }
            }

            item {
                SurfaceCard {
                    Text("Vehicle Usage", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    MiniBarChart(vehicleUsage, brand.primaryDark) { "%,.0f km".format(it) }
                }
            }

            item {
                SurfaceCard {
                    Text("Bookings by Type", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    MiniBarChart(
                        Vocab.BOOKING_TYPES.map { type ->
                            BarDatum(type, reqsInRange.count { it.bookingType == type }.toDouble())
                        } + BarDatum("Errands", errandCount.toDouble()),
                        brand.accent,
                    ) { "%,.0f".format(it) }
                }
            }

            item {
                SurfaceCard {
                    Text(
                        "Department Errand Mileage — verified km",
                        color = Cocoa,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(10.dp))
                    if (byDepartment.isEmpty()) EmptyState("No department errands in this period")
                    else MiniBarChart(byDepartment, brand.accentDark) { "%,.0f km".format(it) }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

/** mileage_logs.time_out is a timestamptz — reduce it to a local calendar day. */
private fun timeOutDate(timeOut: String?): LocalDate? {
    if (timeOut.isNullOrBlank()) return null
    return runCatching {
        java.time.Instant.parse(timeOut).atZone(ZoneId.systemDefault()).toLocalDate()
    }.getOrElse { Pms.parseDate(timeOut) }
}
