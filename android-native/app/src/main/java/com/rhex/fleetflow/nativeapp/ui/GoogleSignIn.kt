package com.rhex.fleetflow.nativeapp.ui

import android.app.Activity
import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.security.MessageDigest
import kotlin.random.Random

class GoogleSignInException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Native Google Sign-In via Android Credential Manager (the modern One Tap flow).
 * Returns the Google ID token plus the raw nonce; both go to Supabase's GoTrue
 * `grant_type=id_token` endpoint, which verifies the nonce hash and issues the
 * session. Same pattern as the AssetFLOW native app.
 */
object GoogleSignIn {

    data class Result(val idToken: String, val rawNonce: String)

    suspend fun signIn(activity: Activity, serverClientId: String): Result {
        val rawNonce = Base64.encodeToString(
            Random.nextBytes(32), Base64.NO_WRAP or Base64.URL_SAFE,
        )
        val hashedNonce = hashNonce(rawNonce)

        val googleOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .setNonce(hashedNonce)
            .setAutoSelectEnabled(false)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleOption)
            .build()

        val manager = CredentialManager.create(activity)
        return try {
            val response = manager.getCredential(activity, request)
            val credential = GoogleIdTokenCredential.createFrom(response.credential.data)
            Result(idToken = credential.idToken, rawNonce = rawNonce)
        } catch (e: GoogleIdTokenParsingException) {
            throw GoogleSignInException("Google account selection returned an unexpected credential", e)
        } catch (e: Exception) {
            val msg = e.message.orEmpty()
            throw if (msg.contains("cancel", ignoreCase = true) || msg.contains("NoCredential"))
                GoogleSignInException("cancelled", e)
            else GoogleSignInException(msg.ifBlank { "Google sign-in failed" }, e)
        }
    }

    suspend fun signOutState(activity: Activity) {
        runCatching {
            CredentialManager.create(activity).clearCredentialState(ClearCredentialStateRequest())
        }
    }

    /**
     * OEM fallback (Xiaomi/MIUI): the Credential Manager sheet can hang when the
     * OEM blocks Play Services pop-ups. The legacy API opens a FULL-SCREEN
     * sign-in Activity instead, which pop-up blockers can't suppress.
     */
    fun legacySignInIntent(activity: Activity, serverClientId: String): android.content.Intent {
        val gso = com.google.android.gms.auth.api.signin.GoogleSignInOptions.Builder(
            com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
        )
            .requestIdToken(serverClientId)
            .requestEmail()
            .build()
        return com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(activity, gso).signInIntent
    }

    /** Extract the ID token from the full-screen flow's result (null if cancelled). */
    fun legacyIdTokenFromResult(data: android.content.Intent?): String? = runCatching {
        val task = com.google.android.gms.auth.api.signin.GoogleSignIn.getSignedInAccountFromIntent(data)
        task.getResult(java.lang.Exception::class.java)?.idToken
    }.getOrNull()

    /**
     * GoTrue's hashNonce(): base64.RawURLEncoding (base64url, unpadded) of the
     * SHA-256 digest. Google puts exactly this string in the token's nonce claim,
     * and GoTrue re-hashes the raw nonce we send — so the encodings must match.
     */
    private fun hashNonce(s: String): String =
        Base64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)),
            Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE,
        )
}
