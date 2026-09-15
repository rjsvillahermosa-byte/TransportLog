package com.rhex.fleetflow.nativeapp.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rhex.fleetflow.nativeapp.ServiceLocator
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// ---------------------------------------------------------------------------
// Fixed palette — the warm "cream / cocoa / taupe" shell the web app uses.
// Brand primary + accent are NOT here: they're runtime values from org_settings.
// ---------------------------------------------------------------------------
val Cream = Color(0xFFFBF7F0)        // page background
val CardWhite = Color(0xFFFFFFFF)
val Sand = Color(0xFFEFE6D8)         // hairline borders
val Cocoa = Color(0xFF3B2F26)        // headings
val Mocha = Color(0xFF5A4C3F)        // body text
val Taupe = Color(0xFF8A8378)        // secondary text
val Mint = Color(0xFFE7F2EB)         // soft brand-tinted fill
val Danger = Color(0xFFDC2626)
val Success = Color(0xFF15803D)
val Warning = Color(0xFFB45309)

// ---------------------------------------------------------------------------
// Brand theme presets — ported verbatim from src/lib/theme.js
// ---------------------------------------------------------------------------

data class ThemePreset(val name: String, val primary: String, val accent: String)

val DEFAULT_PRIMARY = "#1E7A5A"
val DEFAULT_ACCENT = "#F2B705"

val THEME_PRESETS = listOf(
    ThemePreset("Deep Teal", "#1E7A5A", "#F2B705"),
    ThemePreset("Hotel Blue", "#1D4ED8", "#F59E0B"),
    ThemePreset("Ocean", "#0E7490", "#FB923C"),
    ThemePreset("Burgundy", "#8E2A3C", "#D9A441"),
    ThemePreset("Royal Purple", "#6D28D9", "#F2B705"),
    ThemePreset("Forest", "#3F6B2F", "#E8763A"),
    ThemePreset("Sunset", "#C2410C", "#F2B705"),
    ThemePreset("Charcoal", "#374151", "#F2B705"),
)

// ---- color math (theme.js's hexToRgb / mix / darken / lighten) ----

fun hexToColor(hex: String): Color {
    val raw = hex.trim().removePrefix("#")
    val full = if (raw.length == 3) raw.map { "$it$it" }.joinToString("") else raw
    return runCatching {
        Color(
            red = full.substring(0, 2).toInt(16),
            green = full.substring(2, 4).toInt(16),
            blue = full.substring(4, 6).toInt(16),
        )
    }.getOrDefault(Color(0xFF1E7A5A))
}

fun Color.toHex(): String {
    val r = (red * 255).roundToInt().coerceIn(0, 255)
    val g = (green * 255).roundToInt().coerceIn(0, 255)
    val b = (blue * 255).roundToInt().coerceIn(0, 255)
    return "#%02X%02X%02X".format(r, g, b)
}

private fun mix(color: Color, target: Color, amount: Float): Color {
    val a = amount.coerceIn(0f, 1f)
    return Color(
        red = min(1f, max(0f, color.red + (target.red - color.red) * a)),
        green = min(1f, max(0f, color.green + (target.green - color.green) * a)),
        blue = min(1f, max(0f, color.blue + (target.blue - color.blue) * a)),
    )
}

fun darken(color: Color, amount: Float = 0.14f): Color = mix(color, Color.Black, amount)
fun lighten(color: Color, amount: Float = 0.25f): Color = mix(color, Color.White, amount)

/**
 * The live brand palette. Settings writes to org_settings and updates [BrandTheme.current],
 * and every screen reading LocalBrand recolors immediately — the native
 * equivalent of theme.js repainting its CSS variables.
 */
data class Brand(
    val primary: Color,
    val primaryDark: Color,
    val primarySoft: Color,
    val accent: Color,
    val accentDark: Color,
) {
    companion object {
        fun from(primaryHex: String, accentHex: String): Brand {
            val p = hexToColor(primaryHex)
            val a = hexToColor(accentHex)
            return Brand(
                primary = p,
                primaryDark = darken(p, 0.14f),
                primarySoft = lighten(p, 0.22f),
                accent = a,
                accentDark = darken(a, 0.55f),
            )
        }
    }
}

/** Process-wide mutable holder so Settings can repaint the whole tree live. */
object BrandTheme {
    var primaryHex by mutableStateOf(DEFAULT_PRIMARY)
    var accentHex by mutableStateOf(DEFAULT_ACCENT)

    fun set(primary: String, accent: String) {
        primaryHex = primary
        accentHex = accent
    }
}

val LocalBrand = staticCompositionLocalOf { Brand.from(DEFAULT_PRIMARY, DEFAULT_ACCENT) }

private val AppTypography = Typography(
    headlineSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 24.sp, letterSpacing = 0.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp),
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(24.dp),
)

@Composable
fun FleetFlowTheme(content: @Composable () -> Unit) {
    // Seed from the locally cached org_settings so the first frame is already
    // in the hotel's colors; Settings/AppRoot refresh it from the server.
    androidx.compose.runtime.remember {
        runCatching {
            val cached = ServiceLocator.repo.cachedOrgSettings()
            BrandTheme.set(cached.brandPrimary, cached.brandAccent)
        }
        true
    }

    val brand = Brand.from(BrandTheme.primaryHex, BrandTheme.accentHex)

    val scheme = lightColorScheme(
        primary = brand.primary,
        onPrimary = Color.White,
        primaryContainer = lighten(brand.primary, 0.85f),
        onPrimaryContainer = brand.primaryDark,
        secondary = brand.accent,
        onSecondary = Color.White,
        secondaryContainer = lighten(brand.accent, 0.8f),
        onSecondaryContainer = brand.accentDark,
        tertiary = brand.primaryDark,
        background = Cream,
        onBackground = Cocoa,
        surface = CardWhite,
        onSurface = Cocoa,
        surfaceVariant = Mint,
        onSurfaceVariant = Taupe,
        outline = Sand,
        outlineVariant = Sand,
        error = Danger,
        onError = Color.White,
    )

    CompositionLocalProvider(LocalBrand provides brand) {
        MaterialTheme(
            colorScheme = scheme,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}
