package com.rhex.fleetflow.nativeapp.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// Auth (GoTrue)
// ---------------------------------------------------------------------------

@Serializable
data class Session(
    @SerialName("access_token") val accessToken: String = "",
    @SerialName("refresh_token") val refreshToken: String = "",
    @SerialName("expires_in") val expiresIn: Long = 0,
    @SerialName("expires_at") val expiresAt: Long = 0,
    @SerialName("user") val user: AuthUser? = null,
)

@Serializable
data class AuthUser(
    val id: String = "",
    val email: String? = null,
)

/**
 * public.profiles — one row per auth.users, carrying the app-level role/status.
 * Self-registration always lands as 'Staff' (the handle_new_user trigger decides;
 * the client never sends a role).
 */
@Serializable
data class Profile(
    val id: String = "",
    @SerialName("full_name") val fullName: String = "",
    val email: String = "",
    val role: String = ROLE_STAFF,
    val status: String = STATUS_ACTIVE,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isAdmin: Boolean get() = role == ROLE_ADMIN
    val isActive: Boolean get() = status == STATUS_ACTIVE

    companion object {
        const val ROLE_ADMIN = "Admin"
        const val ROLE_STAFF = "Staff"
        const val STATUS_ACTIVE = "Active"
        const val STATUS_DISABLED = "Disabled"
    }
}

// ---------------------------------------------------------------------------
// Fleet entities
// ---------------------------------------------------------------------------

@Serializable
data class Driver(
    val id: String = "",
    @SerialName("full_name") val fullName: String = "",
    @SerialName("employee_id") val employeeId: String? = null,
    @SerialName("contact_number") val contactNumber: String? = null,
    val email: String? = null,
    @SerialName("license_number") val licenseNumber: String? = null,
    @SerialName("license_expiry") val licenseExpiry: String? = null,
    @SerialName("license_photo_url") val licensePhotoUrl: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("assigned_vehicle_plate") val assignedVehiclePlate: String? = null,
    val status: String = "Active",
    val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

/** Body for insert/update — omits server-managed columns (id, created_at). */
@Serializable
data class DriverPayload(
    @SerialName("full_name") val fullName: String,
    @SerialName("employee_id") val employeeId: String? = null,
    @SerialName("contact_number") val contactNumber: String? = null,
    val email: String? = null,
    @SerialName("license_number") val licenseNumber: String? = null,
    @SerialName("license_expiry") val licenseExpiry: String? = null,
    @SerialName("license_photo_url") val licensePhotoUrl: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("assigned_vehicle_plate") val assignedVehiclePlate: String? = null,
    val status: String = "Active",
    val notes: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class Vehicle(
    val id: String = "",
    @SerialName("plate_number") val plateNumber: String = "",
    @SerialName("unit_name") val unitName: String? = null,
    val model: String? = null,
    val status: String = STATUS_AVAILABLE,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("fuel_type") val fuelType: String? = "diesel",
    @SerialName("tank_liters") val tankLiters: Double? = null,
    @SerialName("rated_km_per_liter") val ratedKmPerLiter: Double? = null,
    @SerialName("pms_interval_km") val pmsIntervalKm: Int? = null,
    @SerialName("pms_interval_months") val pmsIntervalMonths: Int? = null,
    @SerialName("registration_expiry") val registrationExpiry: String? = null,
    @SerialName("insurance_expiry") val insuranceExpiry: String? = null,
    @SerialName("registration_photo_url") val registrationPhotoUrl: String? = null,
    @SerialName("insurance_photo_url") val insurancePhotoUrl: String? = null,
    @SerialName("tire_life_km") val tireLifeKm: Int? = null,
    @SerialName("tire_changed_odometer") val tireChangedOdometer: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val label: String get() = model?.takeIf { it.isNotBlank() } ?: unitName?.takeIf { it.isNotBlank() } ?: "—"

    companion object {
        const val STATUS_AVAILABLE = "available"
        const val STATUS_IN_USE = "in_use"
        const val STATUS_MAINTENANCE = "maintenance"
        val STATUSES = listOf(STATUS_AVAILABLE, STATUS_IN_USE, STATUS_MAINTENANCE)
    }
}

@Serializable
data class VehiclePayload(
    @SerialName("plate_number") val plateNumber: String,
    @SerialName("unit_name") val unitName: String? = null,
    val model: String? = null,
    val status: String = Vehicle.STATUS_AVAILABLE,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("fuel_type") val fuelType: String = "diesel",
    @SerialName("tank_liters") val tankLiters: Double = 60.0,
    @SerialName("rated_km_per_liter") val ratedKmPerLiter: Double = 9.0,
    @SerialName("pms_interval_km") val pmsIntervalKm: Int = 10000,
    @SerialName("pms_interval_months") val pmsIntervalMonths: Int = 6,
    @SerialName("registration_expiry") val registrationExpiry: String? = null,
    @SerialName("insurance_expiry") val insuranceExpiry: String? = null,
    @SerialName("registration_photo_url") val registrationPhotoUrl: String? = null,
    @SerialName("insurance_photo_url") val insurancePhotoUrl: String? = null,
    @SerialName("tire_life_km") val tireLifeKm: Int = 40000,
    @SerialName("tire_changed_odometer") val tireChangedOdometer: Int = 0,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class ServiceLog(
    val id: String = "",
    @SerialName("vehicle_id") val vehicleId: String = "",
    @SerialName("service_type") val serviceType: String = "",
    @SerialName("service_date") val serviceDate: String = "",
    @SerialName("odometer_at_service") val odometerAtService: Int? = null,
    @SerialName("next_service_km") val nextServiceKm: Int? = null,
    @SerialName("next_service_date") val nextServiceDate: String? = null,
    @SerialName("service_provider") val serviceProvider: String? = null,
    val cost: Double? = null,
    val notes: String? = null,
    val source: String = "manual",
    @SerialName("report_photo_url") val reportPhotoUrl: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class ServiceLogPayload(
    @SerialName("vehicle_id") val vehicleId: String,
    @SerialName("service_type") val serviceType: String,
    @SerialName("service_date") val serviceDate: String,
    @SerialName("odometer_at_service") val odometerAtService: Int? = null,
    @SerialName("next_service_km") val nextServiceKm: Int? = null,
    @SerialName("next_service_date") val nextServiceDate: String? = null,
    @SerialName("service_provider") val serviceProvider: String? = null,
    val cost: Double? = null,
    val notes: String? = null,
    val source: String = "manual",
    @SerialName("report_photo_url") val reportPhotoUrl: String? = null,
)

@Serializable
data class FuelLog(
    val id: String = "",
    @SerialName("vehicle_id") val vehicleId: String = "",
    @SerialName("fill_date") val fillDate: String = "",
    val odometer: Int = 0,
    val liters: Double = 0.0,
    val cost: Double = 0.0,
    @SerialName("full_tank") val fullTank: Boolean = true,
    val station: String? = null,
    @SerialName("receipt_photo_url") val receiptPhotoUrl: String? = null,
    @SerialName("encoded_by") val encodedBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class FuelLogPayload(
    @SerialName("vehicle_id") val vehicleId: String,
    @SerialName("fill_date") val fillDate: String,
    val odometer: Int,
    val liters: Double,
    val cost: Double,
    @SerialName("full_tank") val fullTank: Boolean = true,
    val station: String? = null,
    @SerialName("receipt_photo_url") val receiptPhotoUrl: String? = null,
    @SerialName("encoded_by") val encodedBy: String? = null,
)

/** transport_requests — guest bookings and department errands ("missions"). */
@Serializable
data class TransportRequest(
    val id: String = "",
    @SerialName("mission_id") val missionId: String = "",
    @SerialName("guest_name") val guestName: String = "",
    @SerialName("requester_type") val requesterType: String = TYPE_GUEST,
    @SerialName("requested_by") val requestedBy: String? = null,
    @SerialName("pax_count") val paxCount: Int = 1,
    @SerialName("booking_type") val bookingType: String = "",
    @SerialName("pickup_location") val pickupLocation: String = "",
    val destination: String = "",
    @SerialName("schedule_date") val scheduleDate: String = "",
    @SerialName("schedule_time") val scheduleTime: String = "",
    @SerialName("assigned_driver_id") val assignedDriverId: String? = null,
    @SerialName("vehicle_id") val vehicleId: String? = null,
    val department: String? = null,
    @SerialName("special_notes") val specialNotes: String? = null,
    val status: String = STATUS_PENDING,
    @SerialName("created_by") val createdBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isErrand: Boolean get() = requesterType == TYPE_ERRAND

    companion object {
        const val TYPE_GUEST = "Guest"
        const val TYPE_ERRAND = "Errand"

        // Status vocabulary comes from the migration's CHECK constraint. The web
        // app's "In Progress" is this schema's "Ongoing".
        const val STATUS_PENDING = "Pending"
        const val STATUS_ASSIGNED = "Assigned"
        const val STATUS_ONGOING = "Ongoing"
        const val STATUS_COMPLETED = "Completed"
        const val STATUS_CANCELLED = "Cancelled"
        val STATUSES = listOf(STATUS_PENDING, STATUS_ASSIGNED, STATUS_ONGOING, STATUS_COMPLETED, STATUS_CANCELLED)
    }
}

@Serializable
data class TransportRequestPayload(
    @SerialName("guest_name") val guestName: String,
    @SerialName("requester_type") val requesterType: String = TransportRequest.TYPE_GUEST,
    @SerialName("requested_by") val requestedBy: String? = null,
    @SerialName("pax_count") val paxCount: Int = 1,
    @SerialName("booking_type") val bookingType: String,
    @SerialName("pickup_location") val pickupLocation: String,
    val destination: String,
    @SerialName("schedule_date") val scheduleDate: String,
    @SerialName("schedule_time") val scheduleTime: String,
    @SerialName("assigned_driver_id") val assignedDriverId: String? = null,
    @SerialName("vehicle_id") val vehicleId: String? = null,
    val department: String? = null,
    @SerialName("special_notes") val specialNotes: String? = null,
    val status: String = TransportRequest.STATUS_PENDING,
    @SerialName("created_by") val createdBy: String? = null,
)

/**
 * mileage_logs — one per mission leg. `distance` is a generated column
 * (end_odometer - start_odometer) and must never be written from the client.
 */
@Serializable
data class MileageLog(
    val id: String = "",
    @SerialName("request_id") val requestId: String = "",
    @SerialName("driver_id") val driverId: String? = null,
    @SerialName("vehicle_id") val vehicleId: String? = null,
    @SerialName("time_out") val timeOut: String? = null,
    @SerialName("time_in") val timeIn: String? = null,
    @SerialName("start_odometer") val startOdometer: Int? = null,
    @SerialName("end_odometer") val endOdometer: Int? = null,
    @SerialName("odo_start_photo_url") val odoStartPhotoUrl: String? = null,
    @SerialName("odo_end_photo_url") val odoEndPhotoUrl: String? = null,
    val distance: Int? = null,
    val remarks: String? = null,
    val status: String = "Ongoing",
    @SerialName("route_coordinates") val routeCoordinates: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class MileageStartPayload(
    @SerialName("request_id") val requestId: String,
    @SerialName("driver_id") val driverId: String? = null,
    @SerialName("vehicle_id") val vehicleId: String? = null,
    @SerialName("time_out") val timeOut: String,
    @SerialName("start_odometer") val startOdometer: Int,
    @SerialName("odo_start_photo_url") val odoStartPhotoUrl: String? = null,
    val status: String = "Ongoing",
)

@Serializable
data class RoutePoint(val lat: Double, val lng: Double, val ts: String)

/** org_settings — single row (id = true) holding the brand palette. */
@Serializable
data class OrgSettings(
    @SerialName("brand_primary") val brandPrimary: String = "#1E7A5A",
    @SerialName("brand_accent") val brandAccent: String = "#F2B705",
    @SerialName("updated_at") val updatedAt: String? = null,
)

/** Queued write, replayed when connectivity returns. */
@Serializable
data class PendingAction(
    val type: String, // insert | patch | delete
    val table: String,
    val body: String = "{}",
    val rowId: String? = null,
    /** Local file captured offline; uploaded at replay and injected as [photoField]. */
    val photoPath: String? = null,
    val photoField: String? = null,
    val photoFolder: String = "misc",
    @SerialName("created_at") val createdAt: String,
    var attempts: Int = 0,
    var lastError: String? = null,
)

// ---------------------------------------------------------------------------
// Vocabularies — ported from src/lib/utils.js
// ---------------------------------------------------------------------------

object Vocab {
    val BOOKING_TYPES = listOf("Drop-off", "Airport Pick-up", "Special Request", "Other")

    val DEPARTMENTS = listOf(
        "Owner", "Marketing", "Operations Manager", "Purchasing", "Front Office",
        "HR & Admin", "Finance", "Engineering", "Sales", "Other",
    )

    val SERVICE_TYPES = listOf(
        "General Inspection", "Preventive Maintenance", "Oil Change",
        "Tire Replacement", "Registration Renewal", "Repair", "Other",
    )

    fun bookingIcon(type: String?): String = when (type) {
        "Drop-off" -> "↓"
        "Airport Pick-up" -> "✈"
        "Special Request" -> "★"
        else -> "•"
    }
}
