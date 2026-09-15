package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.rhex.fleetflow.nativeapp.data.FuelConfig
import com.rhex.fleetflow.nativeapp.data.PriceBand
import com.rhex.fleetflow.nativeapp.data.Profile
import com.rhex.fleetflow.nativeapp.ui.theme.BrandTheme
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.DEFAULT_ACCENT
import com.rhex.fleetflow.nativeapp.ui.theme.DEFAULT_PRIMARY
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Sand
import com.rhex.fleetflow.nativeapp.ui.theme.THEME_PRESETS
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import com.rhex.fleetflow.nativeapp.ui.theme.hexToColor
import kotlinx.coroutines.launch

/**
 * Settings — Admin-only (AppRoot gates the route). Mirrors src/pages/Settings.jsx:
 * brand theme, team accounts, fuel price bands.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(profile: Profile, sessionVm: SessionViewModel, nav: NavHostController) {
    val scope = rememberCoroutineScope()
    val brand = LocalBrand.current

    var primaryHex by remember { mutableStateOf(BrandTheme.primaryHex) }
    var accentHex by remember { mutableStateOf(BrandTheme.accentHex) }
    var themeNote by remember { mutableStateOf<String?>(null) }

    var profiles by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var editingUser by remember { mutableStateOf<Profile?>(null) }
    var confirmDisable by remember { mutableStateOf<Profile?>(null) }
    var accountError by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    var fuelConfig by remember { mutableStateOf(ServiceLocator.repo.fuelConfigNow()) }
    var fuelNote by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(reloadKey) {
        runCatching { profiles = ServiceLocator.repo.profiles() }
    }

    // Live preview: every edit repaints the whole app immediately, the way
    // theme.js repaints its CSS variables.
    fun preview(p: String, a: String) {
        primaryHex = p
        accentHex = a
        BrandTheme.set(p, a)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
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
                Text(
                    "ADMIN AREA — ${profile.fullName}",
                    color = brand.primary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    "Brand theme, team accounts, fuel bands",
                    color = Taupe,
                    fontSize = 12.sp,
                )
            }

            // ---- Brand theme ------------------------------------------------
            item {
                SurfaceCard {
                    Text("Brand Theme", color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "Match the app to your hotel or company colors — buttons, nav, chips and charts follow.",
                        color = Taupe,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(12.dp))

                    THEME_PRESETS.chunked(2).forEach { pair ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            pair.forEach { preset ->
                                val active = preset.primary.equals(primaryHex, ignoreCase = true)
                                Row(
                                    Modifier
                                        .weight(1f)
                                        .background(
                                            if (active) brand.primary.copy(alpha = 0.1f) else Color.Transparent,
                                            RoundedCornerShape(12.dp),
                                        )
                                        .border(
                                            1.dp,
                                            if (active) brand.primary else Sand,
                                            RoundedCornerShape(12.dp),
                                        )
                                        .clickable { preview(preset.primary, preset.accent) }
                                        .padding(horizontal = 8.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        Modifier
                                            .size(16.dp)
                                            .background(hexToColor(preset.primary), CircleShape),
                                    )
                                    Box(
                                        Modifier
                                            .padding(start = 2.dp)
                                            .size(16.dp)
                                            .background(hexToColor(preset.accent), CircleShape),
                                    )
                                    Spacer(Modifier.size(6.dp))
                                    Text(
                                        preset.name,
                                        color = if (active) brand.primary else Cocoa,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }

                    Spacer(Modifier.height(6.dp))
                    Text("Custom colors", color = Taupe, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(34.dp)
                                    .background(hexToColor(primaryHex), RoundedCornerShape(9.dp))
                                    .border(1.dp, Sand, RoundedCornerShape(9.dp)),
                            )
                            Spacer(Modifier.size(8.dp))
                            Box(Modifier.weight(1f)) {
                                FormField(
                                    primaryHex,
                                    { value -> preview(normalizeHex(value), accentHex) },
                                    "Primary",
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(34.dp)
                                    .background(hexToColor(accentHex), RoundedCornerShape(9.dp))
                                    .border(1.dp, Sand, RoundedCornerShape(9.dp)),
                            )
                            Spacer(Modifier.size(8.dp))
                            Box(Modifier.weight(1f)) {
                                FormField(
                                    accentHex,
                                    { value -> preview(primaryHex, normalizeHex(value)) },
                                    "Accent",
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("Primary", brand.primary)
                        Pill("Pending", brand.accentDark)
                        Pill("Completed", brand.primary)
                    }

                    themeNote?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = brand.primary, fontSize = 11.sp)
                    }

                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(
                            onClick = {
                                preview(DEFAULT_PRIMARY, DEFAULT_ACCENT)
                                themeNote = "Preview reset — tap Apply to save it."
                            },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        ) { Text("Reset", color = Taupe, fontSize = 12.sp) }
                        Button(
                            onClick = {
                                scope.launch {
                                    val ok = runCatching {
                                        ServiceLocator.repo.saveOrgSettings(primaryHex, accentHex)
                                    }
                                    themeNote = ok.fold(
                                        onSuccess = { synced ->
                                            if (synced) "Brand theme applied for everyone."
                                            else "Saved offline — will sync when connected."
                                        },
                                        onFailure = { it.message ?: "Could not save the theme." },
                                    )
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = brand.primary, contentColor = Color.White,
                            ),
                            modifier = Modifier.weight(1f),
                        ) { Text("Apply Theme", fontSize = 12.sp) }
                    }
                }
            }

            // ---- User accounts ---------------------------------------------
            item {
                SurfaceCard {
                    Text("User Accounts", color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "Admins see Settings; Staff don't. People join by registering themselves — " +
                            "new accounts always arrive as Staff, and you promote them here.",
                        color = Taupe,
                        fontSize = 11.sp,
                    )
                    accountError?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = Danger, fontSize = 11.sp)
                    }
                    Spacer(Modifier.height(10.dp))
                    if (profiles.isEmpty()) {
                        EmptyState("No teammates loaded")
                    } else {
                        profiles.forEach { u ->
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        u.fullName + if (u.id == profile.id) " · you" else "",
                                        color = Cocoa,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(u.email, color = Taupe, fontSize = 10.sp)
                                }
                                Pill(u.role, if (u.isAdmin) brand.accentDark else Taupe)
                                Spacer(Modifier.size(4.dp))
                                Pill(u.status, if (u.isActive) brand.primary else Danger)
                                Text(
                                    "✎",
                                    fontSize = 13.sp,
                                    modifier = Modifier
                                        .clickable { accountError = null; editingUser = u }
                                        .padding(6.dp),
                                )
                            }
                        }
                    }
                }
            }

            // ---- Fuel price bands -------------------------------------------
            item {
                SurfaceCard {
                    Text("Fuel Price Bands (₱/L)", color = Cocoa, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "Receipt prices outside these bands are flagged on the Fuel page. Defaults follow " +
                            "the DOE / GasWatch PH Metro Manila averages.",
                        color = Taupe,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    BandRow("Gasoline", fuelConfig.gasoline) {
                        fuelConfig = fuelConfig.copy(gasoline = it)
                    }
                    Spacer(Modifier.height(10.dp))
                    BandRow("Diesel", fuelConfig.diesel) {
                        fuelConfig = fuelConfig.copy(diesel = it)
                    }
                    fuelNote?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = brand.primary, fontSize = 11.sp)
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(
                            onClick = {
                                fuelConfig = FuelConfig.DEFAULT
                                ServiceLocator.repo.saveFuelConfig(FuelConfig.DEFAULT)
                                fuelNote = "Bands reset to the defaults."
                            },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        ) { Text("Reset", color = Taupe, fontSize = 12.sp) }
                        Button(
                            onClick = {
                                ServiceLocator.repo.saveFuelConfig(fuelConfig)
                                fuelNote = "Saved — new fills are audited against these bands."
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = brand.primary, contentColor = Color.White,
                            ),
                            modifier = Modifier.weight(1f),
                        ) { Text("Save Bands", fontSize = 12.sp) }
                    }
                    Text(
                        "Bands are stored on this device (the web app keeps them in localStorage too).",
                        color = Taupe,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }

            item {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Account safety rules (no self-demotion, no removing the last active admin) are " +
                        "enforced in this app. Deleting the underlying auth user still needs the Supabase " +
                        "dashboard — the service-role key never ships in an app.",
                    color = Taupe,
                    fontSize = 10.sp,
                )
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    // ---- edit-account dialog ------------------------------------------------
    editingUser?.let { target ->
        var role by remember(target.id) { mutableStateOf(target.role) }
        var status by remember(target.id) { mutableStateOf(target.status) }
        var busy by remember(target.id) { mutableStateOf(false) }
        var error by remember(target.id) { mutableStateOf<String?>(null) }

        FormDialog(
            title = "Edit ${target.fullName}",
            onDismiss = { editingUser = null },
            primaryLabel = "Save",
            primaryEnabled = true,
            busy = busy,
            error = error,
            onPrimary = {
                val guard = ServiceLocator.repo.guardAccountChange(target, profile, role, status, profiles)
                if (guard != null) {
                    error = guard
                } else {
                    busy = true
                    error = null
                    scope.launch {
                        val result = runCatching {
                            ServiceLocator.repo.updateProfile(target.id, role, status, null)
                        }
                        busy = false
                        result.fold(
                            onSuccess = {
                                editingUser = null
                                reloadKey++
                                if (target.id == profile.id) sessionVm.refreshProfile()
                            },
                            onFailure = { error = it.message ?: "Could not update the account." },
                        )
                    }
                }
            },
        ) {
            Text(target.email, color = Taupe, fontSize = 12.sp)
            Spacer(Modifier.height(12.dp))
            PickerField(
                label = "Role",
                value = role,
                options = listOf(Profile.ROLE_STAFF to "Staff", Profile.ROLE_ADMIN to "Admin"),
                onSelect = { role = it },
            )
            Spacer(Modifier.height(10.dp))
            PickerField(
                label = "Status",
                value = status,
                options = listOf(
                    Profile.STATUS_ACTIVE to "Active",
                    Profile.STATUS_DISABLED to "Disabled — cannot sign in",
                ),
                onSelect = { status = it },
            )
            Spacer(Modifier.height(12.dp))
            if (target.id != profile.id) {
                TextButton(onClick = {
                    val guard = ServiceLocator.repo.guardAccountDelete(target, profile, profiles)
                    if (guard != null) error = guard
                    else {
                        editingUser = null
                        confirmDisable = target
                    }
                }) { Text("Disable this account", color = Danger, fontSize = 12.sp) }
            }
        }
    }

    confirmDisable?.let { target ->
        AlertDialog(
            onDismissRequest = { confirmDisable = null },
            title = { Text("Disable ${target.fullName}?") },
            text = {
                Text(
                    "They will no longer be able to sign in. Their records stay intact, and you can " +
                        "re-enable them here at any time.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDisable = null
                    scope.launch {
                        runCatching { ServiceLocator.repo.disableProfile(target.id) }
                        reloadKey++
                    }
                }) { Text("Disable", color = Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmDisable = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun BandRow(label: String, band: PriceBand, onChange: (PriceBand) -> Unit) {
    var min by remember(label) { mutableStateOf(band.min.toInt().toString()) }
    var max by remember(label) { mutableStateOf(band.max.toInt().toString()) }
    Column(Modifier.fillMaxWidth()) {
        Text(label, color = Taupe, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                FormField(
                    min,
                    {
                        min = it.filter { c -> c.isDigit() }
                        onChange(band.copy(min = min.toDoubleOrNull() ?: band.min))
                    },
                    "Min",
                    keyboardType = KeyboardType.Number,
                )
            }
            Text("to", color = Taupe, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp))
            Box(Modifier.weight(1f)) {
                FormField(
                    max,
                    {
                        max = it.filter { c -> c.isDigit() }
                        onChange(band.copy(max = max.toDoubleOrNull() ?: band.max))
                    },
                    "Max",
                    keyboardType = KeyboardType.Number,
                )
            }
        }
    }
}

/** Keeps hand-typed hex usable: adds the #, clamps to 7 chars, ignores junk. */
private fun normalizeHex(input: String): String {
    val cleaned = input.filter { it.isLetterOrDigit() }.take(6).uppercase()
    return "#$cleaned"
}
