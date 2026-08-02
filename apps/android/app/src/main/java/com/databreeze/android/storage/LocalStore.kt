package com.databreeze.android.storage

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.MessageDigest

private val safeOpaqueId = Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
private val safeOperation = Regex("[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}")
private val sha256Digest = Regex("sha256:[0-9a-fA-F]{64}")

/** The only scope that may be used to address Android-local state. */
data class AccountWorkspaceScope(
    val accountId: String,
    val workspaceId: String,
) {
    init {
        require(safeOpaqueId.matches(accountId)) { "accountId must be a bounded opaque identifier" }
        require(safeOpaqueId.matches(workspaceId)) { "workspaceId must be a bounded opaque identifier" }
    }

    /** Bounded, deterministic, content-minimized key for WorkManager unique work. */
    val stableKey: String = "scope-${sha256("$accountId\u0000$workspaceId")}"
}

private fun sha256(value: String): String = MessageDigest
    .getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString(separator = "") { byte -> "%02x".format(byte) }

@Entity(
    tableName = "sync_queue",
    primaryKeys = ["accountId", "workspaceId", "mutationId"],
    indices = [Index(value = ["accountId", "workspaceId", "state"])],
)
data class SyncQueueEntity(
    val accountId: String,
    val workspaceId: String,
    val mutationId: String,
    val operationType: String,
    val payloadHash: String,
    val dependencyId: String? = null,
    val state: String = QUEUED_STATE,
    val createdAtEpochMs: Long,
) {
    init {
        AccountWorkspaceScope(accountId, workspaceId)
        require(safeOpaqueId.matches(mutationId)) { "mutationId must be a bounded opaque identifier" }
        require(safeOperation.matches(operationType)) { "operationType must be a bounded operation name" }
        require(sha256Digest.matches(payloadHash)) { "payloadHash must be a sha256 digest" }
        require(dependencyId == null || safeOpaqueId.matches(dependencyId)) {
            "dependencyId must be a bounded opaque identifier"
        }
        require(state in setOf(QUEUED_STATE, IN_FLIGHT_STATE, COMPLETED_STATE)) { "state is not supported" }
        require(createdAtEpochMs >= 0L) { "createdAtEpochMs cannot be negative" }
    }

    companion object {
        const val QUEUED_STATE = "queued"
        const val IN_FLIGHT_STATE = "in-flight"
        const val COMPLETED_STATE = "completed"
    }
}

@Dao
interface SyncQueueDao {
    @Query(
        """
        SELECT * FROM sync_queue
        WHERE accountId = :accountId AND workspaceId = :workspaceId
        ORDER BY createdAtEpochMs ASC, mutationId ASC
        """,
    )
    fun observe(accountId: String, workspaceId: String): Flow<List<SyncQueueEntity>>

    @Query(
        """
        SELECT * FROM sync_queue
        WHERE accountId = :accountId AND workspaceId = :workspaceId
        ORDER BY createdAtEpochMs ASC, mutationId ASC
        """,
    )
    suspend fun snapshot(accountId: String, workspaceId: String): List<SyncQueueEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(item: SyncQueueEntity): Long

    @Query(
        "DELETE FROM sync_queue WHERE accountId = :accountId AND workspaceId = :workspaceId AND mutationId = :mutationId",
    )
    suspend fun delete(accountId: String, workspaceId: String, mutationId: String): Int

    @Query("DELETE FROM sync_queue WHERE accountId = :accountId AND workspaceId = :workspaceId")
    suspend fun clear(accountId: String, workspaceId: String): Int

    @Query(
        "UPDATE sync_queue SET state = '${SyncQueueEntity.COMPLETED_STATE}' WHERE accountId = :accountId AND workspaceId = :workspaceId AND mutationId = :mutationId",
    )
    suspend fun markCompleted(accountId: String, workspaceId: String, mutationId: String): Int

    @Query(
        "DELETE FROM sync_queue WHERE accountId = :accountId AND workspaceId = :workspaceId AND mutationId IN (:mutationIds)",
    )
    suspend fun deleteBatch(accountId: String, workspaceId: String, mutationIds: List<String>): Int
}

@Database(entities = [SyncQueueEntity::class], version = 1, exportSchema = true)
abstract class DataBreezeDatabase : RoomDatabase() {
    abstract fun syncQueue(): SyncQueueDao
}

/** Port used by feature modules; no Android context or database leaks into the domain. */
interface LocalStorePort {
    suspend fun enqueue(mutation: SyncQueueEntity)
    fun observeQueue(scope: AccountWorkspaceScope): Flow<List<SyncQueueEntity>>
    suspend fun snapshotQueue(scope: AccountWorkspaceScope): List<SyncQueueEntity>
    suspend fun delete(scope: AccountWorkspaceScope, mutationId: String): Boolean
    suspend fun deleteBatch(scope: AccountWorkspaceScope, mutationIds: List<String>): Int
    suspend fun markCompleted(scope: AccountWorkspaceScope, mutationId: String): Boolean
    suspend fun clear(scope: AccountWorkspaceScope)
}

class RoomLocalStore private constructor(private val database: DataBreezeDatabase) : LocalStorePort {
    private val dao: SyncQueueDao = database.syncQueue()

    override suspend fun enqueue(mutation: SyncQueueEntity) {
        dao.enqueue(mutation)
    }

    override fun observeQueue(scope: AccountWorkspaceScope): Flow<List<SyncQueueEntity>> =
        dao.observe(scope.accountId, scope.workspaceId)

    override suspend fun snapshotQueue(scope: AccountWorkspaceScope): List<SyncQueueEntity> =
        dao.snapshot(scope.accountId, scope.workspaceId)

    override suspend fun delete(scope: AccountWorkspaceScope, mutationId: String): Boolean =
        dao.delete(scope.accountId, scope.workspaceId, mutationId) == 1

    override suspend fun deleteBatch(scope: AccountWorkspaceScope, mutationIds: List<String>): Int =
        if (mutationIds.isEmpty()) 0 else dao.deleteBatch(scope.accountId, scope.workspaceId, mutationIds)

    override suspend fun markCompleted(scope: AccountWorkspaceScope, mutationId: String): Boolean =
        dao.markCompleted(scope.accountId, scope.workspaceId, mutationId) == 1

    override suspend fun clear(scope: AccountWorkspaceScope) {
        dao.clear(scope.accountId, scope.workspaceId)
    }

    fun close() = database.close()

    companion object {
        fun create(context: Context): RoomLocalStore =
            RoomLocalStore(
                Room.databaseBuilder(context, DataBreezeDatabase::class.java, "databreeze-local.db")
                    .enableMultiInstanceInvalidation()
                    .build(),
            )

        fun from(database: DataBreezeDatabase): RoomLocalStore = RoomLocalStore(database)
    }
}

/** Deterministic fake used by JVM tests and by the no-network shell configuration. */
class InMemoryLocalStore : LocalStorePort {
    private val mutex = Mutex()
    private val items = linkedMapOf<String, SyncQueueEntity>()
    private val updates = MutableStateFlow<List<SyncQueueEntity>>(emptyList())

    override suspend fun enqueue(mutation: SyncQueueEntity) {
        mutex.withLock {
            items.putIfAbsent(key(mutation.accountId, mutation.workspaceId, mutation.mutationId), mutation)
            publish()
        }
    }

    override fun observeQueue(scope: AccountWorkspaceScope): Flow<List<SyncQueueEntity>> =
        updates.asStateFlow().map { values ->
            values.filter { it.accountId == scope.accountId && it.workspaceId == scope.workspaceId }
                .sortedWith(compareBy({ it.createdAtEpochMs }, { it.mutationId }))
        }.distinctUntilChanged()

    override suspend fun snapshotQueue(scope: AccountWorkspaceScope): List<SyncQueueEntity> = mutex.withLock {
        items.values
            .filter { it.accountId == scope.accountId && it.workspaceId == scope.workspaceId }
            .sortedWith(compareBy({ it.createdAtEpochMs }, { it.mutationId }))
    }

    override suspend fun delete(scope: AccountWorkspaceScope, mutationId: String): Boolean = mutex.withLock {
        val removed = items.remove(key(scope.accountId, scope.workspaceId, mutationId)) != null
        publish()
        removed
    }

    override suspend fun deleteBatch(scope: AccountWorkspaceScope, mutationIds: List<String>): Int = mutex.withLock {
        var removed = 0
        mutationIds.forEach { mutationId ->
            if (items.remove(key(scope.accountId, scope.workspaceId, mutationId)) != null) removed++
        }
        if (removed > 0) publish()
        removed
    }

    override suspend fun markCompleted(scope: AccountWorkspaceScope, mutationId: String): Boolean = mutex.withLock {
        val key = key(scope.accountId, scope.workspaceId, mutationId)
        val current = items[key] ?: return@withLock false
        items[key] = current.copy(state = SyncQueueEntity.COMPLETED_STATE)
        publish()
        true
    }

    override suspend fun clear(scope: AccountWorkspaceScope) {
        mutex.withLock {
            items.keys.removeIf { it.startsWith("${scope.accountId}\u0000${scope.workspaceId}\u0000") }
            publish()
        }
    }

    private fun publish() {
        updates.value = items.values.toList()
    }

    private fun key(accountId: String, workspaceId: String, mutationId: String): String =
        "$accountId\u0000$workspaceId\u0000$mutationId"
}
