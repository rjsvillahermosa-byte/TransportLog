package com.rhex.fleetflow.nativeapp

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.fragment.app.FragmentActivity
import com.rhex.fleetflow.nativeapp.ui.AppRoot
import com.rhex.fleetflow.nativeapp.ui.theme.FleetFlowTheme

/**
 * FragmentActivity (not plain ComponentActivity) so BiometricPrompt can host
 * its dialog — same as the AssetFLOW native shell.
 */
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FleetFlowTheme {
                AppRoot()
            }
        }
    }
}
