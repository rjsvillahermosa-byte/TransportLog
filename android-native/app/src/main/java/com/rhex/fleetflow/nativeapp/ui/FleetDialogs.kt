package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.Driver
import com.rhex.fleetflow.nativeapp.data.DriverPayload
import com.rhex.fleetflow.nativeapp.data.Pms
import com.rhex.fleetflow.nativeapp.data.ServiceLog
import com.rhex.fleetflow.nativeapp.data.ServiceLogPayload
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.data.VehiclePayload
import com.rhex.fleetflow.nativeapp.data.Vocab
import com.rhex.fleetflow.nativeapp.data.thousands
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Mocha
import com.rhex.fleetflow.nativeapp.ui.theme.Sand
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch
import java.time.LocalDate

// ---------------------------------------------------------------------------
// Shared dialog chrome + a dependency-free dropdown
// ---------------------------------------------------------------------------

@Composable
fun FormDialog(
    title: String,
    onDismiss: () -> Unit,
    primaryLabel: String,
    primaryEnabled: Boolean,
    busy: Boolean,
    error: String? = null,
    onPrimary: () -> Unit,
    content: @Composable () -> Unit,
) {
    val brand = LocalBrand.current
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .heightIn(max = 640.dp),
        ) {
            Column(Modifier.padding(18.dp)) {
                Text(title, color = Cocoa, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState()),
                ) { content() }

                error?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(it, color = Danger, fontSize = 12.sp)
                }

                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = onDismiss,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f),
                    ) { Text("Cancel", color = Taupe) }
                    Button(
                        onClick = onPrimary,
                        enabled = primaryEnabled && !busy,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
                        modifier = Modifier.weight(1f),
                    ) {
                        if (busy) CircularProgressIndicator(
                            color = Color.White, strokeWidth = 2.dp, modifier = Modifier.height(18.dp),
                        ) else Text(primaryLabel, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

/** Dropdown picker built from stable APIs only (no ExposedDropdownMenu experiment). */
@Composable
fun PickerField(
    label: String,
    value: String,
    options: List<Pair<String, String>>, // value to display label
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val display = options.firstOrNull { it.first == value }?.second ?: ""
    Box(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = display,
            onValueChange = {},
            label = { Text(label) },
            readOnly = true,
            enabled = false,
            singleLine = true,
            trailingIcon = { Text("▾", color = Taupe, modifier = Modifier.padding(end = 12.dp)) },
            colors = fieldColors(),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Box(
            Modifier
                .matchParentSize()
                .clickable { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (optValue, optLabel) ->
                DropdownMenuItem(
                    text = { Text(optLabel) },
                    onClick = {
                        onSelect(optValue)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun PhotoSlot(
    label: String,
    sub: String,
    existingUrl: String?,
    capturedPath: String?,
    onCaptured: (String) -> Unit,
    onClear: () -> Unit,
) {
    val takePhoto = rememberPhotoCapture(onCaptured = onCaptured)
    val shown = capturedPath ?: existingUrl
    if (shown.isNullOrBlank()) {
        CaptureZone(title = label, sub = sub, onClick = takePhoto)
    } else {
        Box(Modifier.fillMaxWidth()) {
            RemoteImage(
                shown, label,
                Modifier
                    .fillMaxWidth()
                    .height(130.dp)
                    .clip(RoundedCornerShape(14.dp)),
                ContentScale.Crop,
            )
            Row(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    "Replace",
                    color = Cocoa,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .background(Color.White.copy(alpha = 0.92f), RoundedCornerShape(50))
                        .clickable { takePhoto() }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
                Text(
                    "Remove",
                    color = Danger,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .background(Color.White.copy(alpha = 0.92f), RoundedCornerShape(50))
                        .clickable { onClear() }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Driver enrolment. The web build sends the licence photo to an LLM to auto-fill
 * name/number/expiry; no OCR backend is wired here yet, so the photo is captured
 * and stored (and doubles as the driver's circular avatar) while the fields are
 * typed. The licence expiry still feeds the Renewals board automatically.
 */
@Composable
fun DriverDialog(initial: Driver?, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()

    var fullName by remember { mutableStateOf(initial?.fullName.orEmpty()) }
    var employeeId by remember { mutableStateOf(initial?.employeeId.orEmpty()) }
    var contact by remember { mutableStateOf(initial?.contactNumber.orEmpty()) }
    var email by remember { mutableStateOf(initial?.email.orEmpty()) }
    var licenseNumber by remember { mutableStateOf(initial?.licenseNumber.orEmpty()) }
    var licenseExpiry by remember { mutableStateOf(initial?.licenseExpiry.orEmpty()) }
    var assignedPlate by remember { mutableStateOf(initial?.assignedVehiclePlate.orEmpty()) }
    var status by remember { mutableStateOf(initial?.status ?: "Active") }
    var notes by remember { mutableStateOf(initial?.notes.orEmpty()) }
    var photoPath by remember { mutableStateOf<String?>(null) }
    var clearedPhoto by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    FormDialog(
        title = if (initial == null) "Add Driver" else "Edit Driver",
        onDismiss = onDismiss,
        primaryLabel = "Save Driver",
        primaryEnabled = fullName.isNotBlank(),
        busy = busy,
        error = error,
        onPrimary = {
            busy = true
            error = null
            scope.launch {
                val payload = DriverPayload(
                    fullName = fullName.trim(),
                    employeeId = employeeId.trim().ifBlank { null },
                    contactNumber = contact.trim().ifBlank { null },
                    email = email.trim().ifBlank { null },
                    licenseNumber = licenseNumber.trim().ifBlank { null },
                    licenseExpiry = licenseExpiry.ifBlank { null },
                    licensePhotoUrl = if (clearedPhoto) null else initial?.licensePhotoUrl,
                    avatarUrl = if (clearedPhoto) null else initial?.avatarUrl,
                    assignedVehiclePlate = assignedPlate.trim().ifBlank { null },
                    status = status,
                    notes = notes.trim().ifBlank { null },
                    updatedAt = java.time.Instant.now().toString(),
                )
                val result = runCatching {
                    ServiceLocator.repo.saveDriver(initial?.id, payload, photoPath)
                }
                busy = false
                result.fold(
                    onSuccess = { onSaved() },
                    onFailure = { error = it.message ?: "Could not save the driver." },
                )
            }
        },
    ) {
        PhotoSlot(
            label = "Capture Driver's Licence",
            sub = "Stored with the driver and used as their avatar",
            existingUrl = if (clearedPhoto) null else initial?.licensePhotoUrl,
            capturedPath = photoPath,
            onCaptured = { photoPath = it; clearedPhoto = false },
            onClear = { photoPath = null; clearedPhoto = true },
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Licence fields are typed in — no OCR/LLM backend is wired to this build yet.",
            color = Taupe,
            fontSize = 10.sp,
        )
        Spacer(Modifier.height(12.dp))

        FormField(fullName, { fullName = it }, "Full name *", placeholder = "Juan Dela Cruz")
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) { FormField(employeeId, { employeeId = it }, "Employee ID") }
            Box(Modifier.weight(1f)) {
                FormField(contact, { contact = it }, "Contact", keyboardType = KeyboardType.Phone)
            }
        }
        Spacer(Modifier.height(10.dp))
        FormField(email, { email = it }, "Email", keyboardType = KeyboardType.Email)
        Spacer(Modifier.height(10.dp))
        FormField(licenseNumber, { licenseNumber = it }, "Licence number", placeholder = "G11-10-000495")
        Spacer(Modifier.height(10.dp))
        DateField(licenseExpiry, { licenseExpiry = it }, "Licence expiry")
        Spacer(Modifier.height(10.dp))
        FormField(assignedPlate, { assignedPlate = it }, "Assigned vehicle plate", placeholder = "NAC 1234")
        Spacer(Modifier.height(10.dp))
        PickerField(
            label = "Status",
            value = status,
            options = listOf("Active" to "Active", "Inactive" to "Inactive"),
            onSelect = { status = it },
        )
        Spacer(Modifier.height(10.dp))
        FormField(notes, { notes = it }, "Notes", singleLine = false, minLines = 2)
    }
}

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------

@Composable
fun VehicleDialog(initial: Vehicle?, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current

    var plate by remember { mutableStateOf(initial?.plateNumber.orEmpty()) }
    var unitName by remember { mutableStateOf(initial?.unitName.orEmpty()) }
    var model by remember { mutableStateOf(initial?.model.orEmpty()) }
    var status by remember { mutableStateOf(initial?.status ?: Vehicle.STATUS_AVAILABLE) }
    var fuelType by remember { mutableStateOf(initial?.fuelType ?: "diesel") }
    var tank by remember { mutableStateOf((initial?.tankLiters ?: 60.0).toInt().toString()) }
    var rated by remember { mutableStateOf((initial?.ratedKmPerLiter ?: 9.0).toString()) }
    var pmsKm by remember { mutableStateOf((initial?.pmsIntervalKm ?: 10000).toString()) }
    var pmsMonths by remember { mutableStateOf((initial?.pmsIntervalMonths ?: 6).toString()) }
    var registrationExpiry by remember { mutableStateOf(initial?.registrationExpiry.orEmpty()) }
    var insuranceExpiry by remember { mutableStateOf(initial?.insuranceExpiry.orEmpty()) }
    var tireLife by remember { mutableStateOf((initial?.tireLifeKm ?: 40000).toString()) }
    var tireChanged by remember { mutableStateOf((initial?.tireChangedOdometer ?: 0).toString()) }

    var vehiclePhoto by remember { mutableStateOf<String?>(null) }
    var clearedVehiclePhoto by remember { mutableStateOf(false) }
    var registrationPhoto by remember { mutableStateOf<String?>(null) }
    var insurancePhoto by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val suggestion = Pms.suggest(model)

    FormDialog(
        title = if (initial == null) "Add Vehicle" else "Edit Vehicle",
        onDismiss = onDismiss,
        primaryLabel = "Save Vehicle",
        primaryEnabled = plate.isNotBlank(),
        busy = busy,
        error = error,
        onPrimary = {
            busy = true
            error = null
            scope.launch {
                val payload = VehiclePayload(
                    plateNumber = plate.trim(),
                    unitName = unitName.trim().ifBlank { null },
                    model = model.trim().ifBlank { null },
                    status = status,
                    imageUrl = if (clearedVehiclePhoto) null else initial?.imageUrl,
                    fuelType = fuelType,
                    tankLiters = tank.toDoubleOrNull() ?: 60.0,
                    ratedKmPerLiter = rated.toDoubleOrNull() ?: 9.0,
                    pmsIntervalKm = pmsKm.toIntOrNull() ?: 10000,
                    pmsIntervalMonths = pmsMonths.toIntOrNull() ?: 6,
                    registrationExpiry = registrationExpiry.ifBlank { null },
                    insuranceExpiry = insuranceExpiry.ifBlank { null },
                    registrationPhotoUrl = initial?.registrationPhotoUrl,
                    insurancePhotoUrl = initial?.insurancePhotoUrl,
                    tireLifeKm = tireLife.toIntOrNull() ?: 40000,
                    tireChangedOdometer = tireChanged.toIntOrNull() ?: 0,
                    updatedAt = java.time.Instant.now().toString(),
                )
                val result = runCatching {
                    ServiceLocator.repo.saveVehicle(
                        initial?.id, payload, vehiclePhoto, registrationPhoto, insurancePhoto,
                    )
                }
                busy = false
                result.fold(
                    onSuccess = { onSaved() },
                    onFailure = { error = it.message ?: "Could not save the vehicle." },
                )
            }
        },
    ) {
        PhotoSlot(
            label = "Add Vehicle Photo",
            sub = "Shown on the vehicle card and the asset record",
            existingUrl = if (clearedVehiclePhoto) null else initial?.imageUrl,
            capturedPath = vehiclePhoto,
            onCaptured = { vehiclePhoto = it; clearedVehiclePhoto = false },
            onClear = { vehiclePhoto = null; clearedVehiclePhoto = true },
        )
        Spacer(Modifier.height(12.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) { FormField(plate, { plate = it }, "Plate *", placeholder = "NAC 1234") }
            Box(Modifier.weight(1f)) { FormField(unitName, { unitName = it }, "Unit name", placeholder = "Van 01") }
        }
        Spacer(Modifier.height(10.dp))
        FormField(model, { model = it }, "Model", placeholder = "Toyota Hiace Grandia")
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                PickerField(
                    "Fuel type", fuelType,
                    listOf("diesel" to "diesel", "gasoline" to "gasoline"),
                    { fuelType = it },
                )
            }
            Box(Modifier.weight(1f)) {
                PickerField(
                    "Status", status,
                    Vehicle.STATUSES.map { it to it.replace('_', ' ') },
                    { status = it },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                FormField(tank, { tank = it }, "Tank (L)", keyboardType = KeyboardType.Number)
            }
            Box(Modifier.weight(1f)) {
                FormField(rated, { rated = it }, "Rated km/L", keyboardType = KeyboardType.Decimal)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                FormField(pmsKm, { pmsKm = it }, "PMS every (km)", keyboardType = KeyboardType.Number)
            }
            Box(Modifier.weight(1f)) {
                FormField(pmsMonths, { pmsMonths = it }, "PMS every (months)", keyboardType = KeyboardType.Number)
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "✨ Use recommended schedule: ${suggestion.label}",
            color = brand.primary,
            fontSize = 11.sp,
            modifier = Modifier.clickable {
                pmsKm = suggestion.intervalKm.toString()
                pmsMonths = suggestion.intervalMonths.toString()
            },
        )

        Spacer(Modifier.height(16.dp))
        Text(
            "REGISTRATION, INSURANCE & TIRES",
            color = Taupe,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(10.dp))
        DateField(registrationExpiry, { registrationExpiry = it }, "Registration expiry (OR/CR)")
        Spacer(Modifier.height(8.dp))
        PhotoSlot(
            label = "Capture OR/CR",
            sub = "Kept on the vehicle record",
            existingUrl = initial?.registrationPhotoUrl,
            capturedPath = registrationPhoto,
            onCaptured = { registrationPhoto = it },
            onClear = { registrationPhoto = null },
        )
        Spacer(Modifier.height(12.dp))
        DateField(insuranceExpiry, { insuranceExpiry = it }, "Insurance expiry")
        Spacer(Modifier.height(8.dp))
        PhotoSlot(
            label = "Capture Policy",
            sub = "CTPL / comprehensive certificate",
            existingUrl = initial?.insurancePhotoUrl,
            capturedPath = insurancePhoto,
            onCaptured = { insurancePhoto = it },
            onClear = { insurancePhoto = null },
        )
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                FormField(tireLife, { tireLife = it }, "Tire life (km)", keyboardType = KeyboardType.Number)
            }
            Box(Modifier.weight(1f)) {
                FormField(
                    tireChanged, { tireChanged = it }, "Tires changed at (km)",
                    keyboardType = KeyboardType.Number,
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "Tire wear is tracked from the odometer and resets by itself whenever a " +
                "\"Tire Replacement\" service is logged.",
            color = Taupe,
            fontSize = 10.sp,
        )
    }
}

// ---------------------------------------------------------------------------
// Service log
// ---------------------------------------------------------------------------

@Composable
fun ServiceDialog(
    vehicles: List<Vehicle>,
    presetVehicleId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()

    var vehicleId by remember { mutableStateOf(presetVehicleId ?: vehicles.firstOrNull()?.id.orEmpty()) }
    var serviceType by remember { mutableStateOf(Vocab.SERVICE_TYPES.first()) }
    var serviceDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var odometer by remember { mutableStateOf("") }
    var nextServiceKm by remember { mutableStateOf("") }
    var nextServiceDate by remember { mutableStateOf("") }
    var provider by remember { mutableStateOf("") }
    var cost by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var reportPhoto by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    FormDialog(
        title = "Log Service",
        onDismiss = onDismiss,
        primaryLabel = "Save to Asset Record",
        primaryEnabled = vehicleId.isNotBlank() && serviceDate.isNotBlank(),
        busy = busy,
        error = error,
        onPrimary = {
            busy = true
            error = null
            scope.launch {
                val payload = ServiceLogPayload(
                    vehicleId = vehicleId,
                    serviceType = serviceType,
                    serviceDate = serviceDate,
                    odometerAtService = odometer.toIntOrNull(),
                    nextServiceKm = nextServiceKm.toIntOrNull(),
                    nextServiceDate = nextServiceDate.ifBlank { null },
                    serviceProvider = provider.trim().ifBlank { null },
                    cost = cost.toDoubleOrNull(),
                    notes = notes.trim().ifBlank { null },
                    // "ocr" is reserved for a real extraction backend; a typed
                    // record stays honest about where the numbers came from.
                    source = "manual",
                )
                val result = runCatching { ServiceLocator.repo.createServiceLog(payload, reportPhoto) }
                busy = false
                result.fold(
                    onSuccess = { onSaved() },
                    onFailure = { error = it.message ?: "Could not save the service log." },
                )
            }
        },
    ) {
        PhotoSlot(
            label = "Capture Casa Report",
            sub = "Photograph the service report — kept on the asset record",
            existingUrl = null,
            capturedPath = reportPhoto,
            onCaptured = { reportPhoto = it },
            onClear = { reportPhoto = null },
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Fields are typed in — no OCR/LLM backend is wired to this build yet.",
            color = Taupe,
            fontSize = 10.sp,
        )
        Spacer(Modifier.height(12.dp))

        PickerField(
            label = "Vehicle *",
            value = vehicleId,
            options = vehicles.map { it.id to "${it.plateNumber} — ${it.label}" },
            onSelect = { vehicleId = it },
        )
        Spacer(Modifier.height(10.dp))
        PickerField(
            label = "Service type",
            value = serviceType,
            options = Vocab.SERVICE_TYPES.map { it to it },
            onSelect = { serviceType = it },
        )
        Spacer(Modifier.height(10.dp))
        DateField(serviceDate, { serviceDate = it }, "Service date *")
        Spacer(Modifier.height(10.dp))
        FormField(
            odometer, { odometer = it }, "Odometer at service",
            keyboardType = KeyboardType.Number,
        )
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                FormField(
                    nextServiceKm, { nextServiceKm = it }, "Next service (km)",
                    keyboardType = KeyboardType.Number,
                )
            }
            Box(Modifier.weight(1f)) { DateField(nextServiceDate, { nextServiceDate = it }, "Next date") }
        }
        Spacer(Modifier.height(10.dp))
        FormField(provider, { provider = it }, "Service provider / casa", placeholder = "Toyota Casa — Pasig")
        Spacer(Modifier.height(10.dp))
        FormField(cost, { cost = it }, "Cost (₱)", keyboardType = KeyboardType.Decimal)
        Spacer(Modifier.height(10.dp))
        FormField(notes, { notes = it }, "Notes / parts / recommendations", singleLine = false, minLines = 2)

        if (serviceType == "Tire Replacement") {
            Spacer(Modifier.height(8.dp))
            Text(
                "Saving this resets the tire-wear clock to the odometer above.",
                color = LocalBrand.current.primary,
                fontSize = 11.sp,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Asset record — a vehicle's full service history
// ---------------------------------------------------------------------------

@Composable
fun AssetRecordDialog(vehicle: Vehicle, services: List<ServiceLog>, onDismiss: () -> Unit) {
    val brand = LocalBrand.current
    val sorted = services.sortedByDescending { Pms.parseDate(it.serviceDate) ?: LocalDate.MIN }
    val totalSpend = sorted.sumOf { it.cost ?: 0.0 }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .heightIn(max = 640.dp),
        ) {
            Column(Modifier.padding(18.dp)) {
                Text(
                    "Asset Record — ${vehicle.plateNumber}",
                    color = Cocoa,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState()),
                ) {
                    if (!vehicle.imageUrl.isNullOrBlank()) {
                        RemoteImage(
                            vehicle.imageUrl, vehicle.plateNumber,
                            Modifier
                                .fillMaxWidth()
                                .height(140.dp)
                                .clip(RoundedCornerShape(14.dp)),
                        )
                        Spacer(Modifier.height(12.dp))
                    }
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text("Model", color = Taupe, fontSize = 10.sp)
                            Text(vehicle.model ?: "—", color = Cocoa, fontSize = 13.sp)
                        }
                        Column(Modifier.weight(1f)) {
                            Text("Unit", color = Taupe, fontSize = 10.sp)
                            Text(vehicle.unitName ?: "—", color = Cocoa, fontSize = 13.sp)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text("Fuel / tank", color = Taupe, fontSize = 10.sp)
                            Text(
                                "${vehicle.fuelType ?: "—"} · ${vehicle.tankLiters?.toInt() ?: 0} L",
                                color = Cocoa, fontSize = 13.sp,
                            )
                        }
                        Column(Modifier.weight(1f)) {
                            Text("PMS interval", color = Taupe, fontSize = 10.sp)
                            Text(
                                "${(vehicle.pmsIntervalKm ?: 0).thousands()} km / ${vehicle.pmsIntervalMonths ?: 0} mo",
                                color = Cocoa, fontSize = 13.sp,
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .background(Mint, RoundedCornerShape(12.dp))
                            .padding(12.dp),
                    ) {
                        Column {
                            Text("Total recorded service spend", color = Taupe, fontSize = 10.sp)
                            Text(
                                "${peso(totalSpend)} · ${sorted.size} record${if (sorted.size == 1) "" else "s"}",
                                color = Cocoa,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))

                    if (sorted.isEmpty()) {
                        EmptyState("No service records yet for this vehicle")
                    } else {
                        sorted.forEach { s ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 10.dp)
                                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp)),
                            ) {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            s.serviceType,
                                            color = Cocoa,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Text(
                                            "${prettyDate(s.serviceDate)} · " +
                                                (s.odometerAtService?.let { "${it.thousands()} km" } ?: "no ODO") +
                                                " · ${s.serviceProvider ?: "—"}",
                                            color = Taupe,
                                            fontSize = 11.sp,
                                        )
                                        s.notes?.takeIf { it.isNotBlank() }?.let {
                                            Text(it, color = Mocha, fontSize = 11.sp)
                                        }
                                    }
                                    s.cost?.let {
                                        Text(peso(it), color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                                s.reportPhotoUrl?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(8.dp))
                                    RemoteImage(
                                        it, "Casa report",
                                        Modifier
                                            .fillMaxWidth()
                                            .height(120.dp)
                                            .clip(RoundedCornerShape(10.dp)),
                                    )
                                }
                                Spacer(Modifier.height(8.dp))
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .height(1.dp)
                                        .background(Sand),
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onDismiss,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Close") }
            }
        }
    }
}
