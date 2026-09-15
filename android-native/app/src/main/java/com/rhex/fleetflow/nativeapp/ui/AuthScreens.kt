package com.rhex.fleetflow.nativeapp.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rhex.fleetflow.nativeapp.BuildConfig
import com.rhex.fleetflow.nativeapp.ui.theme.Cocoa
import com.rhex.fleetflow.nativeapp.ui.theme.Danger
import com.rhex.fleetflow.nativeapp.ui.theme.LocalBrand
import com.rhex.fleetflow.nativeapp.ui.theme.Mint
import com.rhex.fleetflow.nativeapp.ui.theme.Sand
import com.rhex.fleetflow.nativeapp.ui.theme.Success
import com.rhex.fleetflow.nativeapp.ui.theme.Taupe

private enum class AuthMode { LOGIN, REGISTER, FORGOT }

/** Login / Register / Forgot-password, mirroring Auth.jsx + AuthExtra.jsx. */
@Composable
fun AuthFlow(vm: SessionViewModel) {
    var mode by rememberSaveable { mutableStateOf(AuthMode.LOGIN) }

    when (mode) {
        AuthMode.LOGIN -> LoginScreen(vm, onRegister = { mode = AuthMode.REGISTER }, onForgot = { mode = AuthMode.FORGOT })
        AuthMode.REGISTER -> RegisterScreen(vm, onBack = { mode = AuthMode.LOGIN })
        AuthMode.FORGOT -> ForgotPasswordScreen(vm, onBack = { mode = AuthMode.LOGIN })
    }
}

@Composable
private fun AuthShell(
    title: String,
    subtitle: String,
    footer: @Composable () -> Unit,
    content: @Composable () -> Unit,
) {
    val brand = LocalBrand.current
    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(56.dp))
            Box(
                Modifier
                    .size(56.dp)
                    .background(Mint, RoundedCornerShape(18.dp)),
                contentAlignment = Alignment.Center,
            ) { Text("🚐", fontSize = 26.sp) }
            Spacer(Modifier.height(12.dp))
            Text(title, color = Cocoa, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Taupe, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            Spacer(Modifier.height(20.dp))

            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, Sand),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(20.dp)) { content() }
            }

            Spacer(Modifier.height(14.dp))
            footer()

            if (!com.rhex.fleetflow.nativeapp.ServiceLocator.repo.isConfigured) {
                Spacer(Modifier.height(18.dp))
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = brand.accent.copy(alpha = 0.12f)),
                    border = BorderStroke(1.dp, brand.accent.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            "Backend not configured",
                            color = brand.accentDark,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "Add supabase.url and supabase.anonKey to local.properties, then rebuild. " +
                                "Until then sign-in can't reach a server.",
                            color = Taupe,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }

            Spacer(Modifier.height(22.dp))
            Text(
                "FleetFlow — hotel transport & fleet management",
                color = Taupe,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String = "Password",
) {
    val brand = LocalBrand.current
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            Text(
                if (visible) "HIDE" else "SHOW",
                color = brand.primary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clickable { visible = !visible }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
        },
        colors = fieldColors(),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun PrimaryButton(
    label: String,
    busy: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val brand = LocalBrand.current
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = brand.primary, contentColor = Color.White),
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp),
    ) {
        if (busy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Text(label, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LoginScreen(vm: SessionViewModel, onRegister: () -> Unit, onForgot: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val brand = LocalBrand.current

    val legacyLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { res ->
        val idToken = GoogleSignIn.legacyIdTokenFromResult(res.data)
        if (idToken != null) vm.loginWithGoogleLegacy(idToken) { msg -> busy = false; error = msg }
        else busy = false
    }

    AuthShell(
        title = "Welcome back",
        subtitle = "Log in to your account",
        footer = {
            Row(horizontalArrangement = Arrangement.Center) {
                Text("Don't have an account? ", color = Taupe, fontSize = 13.sp)
                Text(
                    "Register",
                    color = brand.primary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { onRegister() },
                )
            }
        },
    ) {
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
            OutlinedButton(
                onClick = {
                    (context as? android.app.Activity)?.let { activity ->
                        busy = true; error = null
                        vm.loginWithGoogle(activity) { msg ->
                            busy = false
                            error = msg
                            if (msg.startsWith("Google didn't respond")) {
                                busy = true; error = null
                                legacyLauncher.launch(
                                    GoogleSignIn.legacySignInIntent(activity, BuildConfig.GOOGLE_WEB_CLIENT_ID)
                                )
                            }
                        }
                    }
                },
                enabled = !busy,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, Sand),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Cocoa),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) { Text("Continue with Google", fontSize = 14.sp) }

            Spacer(Modifier.height(14.dp))
            Text(
                "or continue with email",
                color = Taupe,
                fontSize = 11.sp,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(14.dp))
        }

        FormField(
            value = email,
            onValueChange = { email = it; error = null },
            label = "Email address",
            keyboardType = KeyboardType.Email,
            placeholder = "you@hotel.com",
        )
        Spacer(Modifier.height(12.dp))
        PasswordField(password, { password = it; error = null })

        Text(
            "Forgot password?",
            color = brand.primary,
            fontSize = 12.sp,
            modifier = Modifier
                .padding(top = 10.dp)
                .clickable { onForgot() },
        )

        error?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Danger, fontSize = 12.sp)
        }

        Spacer(Modifier.height(18.dp))
        PrimaryButton("Sign In", busy) {
            if (email.isBlank() || password.isBlank()) {
                error = "Enter your email and password."
            } else {
                busy = true; error = null
                vm.login(email, password) { msg -> busy = false; error = msg }
            }
        }
    }
}

@Composable
private fun RegisterScreen(vm: SessionViewModel, onBack: () -> Unit) {
    var fullName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    val brand = LocalBrand.current

    AuthShell(
        title = "Create an account",
        subtitle = "Fill in your details to get started",
        footer = {
            Row(horizontalArrangement = Arrangement.Center) {
                Text("Already have an account? ", color = Taupe, fontSize = 13.sp)
                Text(
                    "Sign in",
                    color = brand.primary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { onBack() },
                )
            }
        },
    ) {
        FormField(fullName, { fullName = it; error = null }, "Full name", placeholder = "John Smith")
        Spacer(Modifier.height(12.dp))
        FormField(
            email, { email = it; error = null }, "Email address",
            keyboardType = KeyboardType.Email, placeholder = "you@hotel.com",
        )
        Spacer(Modifier.height(12.dp))
        PasswordField(password, { password = it; error = null })

        error?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Danger, fontSize = 12.sp)
        }
        notice?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Success, fontSize = 12.sp)
        }

        Spacer(Modifier.height(18.dp))
        PrimaryButton("Create Account", busy) {
            when {
                fullName.isBlank() || email.isBlank() -> error = "Name and email are required."
                password.length < 6 -> error = "Password must be at least 6 characters."
                else -> {
                    busy = true; error = null; notice = null
                    vm.register(fullName, email, password) { msg ->
                        busy = false
                        // A message that isn't an error means "confirm your email".
                        if (msg != null && msg.startsWith("Account created")) notice = msg else error = msg
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "New accounts start as Staff — an admin can promote you from Settings.",
            color = Taupe,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ForgotPasswordScreen(vm: SessionViewModel, onBack: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val brand = LocalBrand.current

    AuthShell(
        title = "Forgot password",
        subtitle = "We'll email you a reset link",
        footer = {
            Text(
                "Back to sign in",
                color = brand.primary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { onBack() },
            )
        },
    ) {
        if (sent) {
            Text(
                "If an account exists for $email, a reset link has been sent. Check your inbox — " +
                    "the link opens a page where you can set a new password.",
                color = Cocoa,
                fontSize = 13.sp,
            )
        } else {
            FormField(
                email, { email = it; error = null }, "Email address",
                keyboardType = KeyboardType.Email, placeholder = "you@hotel.com",
            )
            error?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = Danger, fontSize = 12.sp)
            }
            Spacer(Modifier.height(18.dp))
            PrimaryButton("Send Reset Link", busy, enabled = email.isNotBlank()) {
                busy = true; error = null
                vm.requestPasswordReset(email) { msg ->
                    busy = false
                    if (msg == null) sent = true else error = msg
                }
            }
        }
    }
}
