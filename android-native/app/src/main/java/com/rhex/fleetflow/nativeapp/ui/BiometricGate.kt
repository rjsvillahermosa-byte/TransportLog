package com.rhex.fleetflow.nativeapp.ui

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe

/** True if the device has fingerprint/face hardware enrolled and ready. */
fun biometricAvailable(activity: FragmentActivity): Boolean =
    BiometricManager.from(activity)
        .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS

/**
 * Blocks the UI behind device biometrics when the user enabled it in Settings.
 * Falls back to the device credential (PIN/pattern) — never a silent bypass.
 */
@Composable
fun BiometricGate(onUnlocked: () -> Unit) {
    val activity = LocalContext.current as? FragmentActivity
    val brand = LocalBrand.current
    var errorMsg by remember { mutableStateOf<String?>(null) }

    fun authenticate() {
        if (activity == null) {
            onUnlocked()
            return
        }
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onUnlocked()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    errorMsg = errString.toString()
                }
            },
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock FleetFlow")
                .setSubtitle("Confirm it's you to continue")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_WEAK or
                        BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
                .build()
        )
    }

    LaunchedEffect(Unit) { authenticate() }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
            Text("FleetFlow is locked", color = brand.primary, fontSize = 18.sp)
            Text(
                errorMsg ?: "Waiting for fingerprint or face…",
                color = Taupe,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { authenticate() },
                colors = ButtonDefaults.buttonColors(containerColor = brand.primary),
            ) { Text("Try Again") }
        }
    }
}
