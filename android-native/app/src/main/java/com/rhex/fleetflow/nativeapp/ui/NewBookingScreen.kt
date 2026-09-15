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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.Driver
import com.rhex.fleetflow.nativeapp.data.Profile
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.data.TransportRequestPayload
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.data.Vocab
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch
import java.time.LocalDate

private enum class BookingMode { GUEST, ERRAND }

/** Guest booking + department errand creation — mirrors src/pages/NewBooking.jsx. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewBookingScreen(profile: Profile, nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current

    var mode by remember { mutableStateOf(BookingMode.GUEST) }
    var drivers by remember { mutableStateOf<List<Driver>>(emptyList()) }
    var vehicles by remember { mutableStateOf<List<Vehicle>>(emptyList()) }

    var guestName by remember { mutableStateOf("") }
    var paxCount by remember { mutableStateOf("1") }
    var department by remember { mutableStateOf("") }
    var requestedBy by remember { mutableStateOf("") }
    var bookingType by remember { mutableStateOf(Vocab.BOOKING_TYPES.first()) }
    var pickup by remember { mutableStateOf("") }
    var destination by remember { mutableStateOf("") }
    var scheduleDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var scheduleTime by remember { mutableStateOf("") }
    var driverId by remember { mutableStateOf("") }
    var vehicleId by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching {
            drivers = ServiceLocator.repo.drivers()
            vehicles = ServiceLocator.repo.vehicles()
        }
    }

    val isErrand = mode == BookingMode.ERRAND
    val canSubmit = if (isErrand) {
        requestedBy.isNotBlank() && department.isNotBlank() && destination.isNotBlank() && scheduleDate.isNotBlank()
    } else {
        guestName.isNotBlank() && bookingType.isNotBlank() && scheduleDate.isNotBlank()
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(if (isErrand) "New Errand" else "New Booking") },
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
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Text(
                if (isErrand) "Department errand with the same tracked mission workflow"
                else "Create a transport request for a guest",
                color = Taupe,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(14.dp))

            // Guest / Errand switch
            Row(
                Modifier
                    .background(Mint, RoundedCornerShape(12.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf(BookingMode.GUEST to "Guest Booking", BookingMode.ERRAND to "Department Errand")
                    .forEach { (m, label) ->
                        val selected = mode == m
                        Box(
                            Modifier
                                .background(
                                    if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
                                    RoundedCornerShape(9.dp),
                                )
                                .clickable { mode = m }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                        ) {
                            Text(
                                label,
                                color = if (selected) Cocoa else Taupe,
                                fontSize = 12.sp,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            )
                        }
                    }
            }

            Spacer(Modifier.height(14.dp))

            SurfaceCard {
                Text(
                    if (isErrand) "Errand Request" else "Guest Information",
                    color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(10.dp))
                if (isErrand) {
                    FormField(requestedBy, { requestedBy = it }, "Requested by *", placeholder = "e.g. Liza Manalo")
                    Spacer(Modifier.height(10.dp))
                    PickerField(
                        label = "Department *",
                        value = department,
                        options = Vocab.DEPARTMENTS.map { it to it },
                        onSelect = { department = it },
                    )
                    Spacer(Modifier.height(10.dp))
                    FormField(
                        notes, { notes = it }, "Purpose / notes",
                        singleLine = false, minLines = 2,
                        placeholder = "What is the errand for?",
                    )
                } else {
                    FormField(guestName, { guestName = it }, "Guest name *", placeholder = "John Smith")
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f)) {
                            FormField(
                                paxCount, { paxCount = it.filter { c -> c.isDigit() } },
                                "Number of guests", keyboardType = KeyboardType.Number,
                            )
                        }
                        Box(Modifier.weight(1f)) {
                            FormField(department, { department = it }, "Department", placeholder = "Front Office")
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            SurfaceCard {
                Text("Trip Details", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(10.dp))
                if (!isErrand) {
                    PickerField(
                        label = "Booking type *",
                        value = bookingType,
                        options = Vocab.BOOKING_TYPES.map { it to it },
                        onSelect = { bookingType = it },
                    )
                    Spacer(Modifier.height(10.dp))
                }
                FormField(pickup, { pickup = it }, "Pickup location", placeholder = "Hotel Lobby")
                Spacer(Modifier.height(10.dp))
                FormField(
                    destination, { destination = it },
                    if (isErrand) "Destination *" else "Destination",
                    placeholder = if (isErrand) "e.g. Supplier warehouse — Pasay" else "Airport Terminal 3",
                )
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.weight(1f)) { DateField(scheduleDate, { scheduleDate = it }, "Date *") }
                    Box(Modifier.weight(1f)) { TimeField(scheduleTime, { scheduleTime = it }, "Time") }
                }
            }

            Spacer(Modifier.height(12.dp))

            SurfaceCard {
                Text("Assignment", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(10.dp))
                PickerField(
                    label = "Assign driver",
                    value = driverId,
                    options = listOf("" to "Unassigned") + drivers.map { it.id to it.fullName },
                    onSelect = { driverId = it },
                )
                Spacer(Modifier.height(10.dp))
                PickerField(
                    label = "Vehicle",
                    value = vehicleId,
                    options = listOf("" to "Unassigned") +
                        vehicles.map { it.id to "${it.plateNumber} — ${it.label}" },
                    onSelect = { vehicleId = it },
                )
            }

            if (!isErrand) {
                Spacer(Modifier.height(12.dp))
                SurfaceCard {
                    Text("Special Notes", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    FormField(
                        notes, { notes = it }, "Any special instructions…",
                        singleLine = false, minLines = 2,
                    )
                }
            }

            message?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = if (isError) Danger else brand.primary, fontSize = 12.sp)
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    busy = true
                    message = null
                    isError = false
                    scope.launch {
                        val payload = TransportRequestPayload(
                            guestName = if (isErrand) requestedBy.trim() else guestName.trim(),
                            requesterType = if (isErrand) TransportRequest.TYPE_ERRAND else TransportRequest.TYPE_GUEST,
                            requestedBy = requestedBy.trim().ifBlank { null },
                            paxCount = if (isErrand) 1 else (paxCount.toIntOrNull() ?: 1),
                            bookingType = if (isErrand) "Errand" else bookingType,
                            pickupLocation = pickup.trim().ifBlank { "Hotel Lobby" },
                            destination = destination.trim().ifBlank { "TBA" },
                            scheduleDate = scheduleDate,
                            // schedule_time is NOT NULL in the schema; default to 00:00.
                            scheduleTime = scheduleTime.ifBlank { "00:00" },
                            assignedDriverId = driverId.ifBlank { null },
                            vehicleId = vehicleId.ifBlank { null },
                            department = department.trim().ifBlank { null },
                            specialNotes = notes.trim().ifBlank { null },
                            status = TransportRequest.STATUS_PENDING,
                            createdBy = profile.id.ifBlank { null },
                        )
                        val result = runCatching { ServiceLocator.repo.createMission(payload) }
                        busy = false
                        result.fold(
                            onSuccess = { synced ->
                                if (synced) nav.popBackStack()
                                else {
                                    message = "Saved offline — it will sync when you're back online."
                                    isError = false
                                }
                            },
                            onFailure = {
                                message = it.message ?: "Failed to create the booking."
                                isError = true
                            },
                        )
                    }
                },
                enabled = canSubmit && !busy,
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
            ) {
                if (busy) CircularProgressIndicator(
                    color = Color.White, strokeWidth = 2.dp, modifier = Modifier.height(20.dp),
                ) else Text(
                    if (isErrand) "Create Errand Mission" else "Create Booking",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "The 6-digit mission ID is generated by the database on insert.",
                color = Taupe,
                fontSize = 10.sp,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(28.dp))
        }
    }
}
