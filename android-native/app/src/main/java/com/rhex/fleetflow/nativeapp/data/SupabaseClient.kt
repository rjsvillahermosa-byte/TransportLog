package com.rhex.fleetflow.nativeapp.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class SupabaseApiException(val status: Int, message: String) : Exception(message)

/** Thrown before any network call when local.properties has no Supabase URL/key. */
class SupabaseNotConfiguredException :
    Exception("FleetFlow's backend isn't configured yet. Add supabase.url and supabase.anonKey to local.properties and rebuild.")

/**
 * Minimal, fully-controlled Supabase REST client — GoTrue auth, PostgREST data
 * and Storage. Exactly the endpoints supabase-js would hit, no SDK, no WebView.
 */
class SupabaseClient(private val baseUrl: String, private val anonKey: String) {

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        encodeDefaults = true
    }

    /** False until the user fills in local.properties; the UI degrades gracefully. */
    val isConfigured: Boolean = baseUrl.isNotBlank() && anonKey.isNotBlank()

    var accessToken: String? = null
    var refreshToken: String? = null
    var onTokenRefreshed: ((Session) -> Unit)? = null

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .build()

    /** Shared OkHttp instance — also used by the Compose remote-image loader. */
    fun httpClient(): OkHttpClient = http

    // ---- auth (GoTrue) ----

    fun login(email: String, password: String): Session {
        val body = """{"email":"${email.escapeJson()}","password":"${password.escapeJson()}","gotrue_meta_security":{"captcha_token":""}}"""
        val resp = raw(
            Request.Builder()
                .url("$baseUrl/auth/v1/token?grant_type=password")
                .post(body.toRequestBody(JSON))
        )
        val session = decode<Session>(resp.body.orEmpty(), serializer())
        applySession(session)
        return session
    }

    /**
     * Self-registration. The role is deliberately NOT sent: the migration's
     * handle_new_user() trigger decides it server-side (first user Admin,
     * everyone after that Staff).
     */
    fun signUp(email: String, password: String, fullName: String): Session {
        val body = """{"email":"${email.escapeJson()}","password":"${password.escapeJson()}","data":{"full_name":"${fullName.escapeJson()}"}}"""
        val resp = raw(
            Request.Builder()
                .url("$baseUrl/auth/v1/signup")
                .post(body.toRequestBody(JSON))
        )
        val session = decode<Session>(resp.body.orEmpty(), serializer())
        if (session.accessToken.isNotBlank()) applySession(session)
        return session
    }

    /** Google One Tap / Credential Manager sign-in: GoTrue ID-token grant with nonce proof. */
    fun loginWithGoogleIdToken(idToken: String, nonce: String): Session {
        val body = """{"provider":"google","token":"${idToken.escapeJson()}","nonce":"${nonce.escapeJson()}"}"""
        val resp = raw(
            Request.Builder()
                .url("$baseUrl/auth/v1/token?grant_type=id_token")
                .post(body.toRequestBody(JSON))
        )
        val session = decode<Session>(resp.body.orEmpty(), serializer())
        applySession(session)
        return session
    }

    fun refreshSession(refreshTokenValue: String): Session {
        val body = """{"refresh_token":"${refreshTokenValue.escapeJson()}"}"""
        val resp = raw(
            Request.Builder()
                .url("$baseUrl/auth/v1/token?grant_type=refresh_token")
                .post(body.toRequestBody(JSON))
        )
        val session = decode<Session>(resp.body.orEmpty(), serializer())
        applySession(session)
        return session
    }

    fun authUser(): AuthUser =
        decode(raw(Request.Builder().url("$baseUrl/auth/v1/user").get()).body.orEmpty(), serializer())

    /** Recovery email — the link lands on the Supabase-hosted reset page. */
    fun requestPasswordReset(email: String) {
        raw(
            Request.Builder()
                .url("$baseUrl/auth/v1/recover")
                .post("""{"email":"${email.escapeJson()}"}""".toRequestBody(JSON))
        )
    }

    fun revokeSession() {
        accessToken?.let {
            runCatching {
                raw(Request.Builder().url("$baseUrl/auth/v1/logout").post("{}".toRequestBody(JSON)))
            }
        }
        accessToken = null
        refreshToken = null
    }

    fun applySession(session: Session) {
        if (session.accessToken.isNotBlank()) accessToken = session.accessToken
        if (session.refreshToken.isNotBlank()) refreshToken = session.refreshToken
    }

    // ---- storage ----

    /** Upload bytes to a Storage bucket; returns the object's public URL. */
    fun uploadImage(bucket: String, objectPath: String, bytes: ByteArray, contentType: String): String {
        withAuthRetry {
            raw(
                Request.Builder()
                    .url("$baseUrl/storage/v1/object/$bucket/$objectPath")
                    .header("Content-Type", contentType)
                    .header("x-upsert", "true")
                    .put(bytes.toRequestBody(contentType.toMediaType()))
            )
        }
        return publicUrl(bucket, objectPath)
    }

    fun publicUrl(bucket: String, objectPath: String): String =
        "$baseUrl/storage/v1/object/public/$bucket/$objectPath"

    // ---- data (PostgREST) ----

    /** GET /rest/v1/{table}?select=*&... — filters/order/limit as PostgREST params. */
    fun <T> select(
        table: String,
        deserializer: KSerializer<T>,
        params: List<Pair<String, String>> = emptyList(),
    ): List<T> = withAuthRetry {
        val url = "$baseUrl/rest/v1/$table${queryString(listOf("select" to "*") + params)}"
        val resp = raw(Request.Builder().url(url).get().header("Accept", "application/json"))
        val body = resp.body.orEmpty()
        if (body.isBlank()) emptyList()
        else json.decodeFromString(ListSerializer(deserializer), body)
    }

    /** Row count via Prefer: count=exact + the Content-Range header. */
    fun count(table: String, filters: List<Pair<String, String>> = emptyList()): Int = withAuthRetry {
        val url = "$baseUrl/rest/v1/$table${queryString(listOf("select" to "id", "limit" to "1") + filters)}"
        val resp = raw(Request.Builder().url(url).get().header("Prefer", "count=exact"))
        val range = resp.header("Content-Range") ?: return@withAuthRetry 0
        range.substringAfterLast('/').toIntOrNull() ?: 0
    }

    fun insert(table: String, bodyJson: String) {
        withAuthRetry {
            raw(
                Request.Builder()
                    .url("$baseUrl/rest/v1/$table")
                    .post(bodyJson.toRequestBody(JSON))
                    .header("Prefer", "return=minimal")
            )
        }
    }

    /** Insert and decode the created row (Prefer: return=representation). */
    fun <T> insertReturning(table: String, bodyJson: String, deserializer: KSerializer<T>): T? =
        withAuthRetry {
            val resp = raw(
                Request.Builder()
                    .url("$baseUrl/rest/v1/$table")
                    .post(bodyJson.toRequestBody(JSON))
                    .header("Prefer", "return=representation")
                    .header("Accept", "application/json")
            )
            val body = resp.body.orEmpty()
            if (body.isBlank()) null
            else json.decodeFromString(ListSerializer(deserializer), body).firstOrNull()
        }

    fun patch(table: String, id: String, bodyJson: String) {
        withAuthRetry {
            raw(
                Request.Builder()
                    .url("$baseUrl/rest/v1/$table?id=eq.${id.encode()}")
                    .patch(bodyJson.toRequestBody(JSON))
                    .header("Prefer", "return=minimal")
            )
        }
    }

    /** PATCH filtered by an arbitrary column — org_settings is keyed on id=true. */
    fun patchWhere(table: String, filters: List<Pair<String, String>>, bodyJson: String) {
        withAuthRetry {
            raw(
                Request.Builder()
                    .url("$baseUrl/rest/v1/$table${queryString(filters)}")
                    .patch(bodyJson.toRequestBody(JSON))
                    .header("Prefer", "return=minimal")
            )
        }
    }

    fun delete(table: String, id: String) {
        withAuthRetry {
            raw(
                Request.Builder()
                    .url("$baseUrl/rest/v1/$table?id=eq.${id.encode()}")
                    .delete()
                    .header("Prefer", "return=minimal")
            )
        }
    }

    /** Edge function invoke (runs with the signed-in user's JWT). */
    fun callFunction(name: String, bodyJson: String): String = withAuthRetry {
        raw(
            Request.Builder()
                .url("$baseUrl/functions/v1/$name")
                .post(bodyJson.toRequestBody(JSON))
        ).body.orEmpty()
    }

    // ---- internals ----

    private class RawResp(val body: String?, private val headers: Map<String, String>) {
        fun header(name: String): String? = headers[name.lowercase()]
    }

    private fun <T> withAuthRetry(block: () -> T): T {
        try {
            return block()
        } catch (e: SupabaseApiException) {
            if (e.status == 401) {
                val rt = refreshToken
                if (!rt.isNullOrEmpty()) {
                    val refreshed = refreshSession(rt)
                    onTokenRefreshed?.invoke(refreshed)
                    return block()
                }
            }
            throw e
        }
    }

    private fun raw(request: Request.Builder, wantBody: Boolean = true): RawResp {
        if (!isConfigured) throw SupabaseNotConfiguredException()
        val req = request
            .header("apikey", anonKey)
            .apply { accessToken?.let { header("Authorization", "Bearer $it") } }
            .build()
        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                val err = runCatching { resp.body?.string()?.take(400) }.getOrNull().orEmpty()
                throw SupabaseApiException(resp.code, "HTTP ${resp.code} $err")
            }
            val headers = resp.headers.toMultimap()
                .mapKeys { it.key.lowercase() }
                .mapValues { it.value.firstOrNull().orEmpty() }
            return RawResp(
                if (wantBody) runCatching { resp.body?.string() }.getOrNull() else null,
                headers,
            )
        }
    }

    private fun <T> decode(body: String, deserializer: KSerializer<T>): T =
        json.decodeFromString(deserializer, body)

    private fun queryString(params: List<Pair<String, String>>): String =
        if (params.isEmpty()) "" else "?" + params.joinToString("&") { (k, v) -> "${k.encode()}=${v.encode()}" }

    private fun String.encode(): String = URLEncoder.encode(this, "UTF-8")

    private fun String.escapeJson(): String =
        replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "").replace("\t", "\\t")

    companion object {
        private val JSON = "application/json".toMediaType()
        const val MEDIA_BUCKET = "fleetflow-media"
    }
}
