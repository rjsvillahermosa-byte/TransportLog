package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.FillAudit
import com.rhex.fleetflow.nativeapp.data.FuelAuditResult
import com.rhex.fleetflow.nativeapp.data.FuelAuditor
import com.rhex.fleetflow.nativeapp.data.FuelLog
import com.rhex.fleetflow.nativeapp.data.FuelLogPayload
import com.rhex.fleetflow.nativeapp.data.MileageLog
import com.rhex.fleetflow.nativeapp.data.Pms
import com.rhex.fleetflow.nativeapp.data.Severity
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.data.VehicleFuelSummary
import com.rhex.fleetflow.nativeapp.data.thousands
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Mocha
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Fuel & consumption — mirrors src/pages/Fuel.jsx. The audit itself lives in
 * data/FuelAudit.kt (the port of lib/fuel.js): full-to-full consumption plus the
 * per-fill and per-segment fraud rules, each flag carrying its own numbers.
 */
@Composable
fun FuelScreen() {
    var fills by remember { mutableStateOf<List<FuelLog>>(emptyList()) }
    var vehicles by remember { mutableStateOf<List<Vehicle>>(emptyList()) }
    var logs by remember { mutableStateOf<List<MileageLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showLogDialog by remember { mutableStateOf(false) }
    var selectedVehicleId by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        loading = true
        runCatching {
            fills = ServiceLocator.repo.fuelLogs()
            vehicles = ServiceLocator.repo.vehicles()
            logs = ServiceLocator.repo.mileageLogs()
        }
        loading = false
    }

    val config = remember(reloadKey) { ServiceLocator.repo.fuelConfigNow() }
    val audit = remember(fills, vehicles, logs, config) {
        FuelAuditor.audit(fills, vehicles, logs, config)
    }

    val brand = LocalBrand.current
    val selected = selectedVehicleId

    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("Fuel & Consumption", color = Cocoa, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                    Text(
                        if (selected != null) "Vehicle breakdown — full audit history"
                        else "Company summary · full-to-full audit with fraud flags",
                        color = Taupe,
                        fontSize = 12.sp,
                    )
                }
                Button(
                    onClick = { showLogDialog = true },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                ) { Text("＋ Log Fill-up", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
            }
        }

        if (loading) {
            item { LoadingBlock() }
        } else if (selected == null) {
            companySummary(audit, fills) { selectedVehicleId = it }
        } else {
            vehicleDetail(
                audit = audit,
                vehicle = vehicles.firstOrNull { it.id == selected },
                vehicleId = selected,
                onBack = { selectedVehicleId = null },
            )
        }

        item {
            Spacer(Modifier.height(6.dp))
            Text(
                "Audit rules: tank capacity · odometer sequence · impossible efficiency · abnormal thirst · " +
                    "market ₱/L band · statistical outlier · unaccounted km vs verified missions. " +
                    "Bands are configurable in Settings.",
                color = Taupe,
                fontSize = 10.sp,
            )
            Spacer(Modifier.height(16.dp))
        }
    }

    if (showLogDialog) {
        LogFillDialog(
            vehicles = vehicles,
            onDismiss = { showLogDialog = false },
            onSaved = { showLogDialog = false; reloadKey++ },
        )
    }
}

// ---------------------------------------------------------------------------
// Company summary
// ---------------------------------------------------------------------------

private fun androidx.compose.foundation.lazy.LazyListScope.companySummary(
    audit: FuelAuditResult,
    fills: List<FuelLog>,
    onSelectVehicle: (String) -> Unit,
) {
    val spendAll = fills.sumOf { it.cost }
    val litersAll = fills.sumOf { it.liters }
    val spend30d = fills
        .filter { (Pms.parseDate(it.fillDate) ?: LocalDate.MIN).isAfter(LocalDate.now().minusDays(30)) }
        .sumOf { it.cost }
    val auditedKm = audit.segments.sumOf { it.km }
    val fleetAvgKmpl = if (audit.segments.isEmpty()) 0.0
    else audit.segments.sumOf { it.kmpl } / audit.segments.size
    val costPerKm = if (auditedKm > 0) spendAll / auditedKm else 0.0
    val avgPrice = if (litersAll > 0) spendAll / litersAll else 0.0
    val redCount = audit.fillAudits.count { a -> a.flags.any { it.severity == Severity.RED } }
    val flaggedCount = audit.fillAudits.count { it.flags.isNotEmpty() }

    item {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTileWrapper(
                peso(spendAll), "Total fuel expense",
                "${peso(spend30d)} in the last 30 days", null, Modifier.weight(1f),
            )
            StatTileWrapper(
                "%,.0f L".format(litersAll), "Total liters",
                "avg ₱%.2f/L paid".format(avgPrice), null, Modifier.weight(1f),
            )
        }
    }
    item {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTileWrapper(
                if (fleetAvgKmpl > 0) "%.1f".format(fleetAvgKmpl) else "—",
                "Fleet avg km/L", "${auditedKm.thousands()} audited km", null, Modifier.weight(1f),
            )
            StatTileWrapper(
                if (costPerKm > 0) "₱%.2f".format(costPerKm) else "—",
                "Cost per km", "$flaggedCount flagged · $redCount high-risk",
                if (redCount > 0) Danger else null, Modifier.weight(1f),
            )
        }
    }

    item {
        SurfaceCard {
            Text("Monthly Fuel Spend", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("Company-wide, last 6 months", color = Taupe, fontSize = 11.sp)
            Spacer(Modifier.height(10.dp))
            val fmt = DateTimeFormatter.ofPattern("MMM")
            val monthly = (5 downTo 0).map { back ->
                val month = LocalDate.now().minusMonths(back.toLong())
                val total = fills.filter {
                    val d = Pms.parseDate(it.fillDate)
                    d != null && d.month == month.month && d.year == month.year
                }.sumOf { it.cost }
                BarDatum(fmt.format(month), total)
            }
            MiniBarChartHost(monthly)
        }
    }

    item {
        SurfaceCard {
            Text("Expense Share by Vehicle", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("Who is burning the budget", color = Taupe, fontSize = 11.sp)
            Spacer(Modifier.height(10.dp))
            val share = audit.vehicleSummaries.filter { it.totalSpend > 0 }
            if (share.isEmpty()) {
                EmptyState("No fuel expenses logged yet")
            } else {
                val total = share.sumOf { it.totalSpend }
                share.forEach { s ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onSelectVehicle(s.vehicleId) }
                            .padding(vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(s.plate, color = Cocoa, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(peso(s.totalSpend), color = Mocha, fontSize = 12.sp)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "${((s.totalSpend / total) * 100).toInt()}%",
                            color = Taupe,
                            fontSize = 11.sp,
                            modifier = Modifier.width(38.dp),
                        )
                    }
                }
            }
        }
    }

    item { SectionHeading("Vehicle breakdown", "Tap a vehicle for its full audit") }

    if (audit.vehicleSummaries.isEmpty()) {
        item { EmptyState("Log a fill-up to start the consumption audit") }
    } else {
        items(audit.vehicleSummaries.size) { i ->
            val s = audit.vehicleSummaries[i]
            VehicleFuelCard(s, audit) { onSelectVehicle(s.vehicleId) }
        }
    }
}

@Composable
private fun StatTileWrapper(
    value: String,
    label: String,
    sub: String,
    tone: Color?,
    modifier: Modifier = Modifier,
) {
    StatTile(value, label, sub, tone ?: LocalBrand.current.primary, modifier)
}

@Composable
private fun MiniBarChartHost(data: List<BarDatum>) {
    MiniBarChart(data.filter { it.value > 0 }, LocalBrand.current.primary) { peso(it) }
}

@Composable
private fun VehicleFuelCard(summary: VehicleFuelSummary, audit: FuelAuditResult, onClick: () -> Unit) {
    val brand = LocalBrand.current
    val segs = audit.segments.filter { it.vehicleId == summary.vehicleId }
    val km = segs.sumOf { it.km }
    val cpk = if (km > 0) summary.totalSpend / km else null
    val scoreColor = when {
        summary.integrityScore >= 85 -> brand.primary
        summary.integrityScore >= 60 -> brand.accentDark
        else -> Danger
    }

    SurfaceCard(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(summary.plate, color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "${summary.fuelType} · rated ${summary.ratedKmPerLiter} km/L · ${summary.fillCount} fills",
                    color = Taupe,
                    fontSize = 11.sp,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    summary.integrityScore.toString(),
                    color = scoreColor,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(FuelAuditor.scoreLabel(summary.integrityScore), color = scoreColor, fontSize = 10.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        ProgressBar(summary.integrityScore / 100f, scoreColor)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MiniFact(peso(summary.totalSpend), "spend", Modifier.weight(1f))
            MiniFact(summary.avgKmpl?.let { "%.1f".format(it) } ?: "—", "km/L avg", Modifier.weight(1f))
            MiniFact(cpk?.let { "₱%.1f".format(it) } ?: "—", "per km", Modifier.weight(1f))
        }
        if (summary.flaggedCount > 0) {
            Spacer(Modifier.height(8.dp))
            Pill("⚠ ${summary.flaggedCount} flagged fill(s)", Danger)
        }
    }
}

@Composable
private fun MiniFact(value: String, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(Mint, RoundedCornerShape(10.dp))
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, color = Cocoa, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Taupe, fontSize = 9.sp)
    }
}

// ---------------------------------------------------------------------------
// Per-vehicle detail
// ---------------------------------------------------------------------------

private fun androidx.compose.foundation.lazy.LazyListScope.vehicleDetail(
    audit: FuelAuditResult,
    vehicle: Vehicle?,
    vehicleId: String,
    onBack: () -> Unit,
) {
    val summary = audit.vehicleSummaries.firstOrNull { it.vehicleId == vehicleId }
    if (summary == null) {
        item { EmptyState("No fuel data for this vehicle") }
        return
    }
    val myFills = audit.fillAudits
        .filter { it.fill.vehicleId == vehicleId }
        .sortedByDescending { it.fill.odometer }
    val myFlags = myFills.filter { it.flags.isNotEmpty() }
    val segs = audit.segments.filter { it.vehicleId == vehicleId }.sortedBy { it.toOdo }
    val km = segs.sumOf { it.km }
    val cpk = if (km > 0) summary.totalSpend / km else null

    item {
        Text(
            "← All vehicles",
            color = Cocoa,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clickable { onBack() }
                .padding(vertical = 4.dp),
        )
    }

    item {
        SurfaceCard {
            Text(summary.plate, color = Cocoa, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(
                "${vehicle?.label ?: ""} · ${summary.fuelType} · tank ${summary.tankLiters.toInt()} L · " +
                    "rated ${summary.ratedKmPerLiter} km/L",
                color = Taupe,
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Integrity ${summary.integrityScore} · ${FuelAuditor.scoreLabel(summary.integrityScore)}",
                color = Cocoa,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }

    item {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTileWrapper(
                peso(summary.totalSpend), "Total spend",
                "%,.0f L purchased".format(summary.totalLiters), null, Modifier.weight(1f),
            )
            StatTileWrapper(
                summary.avgKmpl?.let { "%.1f".format(it) } ?: "—", "Avg km/L",
                "rated ${summary.ratedKmPerLiter}", null, Modifier.weight(1f),
            )
        }
    }
    item {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTileWrapper(
                cpk?.let { "₱%.2f".format(it) } ?: "—", "Cost per km",
                "${km.thousands()} audited km", null, Modifier.weight(1f),
            )
            StatTileWrapper(
                summary.flaggedCount.toString(), "Flagged fills",
                "of ${summary.fillCount} total",
                if (summary.flaggedCount > 0) Danger else null, Modifier.weight(1f),
            )
        }
    }

    if (myFlags.isNotEmpty()) {
        item { SectionHeading("Flags — tap for the evidence") }
        items(myFlags.size) { i -> FlagCard(myFlags[i]) }
    }

    item { SectionHeading("Full fill-up history") }
    if (myFills.isEmpty()) {
        item { EmptyState("No fill-ups logged for this vehicle") }
    } else {
        items(myFills.size) { i ->
            val a = myFills[i]
            val pricePerL = if (a.fill.liters > 0) a.fill.cost / a.fill.liters else 0.0
            SurfaceCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(prettyDate(a.fill.fillDate), color = Cocoa, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${a.fill.odometer.thousands()} km · %.1f L · ₱%.2f/L · %s"
                                .format(a.fill.liters, pricePerL, a.fill.station ?: "—"),
                            color = Taupe,
                            fontSize = 11.sp,
                        )
                    }
                    if (a.flags.isEmpty()) Pill("✓ clean", LocalBrand.current.primary)
                    else Pill(
                        "⚠ ${a.flags.size}",
                        if (a.worst == Severity.RED) Danger else LocalBrand.current.accentDark,
                    )
                }
            }
        }
    }

    if (segs.isNotEmpty()) {
        item { SectionHeading("Full-to-full segments", "Distance between full fills ÷ liters added") }
        items(segs.size) { i ->
            val s = segs[i]
            val bad = s.kmpl > summary.ratedKmPerLiter * 1.35 ||
                (s.kmpl < summary.ratedKmPerLiter * 0.55 && s.km > 20)
            SurfaceCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${s.fromOdo.thousands()} → ${s.toOdo.thousands()} km",
                        color = Mocha,
                        fontSize = 12.sp,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "${s.km.thousands()} km · %.1f L".format(s.liters),
                        color = Taupe,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "%.1f km/L".format(s.kmpl),
                        color = if (bad) Danger else LocalBrand.current.primary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

/** One flagged fill, expandable to the rule detail that fired. */
@Composable
private fun FlagCard(audit: FillAudit) {
    var expanded by remember { mutableStateOf(false) }
    val color = if (audit.worst == Severity.RED) Danger else LocalBrand.current.accentDark
    SurfaceCard(onClick = { expanded = !expanded }) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${prettyDate(audit.fill.fillDate)} · ${audit.fill.odometer.thousands()} km",
                    color = Cocoa,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "%.1f L · %s · %s".format(audit.fill.liters, peso(audit.fill.cost), audit.fill.station ?: "—"),
                    color = Taupe,
                    fontSize = 11.sp,
                )
            }
            Pill("${audit.flags.size} flag(s)", color)
        }
        if (expanded) {
            Spacer(Modifier.height(10.dp))
            audit.flags.forEach { f ->
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    Box(
                        Modifier
                            .padding(top = 5.dp, end = 8.dp)
                            .height(8.dp)
                            .width(8.dp)
                            .background(
                                if (f.severity == Severity.RED) Danger else LocalBrand.current.accentDark,
                                RoundedCornerShape(50),
                            ),
                    )
                    Column {
                        Text(f.title, color = Cocoa, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Text(f.detail, color = Taupe, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Log fill-up
// ---------------------------------------------------------------------------

@Composable
private fun LogFillDialog(vehicles: List<Vehicle>, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current
    val config = remember { ServiceLocator.repo.fuelConfigNow() }

    var vehicleId by remember { mutableStateOf(vehicles.firstOrNull()?.id.orEmpty()) }
    var fillDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var odometer by remember { mutableStateOf("") }
    var liters by remember { mutableStateOf("") }
    var cost by remember { mutableStateOf("") }
    var fullTank by remember { mutableStateOf(true) }
    var station by remember { mutableStateOf("") }
    var receiptPhoto by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val vehicle = vehicles.firstOrNull { it.id == vehicleId }
    val litersValue = liters.toDoubleOrNull() ?: 0.0
    val costValue = cost.toDoubleOrNull() ?: 0.0
    val pricePerL = if (litersValue > 0) costValue / litersValue else 0.0
    val band = config.bandFor(vehicle?.fuelType)
    val priceOk = band == null || pricePerL <= 0 || (pricePerL >= band.min && pricePerL <= band.max)

    FormDialog(
        title = "Log Fill-up",
        onDismiss = onDismiss,
        primaryLabel = "Save Fill-up",
        primaryEnabled = vehicleId.isNotBlank() && odometer.isNotBlank() &&
            litersValue > 0 && costValue > 0,
        busy = busy,
        error = error,
        onPrimary = {
            busy = true
            error = null
            scope.launch {
                val payload = FuelLogPayload(
                    vehicleId = vehicleId,
                    fillDate = fillDate,
                    odometer = odometer.toIntOrNull() ?: 0,
                    liters = litersValue,
                    cost = costValue,
                    fullTank = fullTank,
                    station = station.trim().ifBlank { null },
                    encodedBy = ServiceLocator.repo.savedProfileNow()?.fullName ?: "Front Office",
                )
                val result = runCatching { ServiceLocator.repo.createFuelLog(payload, receiptPhoto) }
                busy = false
                result.fold(
                    onSuccess = { onSaved() },
                    onFailure = { error = it.message ?: "Could not save the fill-up." },
                )
            }
        },
    ) {
        PickerField(
            label = "Vehicle *",
            value = vehicleId,
            options = vehicles.map { it.id to "${it.plateNumber} — ${it.label}" },
            onSelect = { vehicleId = it },
        )
        Spacer(Modifier.height(10.dp))
        DateField(fillDate, { fillDate = it }, "Date *")
        Spacer(Modifier.height(10.dp))
        FormField(odometer, { odometer = it }, "Odometer (km) *", keyboardType = KeyboardType.Number, placeholder = "38420")
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                FormField(liters, { liters = it }, "Liters *", keyboardType = KeyboardType.Decimal)
            }
            Box(Modifier.weight(1f)) {
                FormField(cost, { cost = it }, "Total cost (₱) *", keyboardType = KeyboardType.Decimal)
            }
        }

        if (pricePerL > 0 && band != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                "₱%.2f/L %s".format(
                    pricePerL,
                    if (priceOk) "— within the ${vehicle?.fuelType} band (₱${band.min.toInt()}–${band.max.toInt()}/L) ✓"
                    else "— OUTSIDE the ${vehicle?.fuelType} band (₱${band.min.toInt()}–${band.max.toInt()}/L); this fill will be flagged ⚠",
                ),
                color = if (priceOk) brand.primary else Danger,
                fontSize = 11.sp,
            )
        }

        Spacer(Modifier.height(10.dp))
        FormField(station, { station = it }, "Station", placeholder = "Shell EDSA")
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = fullTank,
                onCheckedChange = { fullTank = it },
                colors = CheckboxDefaults.colors(checkedColor = brand.primary),
            )
            Column {
                Text("Full tank", color = Cocoa, fontSize = 13.sp)
                Text(
                    "Full-to-full is what makes the km/L honest — leave this on whenever the tank was filled.",
                    color = Taupe,
                    fontSize = 10.sp,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        PhotoSlotPublic(
            label = "Attach receipt photo",
            sub = "Optional — kept with the fill for review",
            capturedPath = receiptPhoto,
            onCaptured = { receiptPhoto = it },
            onClear = { receiptPhoto = null },
        )
    }
}

/** Small wrapper so the fuel dialog can reuse the fleet dialogs' photo slot look. */
@Composable
private fun PhotoSlotPublic(
    label: String,
    sub: String,
    capturedPath: String?,
    onCaptured: (String) -> Unit,
    onClear: () -> Unit,
) {
    val takePhoto = rememberPhotoCapture(onCaptured = onCaptured)
    if (capturedPath == null) {
        CaptureZone(title = label, sub = sub, onClick = takePhoto)
    } else {
        Box(Modifier.fillMaxWidth()) {
            RemoteImage(
                capturedPath, label,
                Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .clip(RoundedCornerShape(14.dp)),
            )
            Text(
                "Remove",
                color = Danger,
                fontSize = 11.sp,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .background(Color.White.copy(alpha = 0.92f), RoundedCornerShape(50))
                    .clickable { onClear() }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    }
}
