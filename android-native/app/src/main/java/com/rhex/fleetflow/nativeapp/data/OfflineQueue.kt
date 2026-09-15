package com.rhex.fleetflow.nativeapp.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant

/**
 * Offline write queue. Any write that fails for network reasons is serialized to
 * disk and replayed — in order — the next time connectivity returns or the app
 * opens. Mirrors the web app's enqueueAction/drainQueue pair.
 *
 * Actions are expressed generically (insert / patch / delete on a table) so any
 * repository write is queueable without a bespoke replay branch. A photo
 * captured while offline rides along as a local file path and is uploaded at
 * replay time, then injected into the row body under [PendingAction.photoField].
 */
object OfflineQueue {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    private lateinit var file: File
    private val mutex = Mutex()
    private val _size = MutableStateFlow(0)
    val size: StateFlow<Int> = _size

    fun init(context: Context) {
        file = File(context.filesDir, "fleetflow_offline_queue.json")
        refreshSize()
    }

    private fun load(): MutableList<PendingAction> =
        if (!this::file.isInitialized || !file.exists()) mutableListOf()
        else runCatching {
            json.decodeFromString(ListSerializer(PendingAction.serializer()), file.readText()).toMutableList()
        }.getOrDefault(mutableListOf())

    private fun persist(list: List<PendingAction>) {
        if (this::file.isInitialized) {
            runCatching { file.writeText(json.encodeToString(ListSerializer(PendingAction.serializer()), list)) }
            _size.value = list.size
        }
    }

    private fun refreshSize() {
        _size.value = load().size
    }

    fun sizeNow(): Int = load().size

    suspend fun enqueue(action: PendingAction) = mutex.withLock {
        val list = load()
        list.add(action)
        persist(list)
    }

    /** Replay everything; each action is dropped as soon as it succeeds. */
    suspend fun flush(repo: Repository): Int {
        if (!mutex.tryLock()) return 0 // a flush is already running
        try {
            var synced = 0
            while (true) {
                val list = load()
                val action = list.firstOrNull() ?: break
                val outcome = runCatching { repo.replay(action) }
                if (outcome.isSuccess) {
                    list.removeAt(0)
                    persist(list)
                    synced++
                } else {
                    action.attempts++
                    action.lastError = outcome.exceptionOrNull()?.message?.take(120)
                    if (action.attempts >= 5) {
                        // Give up after 5 tries — likely a data conflict, not connectivity.
                        list.removeAt(0)
                        persist(list)
                    } else {
                        list[0] = action
                        persist(list)
                        break // stop this flush; the next connectivity event retries
                    }
                }
            }
            refreshSize()
            return synced
        } finally {
            mutex.unlock()
        }
    }

    // ---- builders ----

    fun insert(table: String, body: String, photoPath: String? = null, photoField: String? = null, photoFolder: String = "misc") =
        PendingAction(
            type = "insert", table = table, body = body, photoPath = photoPath,
            photoField = photoField, photoFolder = photoFolder, createdAt = Instant.now().toString(),
        )

    fun patch(table: String, rowId: String, body: String, photoPath: String? = null, photoField: String? = null, photoFolder: String = "misc") =
        PendingAction(
            type = "patch", table = table, rowId = rowId, body = body, photoPath = photoPath,
            photoField = photoField, photoFolder = photoFolder, createdAt = Instant.now().toString(),
        )

    fun delete(table: String, rowId: String) =
        PendingAction(type = "delete", table = table, rowId = rowId, createdAt = Instant.now().toString())
}
