package com.rhex.fleetflow.nativeapp.data

import android.content.Context
import kotlinx.serialization.json.Json

/**
 * Persistent session + profile + brand-theme storage (SharedPreferences — the
 * native equivalent of the web app's localStorage).
 */
class SessionStore(context: Context) {

    private val prefs = context.getSharedPreferences("fleetflow_native_session", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    fun saveSession(session: Session, profile: Profile) {
        prefs.edit()
            .putString(KEY_ACCESS, session.accessToken)
            .putString(KEY_REFRESH, session.refreshToken)
            .putString(KEY_PROFILE, json.encodeToString(Profile.serializer(), profile))
            .apply()
    }

    fun updateTokens(session: Session) {
        prefs.edit()
            .putString(KEY_ACCESS, session.accessToken)
            .putString(KEY_REFRESH, session.refreshToken)
            .apply()
    }

    fun savedAccess(): String? = prefs.getString(KEY_ACCESS, null)?.takeIf { it.isNotBlank() }
    fun savedRefresh(): String? = prefs.getString(KEY_REFRESH, null)?.takeIf { it.isNotBlank() }
    fun savedProfile(): Profile? =
        prefs.getString(KEY_PROFILE, null)?.let {
            runCatching { json.decodeFromString(Profile.serializer(), it) }.getOrNull()
        }

    /** Brand palette cached locally so the app opens in the right colors offline. */
    fun savedTheme(): OrgSettings? =
        prefs.getString(KEY_THEME, null)?.let {
            runCatching { json.decodeFromString(OrgSettings.serializer(), it) }.getOrNull()
        }

    fun saveTheme(settings: OrgSettings) {
        prefs.edit().putString(KEY_THEME, json.encodeToString(OrgSettings.serializer(), settings)).apply()
    }

    /** Fuel ₱/L market bands (Settings → Fuel Price Bands), mirroring fuel.js's config. */
    fun savedFuelConfig(): FuelConfig {
        val raw = prefs.getString(KEY_FUEL_CFG, null) ?: return FuelConfig.DEFAULT
        return runCatching { json.decodeFromString(FuelConfig.serializer(), raw) }.getOrDefault(FuelConfig.DEFAULT)
    }

    fun saveFuelConfig(cfg: FuelConfig) {
        prefs.edit().putString(KEY_FUEL_CFG, json.encodeToString(FuelConfig.serializer(), cfg)).apply()
    }

    fun clear() {
        // Keep the brand theme and fuel bands — they're org settings, not the user's session.
        val theme = prefs.getString(KEY_THEME, null)
        val fuel = prefs.getString(KEY_FUEL_CFG, null)
        prefs.edit().clear()
            .putString(KEY_THEME, theme)
            .putString(KEY_FUEL_CFG, fuel)
            .apply()
    }

    var biometricEnabled: Boolean
        get() = prefs.getBoolean(KEY_BIOMETRIC, false)
        set(value) {
            prefs.edit().putBoolean(KEY_BIOMETRIC, value).apply()
        }

    companion object {
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_PROFILE = "profile_json"
        private const val KEY_THEME = "brand_theme_json"
        private const val KEY_FUEL_CFG = "fuel_config_json"
        private const val KEY_BIOMETRIC = "biometric_enabled"
    }
}
