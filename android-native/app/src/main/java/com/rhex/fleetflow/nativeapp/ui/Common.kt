package com.rhex.fleetflow.nativeapp.ui

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.DueStatus
import com.rhex.fleetflow.nativeapp.data.Pms
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Sand
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Calendar

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

private val DATE_FMT = DateTimeFormatter.ofPattern("MMM d, yyyy")
private val SHORT_FMT = DateTimeFormatter.ofPattern("MMM d")
private val TIME_FMT = DateTimeFormatter.ofPattern("h:mm a, MMM d")

fun prettyDate(iso: String?): String = Pms.formatDate(iso)

fun prettyShortDate(iso: String?): String =
    Pms.parseDate(iso)?.let { SHORT_FMT.format(it) } ?: "—"

/** Renders a timestamptz (or any ISO instant) in the device's zone. */
fun prettyDateTime(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching {
        TIME_FMT.format(java.time.Instant.parse(iso).atZone(ZoneId.systemDefault()))
    }.getOrElse {
        runCatching { TIME_FMT.format(LocalDateTime.parse(iso.take(19))) }.getOrDefault(iso.take(16))
    }
}

fun peso(value: Double?): String = "₱%,.0f".format(value ?: 0.0)

fun km(value: Int?): String = "%,d km".format(value ?: 0)

/** Mission status → chip colors, mirroring STATUS_STYLES in utils.js. */
@Composable
fun missionStatusColor(status: String?): Color {
    val brand = LocalBrand.current
    return when (status) {
        TransportRequest.STATUS_PENDING -> brand.accentDark
        TransportRequest.STATUS_ASSIGNED -> brand.primaryDark
        TransportRequest.STATUS_ONGOING -> brand.primary
        TransportRequest.STATUS_COMPLETED -> brand.primary
        TransportRequest.STATUS_CANCELLED -> Danger
        else -> Taupe
    }
}

@Composable
fun dueColor(status: DueStatus): Color = when (status) {
    DueStatus.OVERDUE -> Danger
    DueStatus.DUE_SOON -> LocalBrand.current.accentDark
    DueStatus.OK -> LocalBrand.current.primary
}

fun dueLabel(status: DueStatus): String = when (status) {
    DueStatus.OVERDUE -> "Overdue"
    DueStatus.DUE_SOON -> "Due soon"
    DueStatus.OK -> "On track"
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(50))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        Text(text, color = color, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SurfaceCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Column(Modifier.padding(16.dp)) { content() }
    }
}

/** Stat tile — recomputed from raw rows on every render, never from a cached count. */
@Composable
fun StatTile(
    value: String,
    label: String,
    sub: String? = null,
    tone: Color? = null,
    modifier: Modifier = Modifier,
) {
    val color = tone ?: Cocoa
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = modifier,
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(value, color = color, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(label, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            sub?.let { Text(it, color = Taupe, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@Composable
fun SectionHeading(text: String, sub: String? = null) {
    Column(Modifier.padding(top = 20.dp, bottom = 10.dp)) {
        Text(text, color = Cocoa, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        sub?.let { Text(it, color = Taupe, fontSize = 12.sp) }
    }
}

@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("—", color = Sand, fontSize = 28.sp)
        Spacer(Modifier.height(6.dp))
        Text(text, color = Taupe, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

@Composable
fun LoadingBlock(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp),
        contentAlignment = Alignment.Center,
    ) { CircularProgressIndicator(color = LocalBrand.current.primary) }
}

@Composable
fun ProgressBar(progress: Float, color: Color, modifier: Modifier = Modifier) {
    LinearProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        color = color,
        trackColor = Mint,
        modifier = modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(50)),
    )
}

@Composable
fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Cocoa,
    unfocusedTextColor = Cocoa,
    focusedBorderColor = LocalBrand.current.primary,
    unfocusedBorderColor = Sand,
    focusedLabelColor = LocalBrand.current.primary,
    unfocusedLabelColor = Taupe,
    cursorColor = LocalBrand.current.primary,
    // DateField/TimeField render as disabled so the platform picker owns input.
    disabledTextColor = Cocoa,
    disabledBorderColor = Sand,
    disabledLabelColor = Taupe,
    disabledPlaceholderColor = Sand,
)

@Composable
fun FormField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: androidx.compose.ui.text.input.KeyboardType = androidx.compose.ui.text.input.KeyboardType.Text,
    placeholder: String? = null,
) {
    val hint = placeholder
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = if (hint == null) null else {
            { Text(hint, color = Sand) }
        },
        singleLine = singleLine && minLines == 1,
        minLines = minLines,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType),
        colors = fieldColors(),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier.fillMaxWidth(),
    )
}

/** Read-only field backed by the platform date picker; value is ISO yyyy-MM-dd. */
@Composable
fun DateField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val open = {
        val initial = Pms.parseDate(value) ?: LocalDate.now()
        DatePickerDialog(
            context,
            { _, y, m, d -> onValueChange(LocalDate.of(y, m + 1, d).toString()) },
            initial.year, initial.monthValue - 1, initial.dayOfMonth,
        ).show()
    }
    Box(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = if (value.isBlank()) "" else value,
            onValueChange = {},
            label = { Text(label) },
            placeholder = { Text("YYYY-MM-DD", color = Sand) },
            readOnly = true,
            enabled = false,
            singleLine = true,
            colors = fieldColors(),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        // The disabled field swallows clicks, so an invisible overlay opens the dialog.
        Box(
            Modifier
                .matchParentSize()
                .clickable { open() },
        )
    }
}

/** Read-only field backed by the platform time picker; value is HH:mm. */
@Composable
fun TimeField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val open = {
        val cal = Calendar.getInstance()
        val parts = value.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: cal.get(Calendar.HOUR_OF_DAY)
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
        TimePickerDialog(
            context,
            { _, h, m -> onValueChange("%02d:%02d".format(h, m)) },
            hour, minute, true,
        ).show()
    }
    Box(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            label = { Text(label) },
            placeholder = { Text("HH:mm", color = Sand) },
            readOnly = true,
            enabled = false,
            singleLine = true,
            colors = fieldColors(),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Box(
            Modifier
                .matchParentSize()
                .clickable { open() },
        )
    }
}

// ---------------------------------------------------------------------------
// Camera capture — full-resolution shot into the app cache, then persisted to
// durable storage so it survives an offline queue/replay cycle.
// ---------------------------------------------------------------------------

/**
 * Returns a lambda that requests CAMERA (the permission is declared, so the
 * capture intent needs it granted) and then takes a picture. [onCaptured] gets
 * the durable local file path; upload happens in the repository.
 */
@Composable
fun rememberPhotoCapture(onCaptured: (String) -> Unit): () -> Unit {
    val context = LocalContext.current
    var pendingFile by remember { mutableStateOf<File?>(null) }

    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = pendingFile
        if (ok && f != null && f.exists()) {
            val path = runCatching { ServiceLocator.repo.persistPendingPhoto(f.readBytes()) }.getOrNull()
            runCatching { f.delete() }
            if (path != null) onCaptured(path)
        }
    }

    fun launchCamera() {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val f = File(dir, "shot-${System.currentTimeMillis()}.jpg")
        pendingFile = f
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
        runCatching { takePicture.launch(uri) }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> if (granted) launchCamera() }

    return {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        ) launchCamera() else permissionLauncher.launch(Manifest.permission.CAMERA)
    }
}

// ---------------------------------------------------------------------------
// Remote image — deliberately dependency-free (OkHttp + BitmapFactory) rather
// than pulling in an image library, matching the reference app's hand-rolled
// networking. Local capture paths render straight off disk.
// ---------------------------------------------------------------------------

private val imageCache = mutableMapOf<String, ImageBitmap>()

private fun cacheImage(key: String, value: ImageBitmap) {
    if (imageCache.size > 24) imageCache.clear() // tiny, deliberate: bounded memory
    imageCache[key] = value
}

@Composable
fun RemoteImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val bitmap by produceState<ImageBitmap?>(initialValue = url?.let { imageCache[it] }, url) {
        val src = url
        if (src.isNullOrBlank()) {
            value = null
            return@produceState
        }
        imageCache[src]?.let { value = it; return@produceState }
        value = withContext(Dispatchers.IO) {
            runCatching {
                val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
                val bmp = if (src.startsWith("/") || src.startsWith("file:")) {
                    BitmapFactory.decodeFile(src.removePrefix("file://"), opts)
                } else {
                    val req = Request.Builder().url(src).get().build()
                    ServiceLocator.repo.http().newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) null
                        else resp.body?.byteStream()?.let { BitmapFactory.decodeStream(it, null, opts) }
                    }
                }
                bmp?.asImageBitmap()?.also { cacheImage(src, it) }
            }.getOrNull()
        }
    }

    val image = bitmap
    if (image != null) {
        Image(
            bitmap = image,
            contentDescription = contentDescription,
            contentScale = contentScale,
            modifier = modifier,
        )
    } else {
        Box(modifier.background(Mint), contentAlignment = Alignment.Center) {
            Text(if (url.isNullOrBlank()) "" else "…", color = Taupe, fontSize = 12.sp)
        }
    }
}

/** Circular driver avatar: the licence photo when present, initials otherwise. */
@Composable
fun Avatar(photoUrl: String?, name: String, size: Int = 48) {
    val brand = LocalBrand.current
    if (!photoUrl.isNullOrBlank()) {
        RemoteImage(
            url = photoUrl,
            contentDescription = name,
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .border(2.dp, brand.primarySoft, CircleShape),
        )
    } else {
        Box(
            Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(Mint),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                initials(name),
                color = brand.primary,
                fontWeight = FontWeight.Bold,
                fontSize = (size / 3).sp,
            )
        }
    }
}

/** Port of initials() from src/lib/avatar.js. */
fun initials(name: String?): String {
    val parts = name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    return (parts.first().take(1) + (parts.getOrNull(1)?.take(1) ?: "")).uppercase()
}

// ---------------------------------------------------------------------------
// Tiny bar chart — the FO dashboard's recharts panels, drawn with Compose.
// ---------------------------------------------------------------------------

data class BarDatum(val label: String, val value: Double)

@Composable
fun MiniBarChart(
    data: List<BarDatum>,
    color: Color,
    modifier: Modifier = Modifier,
    valueFormatter: (Double) -> String = { "%,.0f".format(it) },
) {
    if (data.isEmpty()) {
        EmptyState("No data for this period", modifier)
        return
    }
    val maxValue = data.maxOf { it.value }.coerceAtLeast(1.0)
    Column(modifier.fillMaxWidth()) {
        data.forEach { d ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    d.label,
                    color = Taupe,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(76.dp),
                )
                Box(
                    Modifier
                        .weight(1f)
                        .height(16.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Mint),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth((d.value / maxValue).toFloat().coerceIn(0.02f, 1f))
                            .fillMaxHeight()
                            .background(color),
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    valueFormatter(d.value),
                    color = Cocoa,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.width(64.dp),
                    textAlign = TextAlign.End,
                )
            }
        }
    }
}

/** Dashed outline used by the capture zones ("Capture Casa Report (OCR)" etc.). */
@Composable
fun CaptureZone(
    title: String,
    sub: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val brand = LocalBrand.current
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Sand),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 18.dp, horizontal = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("📷", fontSize = 22.sp)
            Text(title, color = brand.primary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(sub, color = Taupe, fontSize = 11.sp, textAlign = TextAlign.Center)
        }
    }
}
