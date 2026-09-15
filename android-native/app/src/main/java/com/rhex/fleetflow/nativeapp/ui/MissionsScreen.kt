package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.Profile
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.data.Vocab
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Mocha
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.WeekFields
import java.util.Locale

private enum class RangeFilter(val label: String) {
    TODAY("Today"), WEEK("This Week"), MONTH("This Month"), ALL("All")
}

private enum class KindFilter(val label: String) { ALL("All"), GUEST("Guests"), ERRAND("Errands") }

/** Missions dashboard — mirrors src/pages/Missions.jsx. */
@Composable
fun MissionsScreen(profile: Profile, nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current

    var requests by remember { mutableStateOf<List<TransportRequest>>(emptyList()) }
    var vehicles by remember { mutableStateOf<List<Vehicle>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var range by remember { mutableStateOf(RangeFilter.TODAY) }
    var kind by remember { mutableStateOf(KindFilter.ALL) }
    var pendingDelete by remember { mutableStateOf<TransportRequest?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        loading = true
        runCatching {
            requests = ServiceLocator.repo.missions()
            vehicles = ServiceLocator.repo.vehicles()
        }
        loading = false
    }

    val plateOf = remember(vehicles) { vehicles.associate { it.id to it.plateNumber } }

    // Stat pills are recomputed from the raw rows on every render — never cached.
    val activeCount = requests.count { it.status == TransportRequest.STATUS_ONGOING }
    val pendingCount = requests.count { it.status == TransportRequest.STATUS_PENDING }

    val filtered = remember(requests, range, kind) { filterMissions(requests, range, kind) }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Welcome, ${profile.fullName.split(" ").firstOrNull().orEmpty().ifBlank { "there" }}",
                        color = Cocoa,
                        fontSize = 21.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text("Your transport missions dashboard", color = Taupe, fontSize = 12.sp)
                }
                CountPill(activeCount.toString(), "Active", brand.primary)
                Spacer(Modifier.width(8.dp))
                CountPill(pendingCount.toString(), "Pending", brand.accentDark)
            }
        }

        item {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                RangeFilter.values().forEach { f ->
                    FilterChip(
                        selected = range == f,
                        onClick = { range = f },
                        label = { Text(f.label, fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = brand.primary.copy(alpha = 0.16f),
                            selectedLabelColor = brand.primary,
                        ),
                    )
                }
            }
        }

        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier
                        .background(Mint, RoundedCornerShape(10.dp))
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    KindFilter.values().forEach { k ->
                        val selected = kind == k
                        Box(
                            Modifier
                                .background(
                                    if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
                                    RoundedCornerShape(8.dp),
                                )
                                .clickable { kind = k }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                        ) {
                            Text(
                                k.label,
                                color = if (selected) Cocoa else Taupe,
                                fontSize = 11.sp,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            )
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                Button(
                    onClick = { nav.navigate(Routes.NEW_BOOKING) },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                ) { Text("＋ New Booking", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
            }
        }

        when {
            loading -> item { LoadingBlock() }
            filtered.isEmpty() -> item { EmptyState("No missions found for this period") }
            else -> items(filtered.size) { index ->
                val r = filtered[index]
                MissionCard(
                    request = r,
                    plate = r.vehicleId?.let { plateOf[it] },
                    onClick = { nav.navigate("${Routes.MISSION_DETAIL}/${r.id}") },
                    onDelete = { pendingDelete = r },
                )
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete booking?") },
            text = { Text("This removes the booking for ${target.guestName} and its mileage log.") },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    scope.launch {
                        runCatching { ServiceLocator.repo.deleteMission(target.id) }
                        reloadKey++
                    }
                }) { Text("Delete", color = Danger) }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun CountPill(value: String, label: String, color: Color) {
    Column(
        Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, color = color, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(label, color = color, fontSize = 10.sp)
    }
}

@Composable
private fun MissionCard(
    request: TransportRequest,
    plate: String?,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val brand = LocalBrand.current
    SurfaceCard(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .size(36.dp)
                    .background(Mint, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (request.isErrand) "🧳" else Vocab.bookingIcon(request.bookingType),
                    color = brand.primary,
                    fontSize = 16.sp,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    request.guestName,
                    color = Cocoa,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    if (request.isErrand) "Errand · ${request.department ?: "Internal"}" else request.bookingType,
                    color = Taupe,
                    fontSize = 11.sp,
                )
            }
            Pill(request.status, missionStatusColor(request.status))
            Spacer(Modifier.width(6.dp))
            Text(
                "🗑",
                fontSize = 14.sp,
                modifier = Modifier
                    .clickable { onDelete() }
                    .padding(4.dp),
            )
        }

        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            MissionFact("Pickup", request.pickupLocation.ifBlank { "—" }, Modifier.weight(1f))
            MissionFact(
                "Schedule",
                "${prettyShortDate(request.scheduleDate)} ${request.scheduleTime.take(5)}".trim(),
                Modifier.weight(1f),
            )
            MissionFact("Vehicle", plate ?: "Unassigned", Modifier.weight(1f))
        }
    }
}

@Composable
private fun MissionFact(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, color = Taupe, fontSize = 10.sp)
        Text(value, color = Mocha, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Date + kind filtering, matching the useMemo in Missions.jsx. */
private fun filterMissions(
    rows: List<TransportRequest>,
    range: RangeFilter,
    kind: KindFilter,
): List<TransportRequest> {
    var out = when (kind) {
        KindFilter.ALL -> rows
        KindFilter.GUEST -> rows.filter { !it.isErrand }
        KindFilter.ERRAND -> rows.filter { it.isErrand }
    }
    if (range == RangeFilter.ALL) return out

    val today = LocalDate.now()
    val week = WeekFields.of(Locale.getDefault())
    out = out.filter { r ->
        val d = com.rhex.fleetflow.nativeapp.data.Pms.parseDate(r.scheduleDate) ?: return@filter false
        when (range) {
            RangeFilter.TODAY -> d == today
            RangeFilter.WEEK ->
                d.get(week.weekOfWeekBasedYear()) == today.get(week.weekOfWeekBasedYear()) &&
                    d.get(week.weekBasedYear()) == today.get(week.weekBasedYear())
            RangeFilter.MONTH -> d.month == today.month && d.year == today.year
            RangeFilter.ALL -> true
        }
    }
    return out
}
