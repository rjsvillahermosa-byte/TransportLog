package com.rhex.fleetflow.nativeapp

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.rhex.fleetflow.nativeapp.data.OfflineQueue
import com.rhex.fleetflow.nativeapp.data.Repository
import com.rhex.fleetflow.nativeapp.data.SessionStore
import com.rhex.fleetflow.nativeapp.data.SupabaseClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class FleetFlowApp : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
        OfflineQueue.init(this)

        // Auto-sync: flush queued writes whenever connectivity (re)appears, plus
        // once at launch — the native equivalent of the web app's drainQueue.
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        Connectivity.online = cm.getNetworkCapabilities(cm.activeNetwork)
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        runCatching {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Connectivity.online = true
                    appScope.launch { OfflineQueue.flush(ServiceLocator.repo) }
                }

                override fun onLost(network: Network) {
                    Connectivity.online = false
                }

                override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                    if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                        Connectivity.online = true
                        appScope.launch { OfflineQueue.flush(ServiceLocator.repo) }
                    }
                }
            })
        }
        appScope.launch { OfflineQueue.flush(ServiceLocator.repo) }
    }
}

/** Live connectivity flag the UI observes for the offline banner. */
object Connectivity {
    var online by mutableStateOf(true)
}

object ServiceLocator {
    lateinit var repo: Repository
        private set

    fun init(app: Application) {
        val client = SupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)
        repo = Repository(client, SessionStore(app), app.filesDir)
    }
}
