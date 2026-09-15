package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.Driver
import com.rhex.fleetflow.nativeapp.data.DueStatus
import com.rhex.fleetflow.nativeapp.data.FuelLog
import com.rhex.fleetflow.nativeapp.data.MileageLog
import com.rhex.fleetflow.nativeapp.data.Pms
import com.rhex.fleetflow.nativeapp.data.RenewalItem
import com.rhex.fleetflow.nativeapp.data.RenewalKind
import com.rhex.fleetflow.nativeapp.data.ServiceLog
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.data.thousands
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Mocha
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch

private enum class FleetTab(val label: String) {
    DRIVERS("Drivers"), VEHICLES("Vehicles"), RENEWALS("Renewals"), SERVICES("Service Logs")
}

private enum class DeleteKind { DRIVER, VEHICLE, SERVICE }

private data class PendingDelete(val label: String, val kind: DeleteKind, val id: String)

/** Fleet management — mirrors src/pages/Fleet.jsx (drivers, vehicles, renewals, service logs). */
@Composable
fun FleetScreen() {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current

    var tab by remember { mutableStateOf(FleetTab.DRIVERS) }
    var drivers by remember { mutableStateOf<List<Driver>>(emptyList()) }
    var vehicles by remember { mutableStateOf<List<Vehicle>>(emptyList()) }
    var services by remember { mutableStateOf<List<ServiceLog>>(emptyList()) }
    var mileage by remember { mutableStateOf<List<MileageLog>>(emptyList()) }
    var fuel by remember { mutableStateOf<List<FuelLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var reloadKey by remember { mutableStateOf(0) }

    var editingDriver by remember { mutableStateOf<Driver?>(null) }
    var showDriverDialog by remember { mutableStateOf(false) }
    var editingVehicle by remember { mutableStateOf<Vehicle?>(null) }
    var showVehicleDialog by remember { mutableStateOf(false) }
    var serviceDialogVehicleId by remember { mutableStateOf<String?>(null) }
    var showServiceDialog by remember { mutableStateOf(false) }
    var assetRecordVehicle by remember { mutableStateOf<Vehicle?>(null) }
    var confirmDelete by remember { mutableStateOf<PendingDelete?>(null) }

    LaunchedEffect(reloadKey) {
        loading = true
        runCatching {
            vehicles = ServiceLocator.repo.vehicles()
            drivers = ServiceLocator.repo.drivers()
            services = ServiceLocator.repo.serviceLogs()
            mileage = ServiceLocator.repo.mileageLogs()
            fuel = ServiceLocator.repo.fuelLogs()
        }
        loading = false
    }

    // Current odometer + PMS state per vehicle, then the unified renewals board.
    val odoByVehicle = remember(vehicles, mileage, fuel) {
        vehicles.associate { it.id to Pms.currentOdometer(it.id, mileage, fuel) }
    }
    val renewals = remember(vehicles, drivers, services, odoByVehicle) {
        buildRenewals(vehicles, drivers, services, odoByVehicle)
    }
    val attentionCount = renewals.count { it.status != DueStatus.OK }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Column {
                Text("Fleet Management", color = Cocoa, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Text("Drivers, vehicles, renewals & service records", color = Taupe, fontSize = 12.sp)
            }
        }

        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { serviceDialogVehicleId = null; showServiceDialog = true },
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier.weight(1f),
                ) { Text("Log Service", fontSize = 11.sp, color = brand.primary) }
                OutlinedButton(
                    onClick = { editingVehicle = null; showVehicleDialog = true },
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier.weight(1f),
                ) { Text("＋ Vehicle", fontSize = 11.sp, color = brand.primary) }
                Button(
                    onClick = { editingDriver = null; showDriverDialog = true },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier.weight(1f),
                ) { Text("＋ Driver", fontSize = 11.sp) }
            }
        }

        item {
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                FleetTab.values().forEach { t ->
                    val label = when (t) {
                        FleetTab.DRIVERS -> "Drivers (${drivers.size})"
                        FleetTab.VEHICLES -> "Vehicles (${vehicles.size})"
                        FleetTab.RENEWALS -> if (attentionCount > 0) "Renewals ⚠ $attentionCount" else "Renewals"
                        FleetTab.SERVICES -> "Service Logs (${services.size})"
                    }
                    FilterChip(
                        selected = tab == t,
                        onClick = { tab = t },
                        label = { Text(label, fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = brand.primary.copy(alpha = 0.16f),
                            selectedLabelColor = brand.primary,
                        ),
                    )
                }
            }
        }

        if (loading) {
            item { LoadingBlock() }
        } else when (tab) {
            FleetTab.DRIVERS -> {
                if (drivers.isEmpty()) item { EmptyState("No drivers yet — add your first driver") }
                else items(drivers.size) { i ->
                    val d = drivers[i]
                    DriverCard(
                        driver = d,
                        onEdit = { editingDriver = d; showDriverDialog = true },
                        onDelete = {
                            confirmDelete = PendingDelete("driver ${d.fullName}", DeleteKind.DRIVER, d.id)
                        },
                    )
                }
            }

            FleetTab.VEHICLES -> {
                if (vehicles.isEmpty()) item { EmptyState("No vehicles yet — add your first vehicle") }
                else items(vehicles.size) { i ->
                    val v = vehicles[i]
                    val odo = odoByVehicle[v.id]
                    val pms = Pms.computePmsStatus(v, services, odo?.odo ?: 0)
                    VehicleCard(
                        vehicle = v,
                        odoLabel = odo?.odo?.let { "${it.thousands()} km (${odo.source ?: "no data"})" } ?: "no odometer data",
                        pmsStatus = pms.status,
                        onAssetRecord = { assetRecordVehicle = v },
                        onEdit = { editingVehicle = v; showVehicleDialog = true },
                        onDelete = {
                            confirmDelete = PendingDelete("vehicle ${v.plateNumber}", DeleteKind.VEHICLE, v.id)
                        },
                    )
                }
            }

            FleetTab.RENEWALS -> {
                if (renewals.isEmpty()) item {
                    EmptyState("Add vehicles and drivers to see PMS, registration, insurance, tire and licence renewals")
                }
                else items(renewals.size) { i ->
                    val item = renewals[i]
                    RenewalRow(item) {
                        serviceDialogVehicleId = item.logForVehicleId
                        showServiceDialog = true
                    }
                }
            }

            FleetTab.SERVICES -> {
                if (services.isEmpty()) item { EmptyState("No service logs yet") }
                else items(services.size) { i ->
                    val s = services[i]
                    ServiceCard(
                        log = s,
                        plate = vehicles.firstOrNull { it.id == s.vehicleId }?.plateNumber ?: "—",
                        onDelete = {
                            confirmDelete = PendingDelete("this service log", DeleteKind.SERVICE, s.id)
                        },
                    )
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showDriverDialog) {
        DriverDialog(
            initial = editingDriver,
            onDismiss = { showDriverDialog = false },
            onSaved = { showDriverDialog = false; reloadKey++ },
        )
    }
    if (showVehicleDialog) {
        VehicleDialog(
            initial = editingVehicle,
            onDismiss = { showVehicleDialog = false },
            onSaved = { showVehicleDialog = false; reloadKey++ },
        )
    }
    if (showServiceDialog) {
        ServiceDialog(
            vehicles = vehicles,
            presetVehicleId = serviceDialogVehicleId,
            onDismiss = { showServiceDialog = false },
            onSaved = { showServiceDialog = false; reloadKey++ },
        )
    }
    assetRecordVehicle?.let { v ->
        AssetRecordDialog(
            vehicle = v,
            services = services.filter { it.vehicleId == v.id },
            onDismiss = { assetRecordVehicle = null },
        )
    }

    confirmDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete ${target.label}?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = null
                    scope.launch {
                        runCatching {
                            when (target.kind) {
                                DeleteKind.DRIVER -> ServiceLocator.repo.deleteDriver(target.id)
                                DeleteKind.VEHICLE -> ServiceLocator.repo.deleteVehicle(target.id)
                                DeleteKind.SERVICE -> ServiceLocator.repo.deleteServiceLog(target.id)
                            }
                        }
                        reloadKey++
                    }
                }) { Text("Delete", color = Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

@Composable
private fun DriverCard(driver: Driver, onEdit: () -> Unit, onDelete: () -> Unit) {
    val brand = LocalBrand.current
    val licence = Pms.computeRenewal(driver.licenseExpiry)
    SurfaceCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Avatar(driver.avatarUrl ?: driver.licensePhotoUrl, driver.fullName, size = 52)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(driver.fullName, color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "ID: ${driver.employeeId ?: "—"} · ${driver.contactNumber ?: "No contact"}",
                    color = Taupe,
                    fontSize = 11.sp,
                )
                Text(
                    "Licence: ${driver.licenseNumber ?: "—"} · " +
                        (driver.licenseExpiry?.let { "exp ${prettyDate(it)}" } ?: "no expiry"),
                    color = Taupe,
                    fontSize = 11.sp,
                )
                driver.assignedVehiclePlate?.takeIf { it.isNotBlank() }?.let {
                    Text("🚗 $it", color = Taupe, fontSize = 11.sp)
                }
                licence?.let {
                    Spacer(Modifier.height(6.dp))
                    Pill("Licence ${it.message.lowercase()}", dueColor(it.status))
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Pill(driver.status, brand.primary)
                Spacer(Modifier.height(8.dp))
                Row {
                    Text("✎", fontSize = 14.sp, modifier = Modifier.clickable { onEdit() }.padding(4.dp))
                    Text("🗑", fontSize = 14.sp, modifier = Modifier.clickable { onDelete() }.padding(4.dp))
                }
            }
        }
    }
}

@Composable
private fun VehicleCard(
    vehicle: Vehicle,
    odoLabel: String,
    pmsStatus: DueStatus,
    onAssetRecord: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val brand = LocalBrand.current
    SurfaceCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            if (!vehicle.imageUrl.isNullOrBlank()) {
                RemoteImage(
                    vehicle.imageUrl, vehicle.plateNumber,
                    Modifier
                        .size(60.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
            } else {
                Box(
                    Modifier
                        .size(60.dp)
                        .background(Mint, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text("🚐", fontSize = 22.sp) }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(vehicle.plateNumber, color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "${vehicle.label} · ${vehicle.fuelType ?: "—"} · ${vehicle.tankLiters?.toInt() ?: 0}L",
                    color = Taupe,
                    fontSize = 11.sp,
                )
                Text("Odometer: $odoLabel", color = Taupe, fontSize = 11.sp)
                Spacer(Modifier.height(6.dp))
                Pill(
                    when (pmsStatus) {
                        DueStatus.OVERDUE -> "PMS overdue"
                        DueStatus.DUE_SOON -> "PMS due soon"
                        DueStatus.OK -> "PMS on schedule"
                    },
                    dueColor(pmsStatus),
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Pill(vehicle.status.replace('_', ' '), brand.primary)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Asset Record",
                    color = brand.primary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { onAssetRecord() }.padding(vertical = 2.dp),
                )
                Row {
                    Text("✎", fontSize = 14.sp, modifier = Modifier.clickable { onEdit() }.padding(4.dp))
                    Text("🗑", fontSize = 14.sp, modifier = Modifier.clickable { onDelete() }.padding(4.dp))
                }
            }
        }
    }
}

@Composable
private fun RenewalRow(item: RenewalItem, onLogService: () -> Unit) {
    val color = dueColor(item.status)
    SurfaceCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .size(36.dp)
                    .background(Mint, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when (item.kind) {
                        RenewalKind.PMS -> "🔧"
                        RenewalKind.REGISTRATION -> "📄"
                        RenewalKind.INSURANCE -> "🛡"
                        RenewalKind.TIRE -> "🛞"
                        RenewalKind.LICENSE -> "🪪"
                    },
                    fontSize = 16.sp,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(item.title, color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(item.entity, color = Taupe, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(item.detail, color = Mocha, fontSize = 12.sp)
                item.sub?.let { Text(it, color = Taupe, fontSize = 10.sp) }
            }
            Column(horizontalAlignment = Alignment.End) {
                Pill(dueLabel(item.status), color)
                if (item.logForVehicleId != null) {
                    Text(
                        "Log",
                        color = LocalBrand.current.primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .clickable { onLogService() }
                            .padding(top = 6.dp, start = 4.dp, end = 4.dp),
                    )
                }
            }
        }
        item.progress?.let {
            Spacer(Modifier.height(8.dp))
            ProgressBar(it, color)
        }
    }
}

@Composable
private fun ServiceCard(log: ServiceLog, plate: String, onDelete: () -> Unit) {
    val brand = LocalBrand.current
    SurfaceCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text("$plate — ${log.serviceType}", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    buildString {
                        append(prettyDate(log.serviceDate))
                        append(" · ")
                        append(log.odometerAtService?.let { "${it.thousands()} km" } ?: "no ODO")
                        log.cost?.let { append(" · ").append(peso(it)) }
                        log.serviceProvider?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
                    },
                    color = Taupe,
                    fontSize = 11.sp,
                )
                log.nextServiceKm?.let {
                    Text("Next: every ${it.thousands()} km", color = Taupe, fontSize = 11.sp)
                }
                if (log.source == "ocr") {
                    Spacer(Modifier.height(6.dp))
                    Pill("OCR · casa report attached", brand.primary)
                }
            }
            Text("🗑", fontSize = 14.sp, modifier = Modifier.clickable { onDelete() }.padding(4.dp))
        }
    }
}

// ---------------------------------------------------------------------------
// Unified renewals board — PMS + registration + insurance + tires per vehicle,
// licences per driver, urgency-sorted. Ports the useMemo in Fleet.jsx.
// ---------------------------------------------------------------------------

private fun buildRenewals(
    vehicles: List<Vehicle>,
    drivers: List<Driver>,
    services: List<ServiceLog>,
    odoByVehicle: Map<String, com.rhex.fleetflow.nativeapp.data.OdoReading>,
): List<RenewalItem> {
    val items = mutableListOf<RenewalItem>()

    vehicles.forEach { v ->
        val reading = odoByVehicle[v.id]
        val currentOdo = reading?.odo ?: 0
        val pms = Pms.computePmsStatus(v, services, currentOdo)

        items += RenewalItem(
            key = "pms-${v.id}",
            kind = RenewalKind.PMS,
            title = "PMS / Change Oil",
            entity = "${v.plateNumber} · ${v.label}",
            detail = pms.message
                ?: "${pms.kmRemaining.thousands()} km or ${pms.daysRemaining} days left",
            sub = "every ${pms.intervalKm.thousands()} km / ${pms.intervalMonths} mo · " +
                "now ${currentOdo.thousands()} km (${reading?.source ?: "no data"})",
            status = pms.status,
            progress = maxOf(pms.kmProgress, pms.timeProgress),
            logForVehicleId = v.id,
        )

        Pms.computeRenewal(v.registrationExpiry)?.let { reg ->
            items += RenewalItem(
                key = "reg-${v.id}",
                kind = RenewalKind.REGISTRATION,
                title = "Registration (OR/CR)",
                entity = v.plateNumber,
                detail = "${reg.message} — expires ${reg.dueDate}",
                sub = "LTO renewal",
                status = reg.status,
                progress = reg.progress,
            )
        }

        Pms.computeRenewal(v.insuranceExpiry)?.let { ins ->
            items += RenewalItem(
                key = "ins-${v.id}",
                kind = RenewalKind.INSURANCE,
                title = "Insurance",
                entity = v.plateNumber,
                detail = "${ins.message} — expires ${ins.dueDate}",
                sub = "CTPL / comprehensive policy",
                status = ins.status,
                progress = ins.progress,
            )
        }

        Pms.computeTireWear(v, currentOdo)?.let { tire ->
            items += RenewalItem(
                key = "tire-${v.id}",
                kind = RenewalKind.TIRE,
                title = "Tire Wear",
                entity = v.plateNumber,
                detail = tire.message,
                sub = "${tire.used.thousands()} / ${tire.life.thousands()} km since last change",
                status = tire.status,
                progress = tire.progress,
            )
        }
    }

    drivers.forEach { d ->
        Pms.computeRenewal(d.licenseExpiry)?.let { lic ->
            items += RenewalItem(
                key = "lic-${d.id}",
                kind = RenewalKind.LICENSE,
                title = "Driver's Licence",
                entity = "${d.fullName} · ${d.licenseNumber ?: "no number"}",
                detail = "${lic.message} — expires ${lic.dueDate}",
                sub = "LTO licence renewal",
                status = lic.status,
                progress = lic.progress,
            )
        }
    }

    val rank = mapOf(DueStatus.OVERDUE to 0, DueStatus.DUE_SOON to 1, DueStatus.OK to 2)
    return items.sortedBy { rank[it.status] ?: 3 }
}
