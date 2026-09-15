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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.MileageLog
import com.rhex.fleetflow.nativeapp.data.Pms
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mocha
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import java.time.LocalDate

/** Completed missions with their verified distances — mirrors src/pages/History.jsx. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(nav: NavHostController) {
    val brand = LocalBrand.current
    var from by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1).toString()) }
    var to by remember { mutableStateOf(LocalDate.now().toString()) }
    var trips by remember { mutableStateOf<List<TransportRequest>>(emptyList()) }
    var logs by remember { mutableStateOf<List<MileageLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        loading = true
        runCatching {
            trips = ServiceLocator.repo.completedMissions()
            logs = ServiceLocator.repo.mileageLogs()
        }
        loading = false
    }

    val start = Pms.parseDate(from) ?: LocalDate.now().withDayOfMonth(1)
    val end = Pms.parseDate(to) ?: LocalDate.now()
    val logByRequest = remember(logs) { logs.associateBy { it.requestId } }

    val inRange = remember(trips, from, to) {
        trips.filter {
            val d = Pms.parseDate(it.scheduleDate) ?: return@filter false
            !d.isBefore(start) && !d.isAfter(end)
        }
    }
    val totalKm = inRange.sumOf { logByRequest[it.id]?.distance ?: 0 }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Trip History") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = Cocoa,
                    navigationIconContentColor = brand.primary,
                ),
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentPadding = PaddingValues(
                start = 16.dp, end = 16.dp,
                top = padding.calculateTopPadding() + 12.dp, bottom = 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text("Completed transport missions", color = Taupe, fontSize = 12.sp)
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) { DateField(from, { from = it }, "From") }
                    Column(Modifier.weight(1f)) { DateField(to, { to = it }, "To") }
                }
            }
            item {
                Text(
                    "${inRange.size} trip${if (inRange.size == 1) "" else "s"} · ${totalKm} km total",
                    color = Cocoa,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            when {
                loading -> item { LoadingBlock() }
                inRange.isEmpty() -> item { EmptyState("No completed trips for this period") }
                else -> items(inRange.size) { i ->
                    val t = inRange[i]
                    val log = logByRequest[t.id]
                    SurfaceCard(onClick = { nav.navigate("${Routes.MISSION_DETAIL}/${t.id}") }) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    t.guestName,
                                    color = Cocoa,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (t.isErrand) {
                                    Text(
                                        "Errand · ${t.department ?: "Internal"}",
                                        color = brand.accentDark,
                                        fontSize = 11.sp,
                                    )
                                } else {
                                    Text(t.bookingType, color = Taupe, fontSize = 11.sp)
                                }
                                Text(
                                    "${prettyDate(t.scheduleDate)} · ${t.scheduleTime.take(5)}",
                                    color = Taupe,
                                    fontSize = 11.sp,
                                )
                                Text(
                                    "${t.pickupLocation.ifBlank { "—" }} → ${t.destination.ifBlank { "—" }}",
                                    color = Mocha,
                                    fontSize = 11.sp,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Text(
                                log?.distance?.let { "$it km" } ?: "— km",
                                color = brand.primary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}
