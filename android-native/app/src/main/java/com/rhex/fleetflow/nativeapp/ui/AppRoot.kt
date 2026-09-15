package com.rhex.fleetflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.rhex.fleetflow.nativeapp.Connectivity
import com.rhex.fleetflow.nativeapp.ServiceLocator
import com.rhex.fleetflow.nativeapp.data.Profile
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe
import com.rhex.fleetflow.nativeapp.ui.theme.Warning

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab(Routes.MISSIONS, "Missions", Icons.Filled.Assignment),
    Tab(Routes.DASHBOARD, "Dashboard", Icons.Filled.PieChart),
    Tab(Routes.FLEET, "Fleet", Icons.Filled.DirectionsCar),
    Tab(Routes.FUEL, "Fuel", Icons.Filled.LocalGasStation),
    Tab(Routes.MORE, "More", Icons.Filled.MoreHoriz),
)

object Routes {
    const val MISSIONS = "missions"
    const val MISSION_DETAIL = "mission"
    const val DASHBOARD = "dashboard"
    const val FLEET = "fleet"
    const val FUEL = "fuel"
    const val MORE = "more"
    const val NEW_BOOKING = "new-booking"
    const val HISTORY = "history"
    const val QR_CODES = "qr-codes"
    const val SETTINGS = "settings"
}

@Composable
fun AppRoot(vm: SessionViewModel = viewModel()) {
    when (val state = vm.state.collectAsState().value) {
        is SessionViewModel.State.Loading -> Box(
            Modifier.fillMaxSize(), contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator(color = LocalBrand.current.primary) }

        is SessionViewModel.State.LoggedOut -> AuthFlow(vm)

        is SessionViewModel.State.LoggedIn -> {
            var unlocked by remember { mutableStateOf(false) }
            val activity = LocalContext.current as? FragmentActivity
            val biometric = remember {
                ServiceLocator.repo.biometricEnabledNow() &&
                    activity?.let { biometricAvailable(it) } == true
            }
            if (biometric && !unlocked) {
                BiometricGate(onUnlocked = { unlocked = true })
            } else {
                MainScaffold(state.profile, vm)
            }
        }
    }
}

@Composable
private fun MainScaffold(profile: Profile, sessionVm: SessionViewModel) {
    val nav = rememberNavController()
    val brand = LocalBrand.current
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (currentRoute in TABS.map { it.route }) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(Routes.MISSIONS) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label, fontSize = 10.sp) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = brand.primary,
                                selectedTextColor = brand.primary,
                                indicatorColor = brand.primary.copy(alpha = 0.14f),
                                unselectedIconColor = Taupe,
                                unselectedTextColor = Taupe,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            if (!Connectivity.online) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(brand.accent.copy(alpha = 0.18f))
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "You're offline — showing saved data. Changes sync automatically.",
                        color = Warning,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            NavHost(
                navController = nav,
                startDestination = Routes.MISSIONS,
                modifier = Modifier.weight(1f),
            ) {
                composable(Routes.MISSIONS) { MissionsScreen(profile, nav) }
                composable(Routes.DASHBOARD) { FoDashboardScreen() }
                composable(Routes.FLEET) { FleetScreen() }
                composable(Routes.FUEL) { FuelScreen() }
                composable(Routes.MORE) { MoreScreen(profile, sessionVm, nav) }
                composable("${Routes.MISSION_DETAIL}/{id}") { entry ->
                    MissionDetailScreen(entry.arguments?.getString("id").orEmpty(), nav)
                }
                composable(Routes.NEW_BOOKING) { NewBookingScreen(profile, nav) }
                composable(Routes.HISTORY) { HistoryScreen(nav) }
                composable(Routes.QR_CODES) { QrCodesScreen(nav) }
                composable(Routes.SETTINGS) {
                    // Role gate: Settings is the owner's area. Staff never see the
                    // nav entry, and reaching the route directly shows the lock.
                    if (profile.isAdmin) SettingsScreen(profile, sessionVm, nav)
                    else AdminOnlyLock(nav)
                }
            }
        }
    }
}
