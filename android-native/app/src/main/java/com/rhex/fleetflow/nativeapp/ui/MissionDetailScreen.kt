package com.rhex.fleetflow.nativeapp.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.navigation.NavHostController
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.MileageLog
import com.rhex.fleetflow.nativeapp.data.RoutePoint
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.data.Vehicle
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Mocha
import com.rhex.fleetflow.nativeapp.ui.theme.Sand
import com.rhex.fleetflow.nativeapp.ui.theme.Success
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.time.Instant

/**
 * One mission: start with an odometer capture, track the route by GPS, end with
 * a second capture. Mirrors src/pages/MissionDetail.jsx.
 *
 * The web build sends the ODO photo to an LLM for a reading; there is no such
 * backend wired here yet, so the photo is captured and stored as evidence and
 * the driver types the number (which the web app also falls back to offline).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MissionDetailScreen(missionId: String, nav: NavHostController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current

    var request by remember { mutableStateOf<TransportRequest?>(null) }
    var log by remember { mutableStateOf<MileageLog?>(null) }
    var vehicle by remember { mutableStateOf<Vehicle?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }

    var startPhoto by remember { mutableStateOf<String?>(null) }
    var startReading by remember { mutableStateOf("") }
    var endPhoto by remember { mutableStateOf<String?>(null) }
    var endReading by remember { mutableStateOf("") }
    var remarks by remember { mutableStateOf("") }
    var reloadKey by remember { mutableStateOf(0) }

    val tracker = rememberRouteTracker()

    LaunchedEffect(missionId, reloadKey) {
        loading = true
        runCatching {
            val r = ServiceLocator.repo.missionById(missionId)
            request = r
            log = ServiceLocator.repo.mileageLogForRequest(missionId)
            remarks = log?.remarks.orEmpty()
            val vid = r?.vehicleId
            if (vid != null) vehicle = ServiceLocator.repo.vehicles().firstOrNull { it.id == vid }
        }
        loading = false
    }

    // Ask for location up front so a fix has time to resolve; a denial never
    // blocks starting or ending the mission — the trace is simply empty.
    val locationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {}
    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            locationPermission.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(request?.let { "Mission ${it.missionId}" } ?: "Mission") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { confirmDelete = true }) { Text("Delete", color = Danger, fontSize = 12.sp) }
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
            val r = request
            when {
                loading -> LoadingBlock()
                r == null -> EmptyState("Mission not found.")
                else -> {
                    val done = r.status == TransportRequest.STATUS_COMPLETED && log?.endOdometer != null
                    val ongoing = r.status == TransportRequest.STATUS_ONGOING

                    SurfaceCard {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "Mission ${r.missionId}",
                                    color = Cocoa,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    buildString {
                                        append(r.guestName)
                                        if (r.isErrand && !r.department.isNullOrBlank()) {
                                            append(" · Errand — ").append(r.department)
                                        } else {
                                            append(" · ").append(r.paxCount).append(" pax")
                                        }
                                        append(" · ").append(r.bookingType)
                                    },
                                    color = Taupe,
                                    fontSize = 12.sp,
                                )
                            }
                            Pill(r.status, missionStatusColor(r.status))
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth()) {
                            DetailFact("Pickup", r.pickupLocation.ifBlank { "—" }, Modifier.weight(1f))
                            DetailFact("Destination", r.destination.ifBlank { "—" }, Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth()) {
                            DetailFact(
                                "Schedule",
                                "${prettyDate(r.scheduleDate)} ${r.scheduleTime.take(5)}",
                                Modifier.weight(1f),
                            )
                            DetailFact("Vehicle", vehicle?.plateNumber ?: "Unassigned", Modifier.weight(1f))
                        }
                        if (!r.specialNotes.isNullOrBlank()) {
                            Spacer(Modifier.height(8.dp))
                            DetailFact("Special notes", r.specialNotes)
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    if (!done) {
                        if (!ongoing) {
                            OdoCapture(
                                label = "Start ODO — before the trip",
                                photoPath = startPhoto,
                                reading = startReading,
                                onCapture = { startPhoto = it },
                                onReading = { startReading = it },
                                onClear = { startPhoto = null; startReading = "" },
                            )
                        } else {
                            SurfaceCard {
                                Text(
                                    "Started ${prettyDateTime(log?.timeOut)}",
                                    color = brand.primary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text("Start ODO: ${km(log?.startOdometer)}", color = Mocha, fontSize = 13.sp)
                                if (tracker.recording) {
                                    Text(
                                        "GPS tracking active — ${tracker.points.size} points",
                                        color = brand.primary,
                                        fontSize = 11.sp,
                                        modifier = Modifier.padding(top = 4.dp),
                                    )
                                } else {
                                    Text(
                                        "GPS trace not running — reopening this screen mid-trip won't recover " +
                                            "earlier points.",
                                        color = Taupe,
                                        fontSize = 11.sp,
                                        modifier = Modifier.padding(top = 4.dp),
                                    )
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            OdoCapture(
                                label = "End ODO — after the trip",
                                photoPath = endPhoto,
                                reading = endReading,
                                onCapture = { endPhoto = it },
                                onReading = { endReading = it },
                                onClear = { endPhoto = null; endReading = "" },
                            )
                            Spacer(Modifier.height(12.dp))
                            SurfaceCard {
                                Text("Remarks", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.height(8.dp))
                                FormField(
                                    value = remarks,
                                    onValueChange = { remarks = it },
                                    label = "Traffic, tolls, guest notes…",
                                    singleLine = false,
                                    minLines = 2,
                                )
                            }
                        }

                        message?.let {
                            Spacer(Modifier.height(10.dp))
                            Text(it, color = if (it.startsWith("Saved offline")) brand.accentDark else Success, fontSize = 12.sp)
                        }

                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = {
                                val reading = (if (ongoing) endReading else startReading).toIntOrNull()
                                if (reading == null) {
                                    message = "Enter the odometer reading first."
                                    return@Button
                                }
                                busy = true
                                message = null
                                scope.launch {
                                    val result = runCatching {
                                        if (ongoing) {
                                            val route = tracker.stop()
                                            ServiceLocator.repo.endMission(
                                                r, log, reading, endPhoto, remarks, route,
                                            )
                                        } else {
                                            val ok = ServiceLocator.repo.startMission(r, reading, startPhoto)
                                            if (ok) tracker.start()
                                            ok
                                        }
                                    }
                                    busy = false
                                    result.fold(
                                        onSuccess = { synced ->
                                            message = if (synced) {
                                                if (ongoing) "Mission completed." else "Mission started — drive safely."
                                            } else "Saved offline — will sync when connected."
                                            reloadKey++
                                            if (ongoing) nav.popBackStack()
                                        },
                                        onFailure = { message = it.message ?: "Action failed" },
                                    )
                                }
                            },
                            enabled = !busy,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (ongoing) brand.accentDark else brand.primary,
                                contentColor = Color.White,
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                        ) {
                            if (busy) CircularProgressIndicator(
                                color = Color.White, strokeWidth = 2.dp,
                                modifier = Modifier.height(20.dp),
                            )
                            else Text(
                                if (ongoing) "■  End Mission" else "▶  Start Mission",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    } else {
                        CompletedSummary(log)
                    }

                    Spacer(Modifier.height(28.dp))
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete booking?") },
            text = { Text("This removes the mission and its mileage log permanently.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        runCatching { ServiceLocator.repo.deleteMission(missionId) }
                        nav.popBackStack()
                    }
                }) { Text("Delete", color = Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun DetailFact(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, color = Taupe, fontSize = 10.sp)
        Text(value, color = Mocha, fontSize = 13.sp)
    }
}

/** Photo evidence + the odometer number for one end of the trip. */
@Composable
private fun OdoCapture(
    label: String,
    photoPath: String?,
    reading: String,
    onCapture: (String) -> Unit,
    onReading: (String) -> Unit,
    onClear: () -> Unit,
) {
    val takePhoto = rememberPhotoCapture(onCaptured = onCapture)
    SurfaceCard {
        Text(label, color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))
        if (photoPath == null) {
            CaptureZone(
                title = "Tap to capture odometer",
                sub = "The photo is stored with the mission as evidence",
                onClick = takePhoto,
            )
        } else {
            Box(Modifier.fillMaxWidth()) {
                RemoteImage(
                    url = photoPath,
                    contentDescription = "Odometer",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(14.dp)),
                )
                Text(
                    "✕",
                    color = Cocoa,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(50))
                        .clickable { onClear() }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            Spacer(Modifier.height(10.dp))
        }
        FormField(
            value = reading,
            onValueChange = { onReading(it.filter { c -> c.isDigit() }) },
            label = "ODO reading (km)",
            keyboardType = KeyboardType.Number,
            placeholder = "e.g. 38420",
        )
    }
}

@Composable
private fun CompletedSummary(log: MileageLog?) {
    val brand = LocalBrand.current
    if (log == null) {
        EmptyState("Mission completed — no mileage log found.")
        return
    }
    Column {
        SurfaceCard {
            Text("✓ Mission completed", color = brand.primary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth()) {
                DetailFact("Time out", prettyDateTime(log.timeOut), Modifier.weight(1f))
                DetailFact("Time in", prettyDateTime(log.timeIn), Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth()) {
                DetailFact("Start ODO", km(log.startOdometer), Modifier.weight(1f))
                DetailFact("End ODO", km(log.endOdometer), Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "Total: ${km(log.distance)}",
                color = brand.primary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            log.odoStartPhotoUrl?.let {
                RemoteImage(
                    it, "Start ODO",
                    Modifier
                        .weight(1f)
                        .height(90.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
            }
            log.odoEndPhotoUrl?.let {
                RemoteImage(
                    it, "End ODO",
                    Modifier
                        .weight(1f)
                        .height(90.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
            }
        }
        if (!log.remarks.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            SurfaceCard {
                Text("Remarks", color = Taupe, fontSize = 10.sp)
                Text(log.remarks, color = Mocha, fontSize = 13.sp)
            }
        }
        log.routeCoordinates?.takeIf { it.isNotBlank() }?.let { raw ->
            Spacer(Modifier.height(12.dp))
            RouteTrace(raw)
        }
    }
}

/** Polyline trace of the recorded GPS points (the web build draws the same SVG). */
@Composable
private fun RouteTrace(routeJson: String) {
    val brand = LocalBrand.current
    val points = remember(routeJson) {
        runCatching {
            Json { ignoreUnknownKeys = true }
                .decodeFromString(ListSerializer(RoutePoint.serializer()), routeJson)
        }.getOrDefault(emptyList())
    }
    if (points.size < 2) return

    SurfaceCard {
        Text(
            "Route taken · ${points.size} GPS points",
            color = Cocoa,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(8.dp))
        val minLat = points.minOf { it.lat }
        val maxLat = points.maxOf { it.lat }
        val minLng = points.minOf { it.lng }
        val maxLng = points.maxOf { it.lng }
        Canvas(
            Modifier
                .fillMaxWidth()
                .aspectRatio(2.2f)
                .clip(RoundedCornerShape(12.dp))
                .background(Mint),
        ) {
            val pad = 16f
            val spanLat = (maxLat - minLat).takeIf { it > 0 } ?: 1.0
            val spanLng = (maxLng - minLng).takeIf { it > 0 } ?: 1.0
            fun x(lng: Double) = (pad + ((lng - minLng) / spanLng) * (size.width - 2 * pad)).toFloat()
            fun y(lat: Double) = (size.height - pad - ((lat - minLat) / spanLat) * (size.height - 2 * pad)).toFloat()

            val path = Path().apply {
                points.forEachIndexed { i, p ->
                    if (i == 0) moveTo(x(p.lng), y(p.lat)) else lineTo(x(p.lng), y(p.lat))
                }
            }
            drawPath(path, color = brand.primary, style = Stroke(width = 5f, cap = StrokeCap.Round))
            drawCircle(Success, radius = 8f, center = Offset(x(points.first().lng), y(points.first().lat)))
            drawCircle(Danger, radius = 8f, center = Offset(x(points.last().lng), y(points.last().lat)))
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("● start", color = Success, fontSize = 10.sp)
            Text("● end", color = Danger, fontSize = 10.sp)
        }
    }
}

// ---------------------------------------------------------------------------
// GPS route recorder — the native counterpart of navigator.geolocation.watchPosition
// ---------------------------------------------------------------------------

class RouteTracker(private val context: Context) {
    var recording by mutableStateOf(false)
        private set
    var points by mutableStateOf<List<RoutePoint>>(emptyList())
        private set

    private var manager: LocationManager? = null

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            points = points + RoutePoint(location.latitude, location.longitude, Instant.now().toString())
        }

        // Required on API < 29; harmless no-ops afterwards.
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    fun start() {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return // best effort — never blocks the mission

        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        manager = lm
        points = emptyList()
        val provider = if (fine && lm.isProviderEnabled(LocationManager.GPS_PROVIDER))
            LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
        runCatching {
            @Suppress("MissingPermission")
            lm.requestLocationUpdates(provider, 5_000L, 10f, listener)
            recording = true
        }
    }

    fun stop(): List<RoutePoint> {
        runCatching { manager?.removeUpdates(listener) }
        recording = false
        return points
    }
}

@Composable
fun rememberRouteTracker(): RouteTracker {
    val context = LocalContext.current
    val tracker = remember { RouteTracker(context) }
    DisposableEffect(Unit) { onDispose { tracker.stop() } }
    return tracker
}
