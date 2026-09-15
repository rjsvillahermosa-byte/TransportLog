package com.rhex.fleetflow.nativeapp.ui

import android.app.Activity
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rhex.fleetflow.nativeapp.BuildConfig
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.Profile
import com.rhex.fleetflow.nativeapp.data.SupabaseNotConfiguredException
import com.rhex.fleetflow.nativeapp.ui.theme.BrandTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

class SessionViewModel(app: Application) : AndroidViewModel(app) {

    sealed interface State {
        data object Loading : State
        data object LoggedOut : State
        data class LoggedIn(val profile: Profile) : State
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state

    val backendConfigured: Boolean get() = ServiceLocator.repo.isConfigured

    init {
        viewModelScope.launch {
            val restored = runCatching { ServiceLocator.repo.restore() }.getOrNull()
            _state.value = restored?.second?.let { State.LoggedIn(it) } ?: State.LoggedOut
            if (restored != null) refreshBrandTheme()
        }
    }

    /** Pulls org_settings so the whole app wears the hotel's palette. */
    fun refreshBrandTheme() {
        viewModelScope.launch {
            runCatching { ServiceLocator.repo.orgSettings() }.getOrNull()?.let {
                BrandTheme.set(it.brandPrimary, it.brandAccent)
            }
        }
    }

    fun login(email: String, password: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val (_, profile) = ServiceLocator.repo.login(email, password)
                if (!profile.isActive) {
                    runCatching { ServiceLocator.repo.logout() }
                    onError("This account has been disabled. Ask an admin to re-enable it.")
                    return@launch
                }
                _state.value = State.LoggedIn(profile)
                refreshBrandTheme()
            } catch (e: Exception) {
                onError(humanize(e))
            }
        }
    }

    /**
     * Self-registration. The server decides the role (Staff, or Admin for the
     * very first account) — the client never sends one.
     */
    fun register(fullName: String, email: String, password: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                val result = ServiceLocator.repo.register(fullName, email, password)
                if (result == null) {
                    onResult("Account created. Check your email to confirm it, then sign in.")
                    return@launch
                }
                _state.value = State.LoggedIn(result.second)
                refreshBrandTheme()
                onResult(null)
            } catch (e: Exception) {
                onResult(humanize(e))
            }
        }
    }

    fun loginWithGoogle(activity: Activity, onError: (String) -> Unit) {
        viewModelScope.launch {
            val google = try {
                val result = withTimeoutOrNull(25_000) {
                    GoogleSignIn.signIn(activity, BuildConfig.GOOGLE_WEB_CLIENT_ID)
                }
                if (result == null) {
                    onError("Google didn't respond (Play Services stuck). Update Google Play Services and reopen the app.")
                    return@launch
                }
                result
            } catch (e: GoogleSignInException) {
                onError(if (e.message == "cancelled") "" else "Google: ${e.message}")
                return@launch
            }
            try {
                val (_, profile) = ServiceLocator.repo.loginWithGoogle(google.idToken, google.rawNonce)
                if (!profile.isActive) {
                    runCatching { ServiceLocator.repo.logout() }
                    onError("This account has been disabled. Ask an admin to re-enable it.")
                    return@launch
                }
                _state.value = State.LoggedIn(profile)
                refreshBrandTheme()
            } catch (e: Exception) {
                onError(humanize(e))
            }
        }
    }

    /** Full-screen legacy path (OEM fallback): Google returned a token via activity result. */
    fun loginWithGoogleLegacy(idToken: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val (_, profile) = ServiceLocator.repo.loginWithGoogle(idToken, "")
                _state.value = State.LoggedIn(profile)
                refreshBrandTheme()
            } catch (e: Exception) {
                onError(humanize(e))
            }
        }
    }

    fun logout(activity: Activity?) {
        viewModelScope.launch {
            activity?.let { withContext(Dispatchers.IO) { GoogleSignIn.signOutState(it) } }
            runCatching { ServiceLocator.repo.logout() }
            _state.value = State.LoggedOut
        }
    }

    fun requestPasswordReset(email: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                ServiceLocator.repo.requestPasswordReset(email)
                onResult(null)
            } catch (e: Exception) {
                onResult(humanize(e))
            }
        }
    }

    /** Re-reads the signed-in profile (role changes take effect without a re-login). */
    fun refreshProfile() {
        viewModelScope.launch {
            runCatching { ServiceLocator.repo.restore() }.getOrNull()?.second?.let {
                _state.value = State.LoggedIn(it)
            }
        }
    }

    private fun humanize(e: Exception): String = when {
        e is SupabaseNotConfiguredException -> e.message.orEmpty()
        e.message?.contains("already registered", ignoreCase = true) == true ->
            "That email already has an account. Sign in instead."
        e.message?.contains("Password should be", ignoreCase = true) == true ->
            "Password must be at least 6 characters."
        e.message?.contains("422") == true -> "Check the details and try again."
        e.message?.contains("400") == true ||
            e.message?.contains("Invalid login", ignoreCase = true) == true -> "Invalid email or password."
        e.message?.contains("429") == true -> "Too many attempts — wait a moment and try again."
        e.message?.contains("HTTP 4") == true -> "Sign-in failed. Check your email and password."
        else -> "Could not reach the server. Check your connection and try again."
    }
}
