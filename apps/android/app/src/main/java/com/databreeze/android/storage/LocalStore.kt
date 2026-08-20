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
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.MessageDigest

private val safeOpaqueId = Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
private val safeOperation = Regex("[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}")
private val sha256Digest = Regex("sha256:[0-9a-fA-F]{64}")
private val uuidValue = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
private val rawSha256Digest = Regex("^[0-9a-fA-F]{64}$")

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

/**
 * Durable typed DSO operation. The worker receives only the operation identifier; the optional
 * encrypted payload stays in Room and is sent only after the authenticated transport validates
 * the current device grant. This is separate from the legacy digest-only queue for migration
 * compatibility.
 */
@Entity(
    tableName = "device_sync_operations",
    primaryKeys = ["accountId", "workspaceId", "operationId"],
    indices = [Index(value = ["accountId", "workspaceId", "state"])],
)
data class DeviceSyncOperationEntity(
    val accountId: String,
    val workspaceId: String,
    val operationId: String,
    val deviceId: String,
    val entityType: String,
    val entityId: String,
    val kind: String,
    val payloadClass: String,
    val payloadDigest: String,
    val encryptedPayload: String? = null,
    val dependencyIds: String? = null,
    val baseRevision: Long? = null,
    val policyVersionId: String? = null,
    val classification: String? = null,
    val state: String = QUEUED_STATE,
    val createdAtEpochMs: Long,
) {
    init {
        AccountWorkspaceScope(accountId, workspaceId)
        require(uuidValue.matches(operationId) && uuidValue.matches(deviceId) && uuidValue.matches(entityId)) { "DSO IDs must be UUIDs" }
        require(entityType.isNotBlank() && entityType.length <= 64) { "entityType is invalid" }
        require(kind in KINDS && payloadClass in PAYLOAD_CLASSES) { "DSO operation kind or payload class is invalid" }
        require(rawSha256Digest.matches(payloadDigest)) { "payloadDigest must be a raw SHA-256" }
        require(encryptedPayload == null || encryptedPayload.length <= 16_384) { "encryptedPayload is too large" }
        require(dependencyIds == null || dependencyIds.length <= 16_384) { "dependencyIds are too large" }
        require(baseRevision == null || baseRevision >= 1L) { "baseRevision must be positive" }
        require(policyVersionId == null || uuidValue.matches(policyVersionId)) { "policyVersionId must be a UUID" }
        require(classification == null || classification in CLASSIFICATIONS) { "classification is invalid" }
        require(state in STATES && createdAtEpochMs >= 0L) { "DSO operation state is invalid" }
    }

    companion object {
        val KINDS = setOf("UPSERT", "DELETE", "ACKNOWLEDGE")
        val PAYLOAD_CLASSES = setOf("CONTROL_METADATA", "APPROVED_DERIVED_RESULT", "RECONSTRUCTABLE_DERIVED_CONTENT")
        val CLASSIFICATIONS = setOf("PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED")
        val STATES = setOf(QUEUED_STATE, IN_FLIGHT_STATE, COMPLETED_STATE, CONFLICT_STATE, QUARANTINED_STATE, REJECTED_STATE)
        const val QUEUED_STATE = "queued"
        const val IN_FLIGHT_STATE = "in-flight"
        const val COMPLETED_STATE = "completed"
        const val CONFLICT_STATE = "conflict"
        const val QUARANTINED_STATE = "quarantined"
        const val REJECTED_STATE = "rejected"
    }
}

private val safeMediaType = Regex("[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*", RegexOption.IGNORE_CASE)
private val safeDigest = Regex("sha256:[0-9a-fA-F]{64}")

/** Durable, content-minimized capture metadata. Binary bytes remain in encrypted files. */
@Entity(
    tableName = "capture_bundles",
    primaryKeys = ["accountId", "workspaceId", "bundleId"],
    indices = [Index(value = ["accountId", "workspaceId", "state"])],
)
data class CaptureBundleEntity(
    val accountId: String,
    val workspaceId: String,
    val bundleId: String,
    val projectId: String? = null,
    val kind: String,
    val state: String = DRAFT_STATE,
    val dataModeSnapshot: String,
    val operationId: String,
    val createdAtEpochMs: Long,
    val revision: Long = 1L,
) {
    init {
        AccountWorkspaceScope(accountId, workspaceId)
        require(safeOpaqueId.matches(bundleId)) { "bundleId must be bounded" }
        require(projectId == null || safeOpaqueId.matches(projectId)) { "projectId must be bounded" }
        require(safeOperation.matches(kind)) { "kind must be a bounded capture kind" }
        require(state in STATES) { "unsupported capture state" }
        require(dataModeSnapshot in DATA_MODES) { "unsupported data mode" }
        require(safeOpaqueId.matches(operationId)) { "operationId must be bounded" }
        require(createdAtEpochMs >= 0L && revision > 0L) { "invalid capture timestamps/revision" }
    }

    companion object {
        const val DRAFT_STATE = "DRAFT"
        const val READY_STATE = "READY"
        const val FINALIZING_STATE = "FINALIZING"
        const val QUEUED_STATE = "QUEUED"
        const val SYNCED_STATE = "SYNCED"
        const val CONFLICT_STATE = "CONFLICT"
        const val FAILED_STATE = "FAILED"
        val STATES = setOf(DRAFT_STATE, READY_STATE, FINALIZING_STATE, QUEUED_STATE, SYNCED_STATE, CONFLICT_STATE, FAILED_STATE)
        val DATA_MODES = setOf("LOCAL", "HYBRID", "CLOUD")
    }
}

@Entity(
    tableName = "capture_items",
    primaryKeys = ["accountId", "workspaceId", "itemId"],
    indices = [Index(value = ["accountId", "workspaceId", "bundleId", "ordinal"])],
)
data class CaptureItemEntity(
    val accountId: String,
    val workspaceId: String,
    val itemId: String,
    val bundleId: String,
    val ordinal: Int,
    val mediaType: String,
    val appPrivateUri: String,
    val byteLength: Long,
    val sha256: String,
    val source: String,
    val orientation: Int? = null,
    val durationMs: Long? = null,
    val original: Boolean = true,
    val syncState: String = SyncQueueEntity.QUEUED_STATE,
    val createdAtEpochMs: Long,
) {
    init {
        AccountWorkspaceScope(accountId, workspaceId)
        require(safeOpaqueId.matches(itemId) && safeOpaqueId.matches(bundleId)) { "capture IDs must be bounded" }
        require(ordinal >= 0 && safeMediaType.matches(mediaType)) { "invalid capture item metadata" }
        require(appPrivateUri.startsWith("app-private://")) { "capture item must use app-private URI" }
        require(byteLength > 0L && safeDigest.matches(sha256)) { "invalid capture bytes metadata" }
        require(source in setOf("CAMERA", "SHARE", "DOCUMENT_PICKER", "VOICE")) { "unsupported capture source" }
        require(durationMs == null || durationMs >= 0L) { "durationMs cannot be negative" }
        require(createdAtEpochMs >= 0L) { "createdAtEpochMs cannot be negative" }
    }
}

@Entity(
    tableName = "review_drafts",
    primaryKeys = ["accountId", "workspaceId", "draftId"],
    indices = [Index(value = ["accountId", "workspaceId", "reviewId"])],
)
data class ReviewDraftEntity(
    val accountId: String,
    val workspaceId: String,
    val draftId: String,
    val reviewId: String,
    val baseRevision: Long,
    val fieldCorrectionsCiphertext: String,
    val evidenceReferenceIds: String,
    val operationId: String,
    val state: String = SyncQueueEntity.QUEUED_STATE,
    val updatedAtEpochMs: Long,
) {
    init {
        AccountWorkspaceScope(accountId, workspaceId)
        require(safeOpaqueId.matches(draftId) && safeOpaqueId.matches(reviewId)) { "review IDs must be bounded" }
        require(baseRevision > 0L && safeOpaqueId.matches(operationId)) { "invalid review draft metadata" }
        require(fieldCorrectionsCiphertext.length <= 64 * 1024 && evidenceReferenceIds.length <= 16 * 1024) { "review draft too large" }
        require(updatedAtEpochMs >= 0L) { "updatedAtEpochMs cannot be negative" }
    }
}

@Entity(
    tableName = "sync_cursors",
    primaryKeys = ["accountId", "workspaceId"],
)
data class SyncCursorEntity(
    val accountId: String,
    val workspaceId: String,
    val cursor: String,
    val revision: Long,
    val updatedAtEpochMs: Long,
) {
    init {
        AccountWorkspaceScope(accountId, workspaceId)
        require(cursor.isNotBlank() && cursor.length <= 4096 && revision >= 0L && updatedAtEpochMs >= 0L) { "invalid sync cursor" }
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

@Dao
interface DeviceSyncOperationDao {
    @Query("SELECT * FROM device_sync_operations WHERE accountId = :accountId AND workspaceId = :workspaceId AND state NOT IN ('completed', 'rejected', 'quarantined') ORDER BY createdAtEpochMs ASC, operationId ASC")
    suspend fun snapshot(accountId: String, workspaceId: String): List<DeviceSyncOperationEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(operation: DeviceSyncOperationEntity): Long

    @Query("DELETE FROM device_sync_operations WHERE accountId = :accountId AND workspaceId = :workspaceId AND operationId IN (:operationIds)")
    suspend fun deleteBatch(accountId: String, workspaceId: String, operationIds: List<String>): Int

    @Query("UPDATE device_sync_operations SET state = :state WHERE accountId = :accountId AND workspaceId = :workspaceId AND operationId = :operationId")
    suspend fun updateState(accountId: String, workspaceId: String, operationId: String, state: String): Int

    @Query("DELETE FROM device_sync_operations WHERE accountId = :accountId AND workspaceId = :workspaceId")
    suspend fun clear(accountId: String, workspaceId: String): Int
}

@Dao
interface CaptureMetadataDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveBundle(bundle: CaptureBundleEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveItem(item: CaptureItemEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveReviewDraft(draft: ReviewDraftEntity)

    @Query("SELECT * FROM capture_bundles WHERE accountId = :accountId AND workspaceId = :workspaceId ORDER BY createdAtEpochMs DESC")
    fun observeBundles(accountId: String, workspaceId: String): Flow<List<CaptureBundleEntity>>

    @Query("SELECT * FROM capture_items WHERE accountId = :accountId AND workspaceId = :workspaceId AND bundleId = :bundleId ORDER BY ordinal ASC")
    suspend fun items(accountId: String, workspaceId: String, bundleId: String): List<CaptureItemEntity>

    @Query("UPDATE capture_bundles SET state = :state, revision = revision + 1 WHERE accountId = :accountId AND workspaceId = :workspaceId AND bundleId = :bundleId")
    suspend fun updateBundleState(accountId: String, workspaceId: String, bundleId: String, state: String): Int

    @Query("DELETE FROM capture_items WHERE accountId = :accountId AND workspaceId = :workspaceId AND itemId = :itemId")
    suspend fun deleteItem(accountId: String, workspaceId: String, itemId: String): Int

    @Query("DELETE FROM capture_bundles WHERE accountId = :accountId AND workspaceId = :workspaceId")
    suspend fun clearBundles(accountId: String, workspaceId: String): Int

    @Query("DELETE FROM capture_items WHERE accountId = :accountId AND workspaceId = :workspaceId")
    suspend fun clearItems(accountId: String, workspaceId: String): Int

    @Query("DELETE FROM review_drafts WHERE accountId = :accountId AND workspaceId = :workspaceId")
    suspend fun clearDrafts(accountId: String, workspaceId: String): Int
}

@Dao
interface SyncCursorDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(cursor: SyncCursorEntity)

    @Query("SELECT * FROM sync_cursors WHERE accountId = :accountId AND workspaceId = :workspaceId LIMIT 1")
    suspend fun find(accountId: String, workspaceId: String): SyncCursorEntity?

    @Query("DELETE FROM sync_cursors WHERE accountId = :accountId AND workspaceId = :workspaceId")
    suspend fun clear(accountId: String, workspaceId: String): Int
}

@Database(
    entities = [SyncQueueEntity::class, DeviceSyncOperationEntity::class, CaptureBundleEntity::class, CaptureItemEntity::class, ReviewDraftEntity::class, SyncCursorEntity::class],
    version = 3,
    exportSchema = true,
)
abstract class DataBreezeDatabase : RoomDatabase() {
    abstract fun syncQueue(): SyncQueueDao
    abstract fun deviceSyncOperations(): DeviceSyncOperationDao
    abstract fun captureMetadata(): CaptureMetadataDao
    abstract fun syncCursors(): SyncCursorDao
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
    suspend fun saveCaptureBundle(bundle: CaptureBundleEntity) = Unit
    suspend fun saveCaptureItem(item: CaptureItemEntity) = Unit
    suspend fun saveReviewDraft(draft: ReviewDraftEntity) = Unit
    fun observeCaptureBundles(scope: AccountWorkspaceScope): Flow<List<CaptureBundleEntity>> = flowOf(emptyList())
    suspend fun captureItems(scope: AccountWorkspaceScope, bundleId: String): List<CaptureItemEntity> = emptyList()
    suspend fun updateCaptureState(scope: AccountWorkspaceScope, bundleId: String, state: String) = Unit
    suspend fun deleteCaptureItem(scope: AccountWorkspaceScope, itemId: String) = Unit
    suspend fun saveSyncCursor(cursor: SyncCursorEntity) = Unit
    suspend fun syncCursor(scope: AccountWorkspaceScope): SyncCursorEntity? = null
    suspend fun enqueueDeviceOperation(operation: DeviceSyncOperationEntity) = Unit
    suspend fun snapshotDeviceOperations(scope: AccountWorkspaceScope): List<DeviceSyncOperationEntity> = emptyList()
    suspend fun deleteDeviceOperations(scope: AccountWorkspaceScope, operationIds: List<String>): Int = 0
    suspend fun updateDeviceOperationState(scope: AccountWorkspaceScope, operationId: String, state: String) = Unit
    fun close() = Unit
}

class RoomLocalStore private constructor(private val database: DataBreezeDatabase) : LocalStorePort {
    private val dao: SyncQueueDao = database.syncQueue()
    private val operationDao: DeviceSyncOperationDao = database.deviceSyncOperations()
    private val captureDao: CaptureMetadataDao = database.captureMetadata()
    private val cursorDao: SyncCursorDao = database.syncCursors()

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
        operationDao.clear(scope.accountId, scope.workspaceId)
        captureDao.clearBundles(scope.accountId, scope.workspaceId)
        captureDao.clearItems(scope.accountId, scope.workspaceId)
        captureDao.clearDrafts(scope.accountId, scope.workspaceId)
        cursorDao.clear(scope.accountId, scope.workspaceId)
    }

    override suspend fun saveCaptureBundle(bundle: CaptureBundleEntity) = captureDao.saveBundle(bundle)
    override suspend fun saveCaptureItem(item: CaptureItemEntity) = captureDao.saveItem(item)
    override suspend fun saveReviewDraft(draft: ReviewDraftEntity) = captureDao.saveReviewDraft(draft)
    override fun observeCaptureBundles(scope: AccountWorkspaceScope): Flow<List<CaptureBundleEntity>> =
        captureDao.observeBundles(scope.accountId, scope.workspaceId)
    override suspend fun captureItems(scope: AccountWorkspaceScope, bundleId: String): List<CaptureItemEntity> =
        captureDao.items(scope.accountId, scope.workspaceId, bundleId)
    override suspend fun updateCaptureState(scope: AccountWorkspaceScope, bundleId: String, state: String) {
        require(state in CaptureBundleEntity.STATES)
        captureDao.updateBundleState(scope.accountId, scope.workspaceId, bundleId, state)
    }
    override suspend fun deleteCaptureItem(scope: AccountWorkspaceScope, itemId: String) {
        captureDao.deleteItem(scope.accountId, scope.workspaceId, itemId)
    }
    override suspend fun saveSyncCursor(cursor: SyncCursorEntity) = cursorDao.save(cursor)
    override suspend fun syncCursor(scope: AccountWorkspaceScope): SyncCursorEntity? = cursorDao.find(scope.accountId, scope.workspaceId)
    override suspend fun enqueueDeviceOperation(operation: DeviceSyncOperationEntity) { operationDao.enqueue(operation) }
    override suspend fun snapshotDeviceOperations(scope: AccountWorkspaceScope): List<DeviceSyncOperationEntity> = operationDao.snapshot(scope.accountId, scope.workspaceId)
    override suspend fun deleteDeviceOperations(scope: AccountWorkspaceScope, operationIds: List<String>): Int =
        if (operationIds.isEmpty()) 0 else operationDao.deleteBatch(scope.accountId, scope.workspaceId, operationIds)
    override suspend fun updateDeviceOperationState(scope: AccountWorkspaceScope, operationId: String, state: String) {
        require(state in DeviceSyncOperationEntity.STATES)
        operationDao.updateState(scope.accountId, scope.workspaceId, operationId, state)
    }

    override fun close() = database.close()

    companion object {
        fun create(context: Context): RoomLocalStore =
            RoomLocalStore(
                Room.databaseBuilder(context, DataBreezeDatabase::class.java, "databreeze-local.db")
                    .enableMultiInstanceInvalidation()
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build(),
            )

        fun from(database: DataBreezeDatabase): RoomLocalStore = RoomLocalStore(database)

        val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS capture_bundles (accountId TEXT NOT NULL, workspaceId TEXT NOT NULL, bundleId TEXT NOT NULL, projectId TEXT, kind TEXT NOT NULL, state TEXT NOT NULL, dataModeSnapshot TEXT NOT NULL, operationId TEXT NOT NULL, createdAtEpochMs INTEGER NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(accountId, workspaceId, bundleId))")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_capture_bundles_accountId_workspaceId_state ON capture_bundles(accountId, workspaceId, state)")
                db.execSQL("CREATE TABLE IF NOT EXISTS capture_items (accountId TEXT NOT NULL, workspaceId TEXT NOT NULL, itemId TEXT NOT NULL, bundleId TEXT NOT NULL, ordinal INTEGER NOT NULL, mediaType TEXT NOT NULL, appPrivateUri TEXT NOT NULL, byteLength INTEGER NOT NULL, sha256 TEXT NOT NULL, source TEXT NOT NULL, orientation INTEGER, durationMs INTEGER, original INTEGER NOT NULL, syncState TEXT NOT NULL, createdAtEpochMs INTEGER NOT NULL, PRIMARY KEY(accountId, workspaceId, itemId))")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_capture_items_accountId_workspaceId_bundleId_ordinal ON capture_items(accountId, workspaceId, bundleId, ordinal)")
                db.execSQL("CREATE TABLE IF NOT EXISTS review_drafts (accountId TEXT NOT NULL, workspaceId TEXT NOT NULL, draftId TEXT NOT NULL, reviewId TEXT NOT NULL, baseRevision INTEGER NOT NULL, fieldCorrectionsCiphertext TEXT NOT NULL, evidenceReferenceIds TEXT NOT NULL, operationId TEXT NOT NULL, state TEXT NOT NULL, updatedAtEpochMs INTEGER NOT NULL, PRIMARY KEY(accountId, workspaceId, draftId))")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_review_drafts_accountId_workspaceId_reviewId ON review_drafts(accountId, workspaceId, reviewId)")
                db.execSQL("CREATE TABLE IF NOT EXISTS sync_cursors (accountId TEXT NOT NULL, workspaceId TEXT NOT NULL, cursor TEXT NOT NULL, revision INTEGER NOT NULL, updatedAtEpochMs INTEGER NOT NULL, PRIMARY KEY(accountId, workspaceId))")
            }
        }
        val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS device_sync_operations (accountId TEXT NOT NULL, workspaceId TEXT NOT NULL, operationId TEXT NOT NULL, deviceId TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, kind TEXT NOT NULL, payloadClass TEXT NOT NULL, payloadDigest TEXT NOT NULL, encryptedPayload TEXT, dependencyIds TEXT, baseRevision INTEGER, policyVersionId TEXT, classification TEXT, state TEXT NOT NULL, createdAtEpochMs INTEGER NOT NULL, PRIMARY KEY(accountId, workspaceId, operationId))")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_device_sync_operations_accountId_workspaceId_state ON device_sync_operations(accountId, workspaceId, state)")
            }
        }
    }
}

/** Deterministic fake used by JVM tests and by the no-network shell configuration. */
class InMemoryLocalStore : LocalStorePort {
    private val mutex = Mutex()
    private val items = linkedMapOf<String, SyncQueueEntity>()
    private val updates = MutableStateFlow<List<SyncQueueEntity>>(emptyList())
    private val bundles = linkedMapOf<String, CaptureBundleEntity>()
    private val itemsById = linkedMapOf<String, CaptureItemEntity>()
    private val drafts = linkedMapOf<String, ReviewDraftEntity>()
    private val cursors = linkedMapOf<String, SyncCursorEntity>()
    private val deviceOperations = linkedMapOf<String, DeviceSyncOperationEntity>()

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
            bundles.keys.removeIf { it.startsWith("${scope.accountId}\u0000${scope.workspaceId}\u0000") }
            itemsById.keys.removeIf { it.startsWith("${scope.accountId}\u0000${scope.workspaceId}\u0000") }
            drafts.keys.removeIf { it.startsWith("${scope.accountId}\u0000${scope.workspaceId}\u0000") }
            deviceOperations.keys.removeIf { it.startsWith("${scope.accountId}\u0000${scope.workspaceId}\u0000") }
            cursors.remove(scopeKey(scope))
            publish()
        }
    }

    override suspend fun saveCaptureBundle(bundle: CaptureBundleEntity) = mutex.withLock {
        bundles[key(bundle.accountId, bundle.workspaceId, bundle.bundleId)] = bundle
    }
    override suspend fun saveCaptureItem(item: CaptureItemEntity) = mutex.withLock {
        itemsById[key(item.accountId, item.workspaceId, item.itemId)] = item
    }
    override suspend fun saveReviewDraft(draft: ReviewDraftEntity) = mutex.withLock {
        drafts[key(draft.accountId, draft.workspaceId, draft.draftId)] = draft
    }
    override fun observeCaptureBundles(scope: AccountWorkspaceScope): Flow<List<CaptureBundleEntity>> =
        flowOf(bundles.values.filter { it.accountId == scope.accountId && it.workspaceId == scope.workspaceId })
    override suspend fun captureItems(scope: AccountWorkspaceScope, bundleId: String): List<CaptureItemEntity> = mutex.withLock {
        itemsById.values.filter { it.accountId == scope.accountId && it.workspaceId == scope.workspaceId && it.bundleId == bundleId }
            .sortedBy { it.ordinal }
    }
    override suspend fun updateCaptureState(scope: AccountWorkspaceScope, bundleId: String, state: String) {
        mutex.withLock {
            val key = key(scope.accountId, scope.workspaceId, bundleId)
            bundles[key]?.let { bundles[key] = it.copy(state = state, revision = it.revision + 1) }
        }
    }
    override suspend fun deleteCaptureItem(scope: AccountWorkspaceScope, itemId: String) {
        mutex.withLock {
            itemsById.remove(key(scope.accountId, scope.workspaceId, itemId))
        }
    }
    override suspend fun saveSyncCursor(cursor: SyncCursorEntity) = mutex.withLock {
        cursors[scopeKey(AccountWorkspaceScope(cursor.accountId, cursor.workspaceId))] = cursor
    }
    override suspend fun syncCursor(scope: AccountWorkspaceScope): SyncCursorEntity? = mutex.withLock { cursors[scopeKey(scope)] }
    override suspend fun enqueueDeviceOperation(operation: DeviceSyncOperationEntity) {
        mutex.withLock {
        deviceOperations.putIfAbsent(key(operation.accountId, operation.workspaceId, operation.operationId), operation)
        }
    }
    override suspend fun snapshotDeviceOperations(scope: AccountWorkspaceScope): List<DeviceSyncOperationEntity> = mutex.withLock {
        deviceOperations.values.filter { it.accountId == scope.accountId && it.workspaceId == scope.workspaceId && it.state !in setOf(DeviceSyncOperationEntity.COMPLETED_STATE, DeviceSyncOperationEntity.REJECTED_STATE, DeviceSyncOperationEntity.QUARANTINED_STATE) }
            .sortedWith(compareBy({ it.createdAtEpochMs }, { it.operationId }))
    }
    override suspend fun deleteDeviceOperations(scope: AccountWorkspaceScope, operationIds: List<String>): Int = mutex.withLock {
        operationIds.count { deviceOperations.remove(key(scope.accountId, scope.workspaceId, it)) != null }
    }
    override suspend fun updateDeviceOperationState(scope: AccountWorkspaceScope, operationId: String, state: String) {
        mutex.withLock {
        require(state in DeviceSyncOperationEntity.STATES)
        val key = key(scope.accountId, scope.workspaceId, operationId)
        deviceOperations[key]?.let { deviceOperations[key] = it.copy(state = state) }
        }
    }

    private fun publish() {
        updates.value = items.values.toList()
    }

    private fun key(accountId: String, workspaceId: String, mutationId: String): String =
        "$accountId\u0000$workspaceId\u0000$mutationId"

    private fun scopeKey(scope: AccountWorkspaceScope): String = "${scope.accountId}\u0000${scope.workspaceId}"
}
