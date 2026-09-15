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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavHostController
import com.rhex.fleetflow.nativeapp.Connectivity
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.OfflineQueue
import com.rhex.fleetflow.nativeapp.data.Profile
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import kotlinx.coroutines.launch

/**
 * The "More" hub — the rest of the web app's nav (New Booking, History, QR
 * Codes, Settings) plus session controls. Settings only appears for Admins,
 * mirroring the nav-hiding in Layout.jsx.
 */
@Composable
fun MoreScreen(profile: Profile, sessionVm: SessionViewModel, nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current
    val context = LocalContext.current
    val activity = context as? FragmentActivity

    var biometric by remember { mutableStateOf(ServiceLocator.repo.biometricEnabledNow()) }
    var pending by remember { mutableStateOf(0) }
    var syncing by remember { mutableStateOf(false) }
    var syncNote by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { pending = OfflineQueue.sizeNow() }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            SurfaceCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(null, profile.fullName, size = 48)
                    Spacer(Modifier.size(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(profile.fullName, color = Cocoa, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text(profile.email, color = Taupe, fontSize = 11.sp)
                    }
                    Pill(profile.role, if (profile.isAdmin) brand.accentDark else brand.primary)
                }
            }
        }

        item { SectionHeading("Workspace") }

        item {
            NavRow("＋", "New Booking", "Guest booking or department errand") {
                nav.navigate(Routes.NEW_BOOKING)
            }
        }
        item {
            NavRow("🗂", "Trip History", "Completed missions and verified distance") {
                nav.navigate(Routes.HISTORY)
            }
        }
        item {
            NavRow("⬚", "QR Codes", "Printable codes for the desk, vehicles and missions") {
                nav.navigate(Routes.QR_CODES)
            }
        }
        if (profile.isAdmin) {
            item {
                NavRow("⚙", "Settings", "Brand theme, user accounts, fuel bands") {
                    nav.navigate(Routes.SETTINGS)
                }
            }
        }

        item { SectionHeading("Sync") }

        item {
            SurfaceCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (Connectivity.online) "Online" else "Offline",
                            color = if (Connectivity.online) brand.primary else brand.accentDark,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            when {
                                pending > 0 && Connectivity.online -> "$pending change(s) waiting to sync"
                                pending > 0 -> "$pending change(s) queued — they'll sync when you're back online"
                                else -> "All changes synced"
                            },
                            color = Taupe,
                            fontSize = 11.sp,
                        )
                        syncNote?.let { Text(it, color = brand.primary, fontSize = 11.sp) }
                    }
                    OutlinedButton(
                        onClick = {
                            syncing = true
                            syncNote = null
                            scope.launch {
                                val synced = runCatching { OfflineQueue.flush(ServiceLocator.repo) }.getOrDefault(0)
                                pending = OfflineQueue.sizeNow()
                                syncing = false
                                syncNote = if (synced > 0) "Synced $synced item(s)." else "Nothing to sync."
                            }
                        },
                        enabled = !syncing,
                        shape = RoundedCornerShape(12.dp),
                    ) { Text(if (syncing) "Syncing…" else "Sync now", color = brand.primary, fontSize = 12.sp) }
                }
            }
        }

        item { SectionHeading("Security") }

        item {
            SurfaceCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Unlock with biometrics", color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Require fingerprint, face or your device PIN each time FleetFlow opens.",
                            color = Taupe,
                            fontSize = 11.sp,
                        )
                    }
                    Switch(
                        checked = biometric,
                        onCheckedChange = { want ->
                            val available = activity?.let { biometricAvailable(it) } == true
                            if (want && !available) {
                                biometric = false
                            } else {
                                biometric = want
                                ServiceLocator.repo.setBiometricEnabled(want)
                            }
                        },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = brand.primary,
                        ),
                    )
                }
                if (activity?.let { biometricAvailable(it) } != true) {
                    Text(
                        "No biometric or device lock is enrolled on this phone.",
                        color = Taupe,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }

        item {
            Spacer(Modifier.height(6.dp))
            Button(
                onClick = { sessionVm.logout(activity) },
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Danger.copy(alpha = 0.1f),
                    contentColor = Danger,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) { Text("Sign out", fontWeight = FontWeight.SemiBold) }
        }

        item {
            Spacer(Modifier.height(8.dp))
            Text(
                "FleetFlow native · ${com.rhex.fleetflow.nativeapp.BuildConfig.VERSION_NAME}",
                color = Taupe,
                fontSize = 10.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun NavRow(glyph: String, title: String, sub: String, onClick: () -> Unit) {
    SurfaceCard(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(36.dp)
                    .background(Mint, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) { Text(glyph, fontSize = 15.sp) }
            Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = Cocoa, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(sub, color = Taupe, fontSize = 11.sp)
            }
            Text("›", color = Taupe, fontSize = 18.sp)
        }
    }
}

/** Shown when a Staff account reaches the Settings route directly. */
@Composable
fun AdminOnlyLock(nav: NavHostController) {
    val brand = LocalBrand.current
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .size(56.dp)
                .background(Mint, RoundedCornerShape(18.dp)),
            contentAlignment = Alignment.Center,
        ) { Text("🔒", fontSize = 24.sp) }
        Spacer(Modifier.height(14.dp))
        Text("Admin access only", color = Cocoa, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            "Settings is restricted to the owner's admin account. Sign in with an admin login on " +
                "any device — including this phone — to manage the system.",
            color = Taupe,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        OutlinedButton(
            onClick = { nav.popBackStack() },
            shape = RoundedCornerShape(12.dp),
        ) { Text("Back", color = brand.primary) }
    }
}
