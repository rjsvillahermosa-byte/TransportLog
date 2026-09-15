package com.rhex.fleetflow.nativeapp.ui

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.TransportRequest
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe

/**
 * QR codes — mirrors src/pages/QrCodes.jsx, but generated on-device with ZXing's
 * QRCodeWriter (the AssetFLOW reference only ever needed the reader) rather than
 * an external QR image service, so this works with no network.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrCodesScreen(nav: NavHostController) {
    val brand = LocalBrand.current
    val clipboard = LocalClipboardManager.current

    var siteUrl by remember { mutableStateOf("https://fleetflow.app") }
    var missions by remember { mutableStateOf<List<TransportRequest>>(emptyList()) }
    var selectedMissionId by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        runCatching {
            missions = ServiceLocator.repo.missions(50).filter {
                it.status != TransportRequest.STATUS_COMPLETED && it.status != TransportRequest.STATUS_CANCELLED
            }
        }
        if (selectedMissionId.isBlank()) selectedMissionId = missions.firstOrNull()?.id.orEmpty()
    }

    val selectedMission = missions.firstOrNull { it.id == selectedMissionId }
    val base = siteUrl.trimEnd('/')

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("QR Codes") },
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text("Print these and place them where guests and drivers need them", color = Taupe, fontSize = 12.sp)
            }

            item {
                SurfaceCard {
                    Text("Web app address", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "The station codes point at your deployed FleetFlow web app.",
                        color = Taupe,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    FormField(siteUrl, { siteUrl = it }, "Base URL")
                }
            }

            item {
                QrCard(
                    title = "Book a Reservation",
                    sub = "Place at the Front Office desk",
                    payload = "$base/new-booking",
                    onCopy = { clipboard.setText(AnnotatedString(it)) },
                )
            }

            item {
                QrCard(
                    title = "Driver Dashboard",
                    sub = "Place in the vehicle or on the dispatch board",
                    payload = "$base/",
                    onCopy = { clipboard.setText(AnnotatedString(it)) },
                )
            }

            item { SectionHeading("Mission QR", "Hand a driver a scannable code for a specific mission") }

            item {
                SurfaceCard {
                    if (missions.isEmpty()) {
                        EmptyState("No open missions to encode")
                    } else {
                        PickerField(
                            label = "Mission",
                            value = selectedMissionId,
                            options = missions.map {
                                it.id to "#${it.missionId} · ${it.guestName} · ${prettyShortDate(it.scheduleDate)}"
                            },
                            onSelect = { selectedMissionId = it },
                        )
                    }
                }
            }

            selectedMission?.let { m ->
                item {
                    QrCard(
                        title = "Mission #${m.missionId}",
                        sub = "${m.guestName} · ${prettyShortDate(m.scheduleDate)} ${m.scheduleTime.take(5)}",
                        payload = "$base/mission/${m.id}",
                        onCopy = { clipboard.setText(AnnotatedString(it)) },
                    )
                }
            }
        }
    }
}

@Composable
private fun QrCard(title: String, sub: String, payload: String, onCopy: (String) -> Unit) {
    val brand = LocalBrand.current
    val bitmap = remember(payload) { generateQrBitmap(payload, 640) }

    SurfaceCard {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(sub, color = Taupe, fontSize = 11.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            if (bitmap != null) {
                Box(
                    Modifier
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .padding(10.dp),
                ) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "$title QR code",
                        modifier = Modifier.size(200.dp),
                    )
                }
            } else {
                Text("Could not render this QR code", color = Taupe, fontSize = 11.sp)
            }
            Spacer(Modifier.height(10.dp))
            Text(payload, color = Taupe, fontSize = 10.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = { onCopy(payload) },
                shape = RoundedCornerShape(12.dp),
            ) { Text("Copy link", color = brand.primary, fontSize = 12.sp) }
        }
    }
}

/** ZXing QRCodeWriter → BitMatrix → Bitmap. */
private fun generateQrBitmap(content: String, size: Int): Bitmap? = runCatching {
    val hints = mapOf(
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
        EncodeHintType.MARGIN to 1,
        EncodeHintType.CHARACTER_SET to "UTF-8",
    )
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
    val bmp = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
    val pixels = IntArray(matrix.width * matrix.height)
    for (y in 0 until matrix.height) {
        val offset = y * matrix.width
        for (x in 0 until matrix.width) {
            pixels[offset + x] = if (matrix.get(x, y)) AndroidColor.BLACK else AndroidColor.WHITE
        }
    }
    bmp.setPixels(pixels, 0, matrix.width, 0, 0, matrix.width, matrix.height)
    bmp
}.getOrNull()
