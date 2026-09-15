package com.rhex.fleetflow.nativeapp.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * Every read/write FleetFlow performs. Table and column names match
 * supabase/migrations/0001_init.sql exactly, so RLS behaves the same as it does
 * for the web build.
 */
class Repository(
    private val client: SupabaseClient,
    private val store: SessionStore,
    private val cacheRoot: File? = null,
) {
    init {
        client.onTokenRefreshed = { store.updateTokens(it) }
    }

    private val json = client.json

    val isConfigured: Boolean get() = client.isConfigured

    fun http() = client.httpClient()

    // -----------------------------------------------------------------------
    // Offline read cache — a fresh fetch is persisted; on a network failure the
    // last saved copy is served so screens still render.
    // -----------------------------------------------------------------------
    private suspend fun <T> cached(key: String, ser: KSerializer<T>, fetch: suspend () -> T): T {
        return try {
            val fresh = fetch()
            runCatching {
                val dir = cacheRoot?.resolve("api_cache")?.apply { mkdirs() }
                dir?.resolve("$key.json")?.writeText(json.encodeToString(ser, fresh))
            }
            fresh
        } catch (e: Exception) {
            if (isNetworkError(e)) {
                val f = cacheRoot?.resolve("api_cache")?.resolve("$key.json")
                if (f != null && f.exists()) {
                    runCatching { return json.decodeFromString(ser, f.readText()) }
                }
            }
            throw e
        }
    }

    private fun isNetworkError(e: Throwable): Boolean =
        e is java.io.IOException || (e is SupabaseApiException && e.status >= 500)

    private suspend fun <T> io(block: suspend () -> T): T = withContext(Dispatchers.IO) { block() }

    // -----------------------------------------------------------------------
    // Auth
    // -----------------------------------------------------------------------

    suspend fun login(email: String, password: String): Pair<Session, Profile> = io {
        val session = client.login(email.trim(), password)
        val authUser = session.user?.takeIf { it.id.isNotBlank() } ?: client.authUser()
        val profile = fetchProfile(authUser.id, authUser.email ?: email.trim())
        store.saveSession(session, profile)
        session to profile
    }

    /**
     * Self-registration. Role is never sent from the client — the migration's
     * handle_new_user() trigger assigns 'Staff' (or 'Admin' for the very first
     * account). Returns null when the project requires email confirmation, in
     * which case no session comes back and the user must confirm first.
     */
    suspend fun register(fullName: String, email: String, password: String): Pair<Session, Profile>? = io {
        val session = client.signUp(email.trim(), password, fullName.trim())
        if (session.accessToken.isBlank()) return@io null
        val authUser = session.user?.takeIf { it.id.isNotBlank() } ?: client.authUser()
        val profile = fetchProfile(authUser.id, authUser.email ?: email.trim())
        store.saveSession(session, profile)
        session to profile
    }

    suspend fun loginWithGoogle(idToken: String, nonce: String): Pair<Session, Profile> = io {
        val session = client.loginWithGoogleIdToken(idToken, nonce)
        val authUser = session.user?.takeIf { it.id.isNotBlank() } ?: client.authUser()
        val profile = fetchProfile(authUser.id, authUser.email.orEmpty())
        store.saveSession(session, profile)
        session to profile
    }

    /** App start: restore saved tokens, re-validate with GoTrue, refresh the profile row. */
    suspend fun restore(): Pair<Session, Profile>? = io {
        if (!client.isConfigured) return@io null
        val access = store.savedAccess() ?: return@io null
        val refresh = store.savedRefresh()
        val cachedProfile = store.savedProfile()
        client.accessToken = access
        client.refreshToken = refresh

        val authUser = try {
            client.authUser()
        } catch (e: SupabaseApiException) {
            if (e.status == 401 && !refresh.isNullOrEmpty()) {
                val s = client.refreshSession(refresh)
                store.updateTokens(s)
                client.authUser()
            } else return@io null
        } catch (e: Exception) {
            null // offline — fall through to the persisted session below
        }

        if (authUser == null) {
            // No server confirmation (offline): trust the saved session so the app
            // opens straight into cached data.
            return@io cachedProfile?.let { Session(access, refresh.orEmpty()) to it }
        }

        val profile = try {
            fetchProfile(authUser.id, authUser.email.orEmpty())
        } catch (e: Exception) {
            cachedProfile ?: return@io null
        }
        val session = Session(
            accessToken = client.accessToken.orEmpty(),
            refreshToken = client.refreshToken.orEmpty(),
        )
        store.saveSession(session, profile)
        session to profile
    }

    suspend fun logout() = io {
        client.revokeSession()
        store.clear()
    }

    suspend fun requestPasswordReset(email: String) = io {
        client.requestPasswordReset(email.trim())
    }

    fun savedProfileNow(): Profile? = store.savedProfile()

    fun biometricEnabledNow(): Boolean = store.biometricEnabled

    fun setBiometricEnabled(enabled: Boolean) {
        store.biometricEnabled = enabled
    }

    private fun fetchProfile(userId: String, email: String): Profile {
        val rows = client.select(
            "profiles", Profile.serializer(),
            params = listOf("id" to "eq.$userId", "limit" to "1"),
        )
        return rows.firstOrNull()
            ?: client.select(
                "profiles", Profile.serializer(),
                params = listOf("email" to "eq.$email", "limit" to "1"),
            ).firstOrNull()
            // The trigger creates the row; this fallback only keeps the UI alive
            // if the profile is momentarily unreadable.
            ?: Profile(id = userId, email = email, fullName = email.substringBefore('@'))
    }

    // -----------------------------------------------------------------------
    // Missions (transport_requests) + mileage_logs
    // -----------------------------------------------------------------------

    suspend fun missions(limit: Int = 200): List<TransportRequest> = cached(
        "missions", ListSerializer(TransportRequest.serializer()),
    ) {
        io {
            client.select(
                "transport_requests", TransportRequest.serializer(),
                params = listOf("order" to "schedule_date.desc", "limit" to "$limit"),
            )
        }
    }

    suspend fun completedMissions(limit: Int = 500): List<TransportRequest> = cached(
        "missions_completed", ListSerializer(TransportRequest.serializer()),
    ) {
        io {
            client.select(
                "transport_requests", TransportRequest.serializer(),
                params = listOf(
                    "status" to "eq.${TransportRequest.STATUS_COMPLETED}",
                    "order" to "schedule_date.desc",
                    "limit" to "$limit",
                ),
            )
        }
    }

    suspend fun missionById(id: String): TransportRequest? = io {
        client.select(
            "transport_requests", TransportRequest.serializer(),
            params = listOf("id" to "eq.$id", "limit" to "1"),
        ).firstOrNull()
    }

    suspend fun createMission(payload: TransportRequestPayload): Boolean {
        val body = json.encodeToString(TransportRequestPayload.serializer(), payload)
        return execOrQueue(OfflineQueue.insert("transport_requests", body)) {
            client.insert("transport_requests", body)
        }
    }

    suspend fun updateMissionStatus(id: String, status: String): Boolean {
        val body = """{"status":"$status","updated_at":"${Instant.now()}"}"""
        return execOrQueue(OfflineQueue.patch("transport_requests", id, body)) {
            client.patch("transport_requests", id, body)
        }
    }

    suspend fun deleteMission(id: String): Boolean =
        execOrQueue(OfflineQueue.delete("transport_requests", id)) {
            // mileage_logs cascade on the FK, so the leg disappears with the mission.
            client.delete("transport_requests", id)
        }

    suspend fun mileageLogs(limit: Int = 500): List<MileageLog> = cached(
        "mileage_logs", ListSerializer(MileageLog.serializer()),
    ) {
        io {
            client.select(
                "mileage_logs", MileageLog.serializer(),
                params = listOf("order" to "time_out.desc", "limit" to "$limit"),
            )
        }
    }

    suspend fun mileageLogForRequest(requestId: String): MileageLog? = io {
        client.select(
            "mileage_logs", MileageLog.serializer(),
            params = listOf("request_id" to "eq.$requestId", "limit" to "1"),
        ).firstOrNull()
    }

    /**
     * Mission start: upload the start-ODO photo, open the mileage leg and move
     * the request to Ongoing. Queued whole if the network is down.
     */
    suspend fun startMission(
        request: TransportRequest,
        startOdometer: Int,
        photoPath: String?,
    ): Boolean {
        val payload = MileageStartPayload(
            requestId = request.id,
            driverId = request.assignedDriverId,
            vehicleId = request.vehicleId,
            timeOut = Instant.now().toString(),
            startOdometer = startOdometer,
        )
        val body = json.encodeToString(MileageStartPayload.serializer(), payload)
        val queued = OfflineQueue.insert(
            "mileage_logs", body,
            photoPath = photoPath, photoField = "odo_start_photo_url", photoFolder = "odometer",
        )
        return execOrQueue(queued) {
            val url = uploadIfPresent("odometer", photoPath)
            client.insert("mileage_logs", body.withField("odo_start_photo_url", url))
            client.patch(
                "transport_requests", request.id,
                """{"status":"${TransportRequest.STATUS_ONGOING}","updated_at":"${Instant.now()}"}""",
            )
        }
    }

    /**
     * Mission end: close the leg with the end ODO, remarks and the recorded GPS
     * trace, then mark the request Completed. `distance` is a generated column —
     * Postgres computes it, the client never writes it.
     */
    suspend fun endMission(
        request: TransportRequest,
        log: MileageLog?,
        endOdometer: Int,
        photoPath: String?,
        remarks: String,
        route: List<RoutePoint>,
    ): Boolean {
        val routeJson = if (route.isEmpty()) null
        else json.encodeToString(ListSerializer(RoutePoint.serializer()), route)

        val patchBody = buildJsonObject {
            put("time_in", Instant.now().toString())
            put("end_odometer", endOdometer)
            put("status", "Completed")
            if (remarks.isNotBlank()) put("remarks", remarks.trim())
            if (routeJson != null) put("route_coordinates", routeJson)
        }.toString()

        val logId = log?.id?.takeIf { it.isNotBlank() }
        val queued = if (logId != null) {
            OfflineQueue.patch(
                "mileage_logs", logId, patchBody,
                photoPath = photoPath, photoField = "odo_end_photo_url", photoFolder = "odometer",
            )
        } else {
            // No open leg (started offline and never synced): write a whole row.
            val full = buildJsonObject {
                put("request_id", request.id)
                request.assignedDriverId?.let { put("driver_id", it) }
                request.vehicleId?.let { put("vehicle_id", it) }
                put("time_out", log?.timeOut ?: Instant.now().toString())
                put("time_in", Instant.now().toString())
                put("start_odometer", log?.startOdometer ?: endOdometer)
                put("end_odometer", endOdometer)
                put("status", "Completed")
                if (remarks.isNotBlank()) put("remarks", remarks.trim())
                if (routeJson != null) put("route_coordinates", routeJson)
            }.toString()
            OfflineQueue.insert(
                "mileage_logs", full,
                photoPath = photoPath, photoField = "odo_end_photo_url", photoFolder = "odometer",
            )
        }

        return execOrQueue(queued) {
            val url = uploadIfPresent("odometer", photoPath)
            if (logId != null) {
                client.patch("mileage_logs", logId, patchBody.withField("odo_end_photo_url", url))
            } else {
                client.insert("mileage_logs", queued.body.withField("odo_end_photo_url", url))
            }
            client.patch(
                "transport_requests", request.id,
                """{"status":"${TransportRequest.STATUS_COMPLETED}","updated_at":"${Instant.now()}"}""",
            )
        }
    }

    // -----------------------------------------------------------------------
    // Fleet: drivers, vehicles, service logs, fuel logs
    // -----------------------------------------------------------------------

    suspend fun drivers(): List<Driver> = cached("drivers", ListSerializer(Driver.serializer())) {
        io {
            client.select(
                "drivers", Driver.serializer(),
                params = listOf("order" to "full_name.asc", "limit" to "300"),
            )
        }
    }

    suspend fun vehicles(): List<Vehicle> = cached("vehicles", ListSerializer(Vehicle.serializer())) {
        io {
            client.select(
                "vehicles", Vehicle.serializer(),
                params = listOf("order" to "plate_number.asc", "limit" to "300"),
            )
        }
    }

    suspend fun serviceLogs(limit: Int = 300): List<ServiceLog> = cached(
        "service_logs", ListSerializer(ServiceLog.serializer()),
    ) {
        io {
            client.select(
                "service_logs", ServiceLog.serializer(),
                params = listOf("order" to "service_date.desc", "limit" to "$limit"),
            )
        }
    }

    suspend fun fuelLogs(limit: Int = 500): List<FuelLog> = cached(
        "fuel_logs", ListSerializer(FuelLog.serializer()),
    ) {
        io {
            client.select(
                "fuel_logs", FuelLog.serializer(),
                params = listOf("order" to "fill_date.desc", "limit" to "$limit"),
            )
        }
    }

    suspend fun saveDriver(id: String?, payload: DriverPayload, licensePhotoPath: String?): Boolean {
        val base = json.encodeToString(DriverPayload.serializer(), payload)
        val queued = if (id == null) {
            OfflineQueue.insert("drivers", base, licensePhotoPath, "license_photo_url", "licenses")
        } else {
            OfflineQueue.patch("drivers", id, base, licensePhotoPath, "license_photo_url", "licenses")
        }
        return execOrQueue(queued) {
            val url = uploadIfPresent("licenses", licensePhotoPath)
            // The licence photo doubles as the driver's circular avatar.
            var body = base.withField("license_photo_url", url)
            body = body.withField("avatar_url", url)
            if (id == null) client.insert("drivers", body) else client.patch("drivers", id, body)
        }
    }

    suspend fun deleteDriver(id: String): Boolean =
        execOrQueue(OfflineQueue.delete("drivers", id)) { client.delete("drivers", id) }

    suspend fun saveVehicle(
        id: String?,
        payload: VehiclePayload,
        vehiclePhotoPath: String?,
        registrationPhotoPath: String?,
        insurancePhotoPath: String?,
    ): Boolean {
        val base = json.encodeToString(VehiclePayload.serializer(), payload)
        // Only the vehicle photo rides the offline queue; the document captures are
        // rare enough that an offline replay keeps just the dates the user typed.
        val queued = if (id == null) {
            OfflineQueue.insert("vehicles", base, vehiclePhotoPath, "image_url", "vehicles")
        } else {
            OfflineQueue.patch("vehicles", id, base, vehiclePhotoPath, "image_url", "vehicles")
        }
        return execOrQueue(queued) {
            var body = base
            uploadIfPresent("vehicles", vehiclePhotoPath)?.let { body = body.withField("image_url", it) }
            uploadIfPresent("registration", registrationPhotoPath)?.let {
                body = body.withField("registration_photo_url", it)
            }
            uploadIfPresent("insurance", insurancePhotoPath)?.let {
                body = body.withField("insurance_photo_url", it)
            }
            if (id == null) client.insert("vehicles", body) else client.patch("vehicles", id, body)
        }
    }

    suspend fun deleteVehicle(id: String): Boolean =
        execOrQueue(OfflineQueue.delete("vehicles", id)) { client.delete("vehicles", id) }

    /**
     * Logging a service. A "Tire Replacement" with an odometer reading restarts
     * the tire-wear clock on the vehicle, exactly like the web app does.
     */
    suspend fun createServiceLog(payload: ServiceLogPayload, reportPhotoPath: String?): Boolean {
        val base = json.encodeToString(ServiceLogPayload.serializer(), payload)
        val queued = OfflineQueue.insert("service_logs", base, reportPhotoPath, "report_photo_url", "casa-reports")
        return execOrQueue(queued) {
            val url = uploadIfPresent("casa-reports", reportPhotoPath)
            client.insert("service_logs", base.withField("report_photo_url", url))
            if (payload.serviceType == "Tire Replacement" && payload.odometerAtService != null) {
                client.patch(
                    "vehicles", payload.vehicleId,
                    """{"tire_changed_odometer":${payload.odometerAtService},"updated_at":"${Instant.now()}"}""",
                )
            }
        }
    }

    suspend fun deleteServiceLog(id: String): Boolean =
        execOrQueue(OfflineQueue.delete("service_logs", id)) { client.delete("service_logs", id) }

    suspend fun createFuelLog(payload: FuelLogPayload, receiptPhotoPath: String?): Boolean {
        val base = json.encodeToString(FuelLogPayload.serializer(), payload)
        val queued = OfflineQueue.insert("fuel_logs", base, receiptPhotoPath, "receipt_photo_url", "receipts")
        return execOrQueue(queued) {
            val url = uploadIfPresent("receipts", receiptPhotoPath)
            client.insert("fuel_logs", base.withField("receipt_photo_url", url))
        }
    }

    // -----------------------------------------------------------------------
    // Settings: brand theme, user accounts, fuel bands
    // -----------------------------------------------------------------------

    suspend fun orgSettings(): OrgSettings = io {
        val fetched = runCatching {
            client.select("org_settings", OrgSettings.serializer(), params = listOf("limit" to "1")).firstOrNull()
        }.getOrNull()
        if (fetched != null) store.saveTheme(fetched)
        fetched ?: store.savedTheme() ?: OrgSettings()
    }

    fun cachedOrgSettings(): OrgSettings = store.savedTheme() ?: OrgSettings()

    suspend fun saveOrgSettings(primary: String, accent: String): Boolean {
        val body = """{"brand_primary":"$primary","brand_accent":"$accent","updated_at":"${Instant.now()}"}"""
        store.saveTheme(OrgSettings(primary, accent))
        // org_settings is a single row keyed id = true.
        return execOrQueue(
            PendingAction(
                type = "patch_where", table = "org_settings", body = body,
                rowId = "is.true", createdAt = Instant.now().toString(),
            )
        ) {
            client.patchWhere("org_settings", listOf("id" to "is.true"), body)
        }
    }

    fun fuelConfigNow(): FuelConfig = store.savedFuelConfig()

    fun saveFuelConfig(cfg: FuelConfig) = store.saveFuelConfig(cfg)

    suspend fun profiles(): List<Profile> = cached("profiles", ListSerializer(Profile.serializer())) {
        io {
            client.select(
                "profiles", Profile.serializer(),
                params = listOf("order" to "full_name.asc", "limit" to "200"),
            )
        }
    }

    /** Admin: change a teammate's role or status (RLS restricts this to Admins). */
    suspend fun updateProfile(id: String, role: String?, status: String?, fullName: String?): Boolean {
        val body = buildJsonObject {
            role?.let { put("role", it) }
            status?.let { put("status", it) }
            fullName?.let { put("full_name", it) }
        }.toString()
        return execOrQueue(OfflineQueue.patch("profiles", id, body)) {
            client.patch("profiles", id, body)
        }
    }

    /**
     * Client-side account-safety guards, mirroring userAdmin.remove() in db.js:
     * you can't disable/delete yourself, and you can't remove the last active
     * Admin. NOTE: these run on the device only — see the report; the durable
     * fix is a SECURITY DEFINER Postgres function, which this pass does not add.
     */
    fun guardAccountChange(
        target: Profile,
        current: Profile,
        newRole: String,
        newStatus: String,
        allProfiles: List<Profile>,
    ): String? {
        if (target.id == current.id && (newRole != Profile.ROLE_ADMIN || newStatus != Profile.STATUS_ACTIVE)) {
            return "You can't remove your own admin access while signed in with this account."
        }
        val losingAdmin = target.isAdmin && target.isActive &&
            (newRole != Profile.ROLE_ADMIN || newStatus != Profile.STATUS_ACTIVE)
        if (losingAdmin) {
            val otherActiveAdmins = allProfiles.count {
                it.id != target.id && it.isAdmin && it.isActive
            }
            if (otherActiveAdmins == 0) return "Can't remove the last active admin account."
        }
        return null
    }

    fun guardAccountDelete(target: Profile, current: Profile, allProfiles: List<Profile>): String? {
        if (target.id == current.id) return "You can't delete the account you're signed in with."
        if (target.isAdmin && target.isActive) {
            val otherActiveAdmins = allProfiles.count { it.id != target.id && it.isAdmin && it.isActive }
            if (otherActiveAdmins == 0) return "Can't delete the last active admin account."
        }
        return null
    }

    /**
     * "Deleting" a teammate disables their profile row. Removing the auth user
     * itself needs the service-role key, which must never ship in an app — an
     * Admin completes that in the Supabase dashboard (or a future edge function).
     */
    suspend fun disableProfile(id: String): Boolean {
        val body = """{"status":"${Profile.STATUS_DISABLED}"}"""
        return execOrQueue(OfflineQueue.patch("profiles", id, body)) {
            client.patch("profiles", id, body)
        }
    }

    // -----------------------------------------------------------------------
    // Media + queue plumbing
    // -----------------------------------------------------------------------

    /** Persists captured bytes to durable app storage so they survive a queue cycle. */
    fun persistPendingPhoto(bytes: ByteArray): String? {
        val dir = cacheRoot?.resolve("pending_photos")?.apply { mkdirs() } ?: return null
        val f = dir.resolve("${UUID.randomUUID()}.jpg")
        f.writeBytes(bytes)
        return f.absolutePath
    }

    private fun uploadIfPresent(folder: String, path: String?): String? {
        if (path.isNullOrBlank()) return null
        val f = File(path)
        if (!f.exists()) return null
        val objectPath = "$folder/${UUID.randomUUID()}.jpg"
        val url = client.uploadImage(SupabaseClient.MEDIA_BUCKET, objectPath, f.readBytes(), "image/jpeg")
        f.delete()
        return url
    }

    /** Adds/overwrites one string field in a JSON object body (no-op on null). */
    private fun String.withField(field: String, value: String?): String {
        if (value == null) return this
        val obj = runCatching { json.parseToJsonElement(this).jsonObject }.getOrNull() ?: return this
        val merged = JsonObject(obj.toMutableMap().apply { put(field, JsonPrimitive(value)) })
        return merged.toString()
    }

    /** Runs online; on network failure stores the action. True = done now, false = queued. */
    private suspend fun execOrQueue(action: PendingAction, block: suspend () -> Unit): Boolean = try {
        io { block() }
        true
    } catch (e: Exception) {
        if (isNetworkError(e)) {
            OfflineQueue.enqueue(action)
            false
        } else throw e
    }

    /** Replays one queued action (called by OfflineQueue.flush). */
    suspend fun replay(action: PendingAction) = io {
        val url = uploadIfPresent(action.photoFolder, action.photoPath)
        val body = if (action.photoField != null) action.body.withField(action.photoField, url) else action.body
        when (action.type) {
            "insert" -> client.insert(action.table, body)
            "patch" -> client.patch(action.table, action.rowId.orEmpty(), body)
            "patch_where" -> client.patchWhere(action.table, listOf("id" to (action.rowId ?: "is.true")), body)
            "delete" -> client.delete(action.table, action.rowId.orEmpty())
            else -> error("Unknown queued action ${action.type}")
        }
    }
}
