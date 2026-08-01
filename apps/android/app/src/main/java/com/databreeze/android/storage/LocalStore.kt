package com.databreeze.android.storage

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @androidx.room.PrimaryKey val mutationId: String,
    val workspaceId: String,
    val operationType: String,
    val payloadHash: String,
    val dependencyId: String?,
    val state: String = "queued",
)

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue ORDER BY mutationId")
    fun observe(): Flow<List<SyncQueueEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun enqueue(item: SyncQueueEntity)
}

@Database(entities = [SyncQueueEntity::class], version = 1, exportSchema = false)
abstract class DataBreezeDatabase : RoomDatabase() {
    abstract fun syncQueue(): SyncQueueDao
}

/** Port used by feature modules; no Android context or database leaks into the domain. */
interface LocalStorePort {
    suspend fun enqueue(mutation: SyncQueueEntity)
    fun observeQueue(): Flow<List<SyncQueueEntity>>
}
