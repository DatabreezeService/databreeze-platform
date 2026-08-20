package com.databreeze.android

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.CaptureBundleEntity
import com.databreeze.android.storage.CaptureItemEntity
import com.databreeze.android.storage.DataBreezeDatabase
import com.databreeze.android.storage.RoomLocalStore
import java.security.MessageDigest
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** AND-009/AND-019: Room persists capture metadata and keeps account/workspace scopes isolated. */
@RunWith(AndroidJUnit4::class)
class LocalStorePersistenceTest {
    private lateinit var database: DataBreezeDatabase
    private lateinit var store: RoomLocalStore

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, DataBreezeDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        store = RoomLocalStore.from(database)
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun capture_metadata_is_scoped_and_sign_out_clears_only_current_scope() = runBlocking {
        val first = AccountWorkspaceScope("account-a", "workspace-a")
        val second = AccountWorkspaceScope("account-b", "workspace-b")
        val firstBundle = bundle(first, "bundle-a")
        val secondBundle = bundle(second, "bundle-b")
        store.saveCaptureBundle(firstBundle)
        store.saveCaptureBundle(secondBundle)
        store.saveCaptureItem(item(first, firstBundle.bundleId, "item-a"))
        store.saveCaptureItem(item(second, secondBundle.bundleId, "item-b"))

        assertEquals(listOf("bundle-a"), store.observeCaptureBundles(first).first().map { it.bundleId })
        assertEquals(1, store.captureItems(second, "bundle-b").size)

        store.clear(first)
        assertTrue(store.observeCaptureBundles(first).first().isEmpty())
        assertEquals(1, store.captureItems(second, "bundle-b").size)
    }

    private fun bundle(scope: AccountWorkspaceScope, id: String) = CaptureBundleEntity(
        accountId = scope.accountId,
        workspaceId = scope.workspaceId,
        bundleId = id,
        kind = "receipt",
        dataModeSnapshot = "HYBRID",
        operationId = "operation-$id",
        createdAtEpochMs = 1L,
    )

    private fun item(scope: AccountWorkspaceScope, bundleId: String, id: String): CaptureItemEntity {
        val digest = MessageDigest.getInstance("SHA-256").digest(id.toByteArray())
            .joinToString("") { "%02x".format(it) }
        return CaptureItemEntity(
            accountId = scope.accountId,
            workspaceId = scope.workspaceId,
            itemId = id,
            bundleId = bundleId,
            ordinal = 0,
            mediaType = "image/jpeg",
            appPrivateUri = "app-private://receipt/$id",
            byteLength = 1L,
            sha256 = "sha256:$digest",
            source = "CAMERA",
            createdAtEpochMs = 1L,
        )
    }
}
