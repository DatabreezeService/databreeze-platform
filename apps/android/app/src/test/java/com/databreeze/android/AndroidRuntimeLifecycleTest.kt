package com.databreeze.android

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.InMemoryLocalStore
import com.databreeze.android.sync.DataBreezeWorkerFactory
import com.databreeze.android.sync.SyncRevocationGuard
import com.databreeze.android.sync.SyncScheduler
import com.databreeze.android.sync.SyncTransport
import com.databreeze.android.sync.UnconfiguredSyncTransport
import java.util.Collections
import java.util.concurrent.CountDownLatch
import javax.crypto.SecretKey
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AndroidRuntimeLifecycleTest {
    @Test
    fun sign_in_and_sign_out_are_serialized_for_the_same_scope() = runBlocking {
        val scope = AccountWorkspaceScope("account-1", "workspace-1")
        val events = Collections.synchronizedList(mutableListOf<String>())
        val keyStarted = CountDownLatch(1)
        val releaseKeyCreation = CountDownLatch(1)
        val revokeCalled = CompletableDeferred<Unit>()
        val keyStore = BlockingDeviceKeyStore(events, keyStarted, releaseKeyCreation)
        val guard = RecordingRevocationGuard(events, revokeCalled)
        val scheduler = RecordingScheduler(events)
        val transport: SyncTransport = UnconfiguredSyncTransport()
        val store = InMemoryLocalStore()
        val runtime = AndroidRuntime(
            localStore = store,
            deviceKeyStore = keyStore,
            syncTransport = transport,
            syncScheduler = scheduler,
            syncRevocationGuard = guard,
            workerFactory = DataBreezeWorkerFactory(store, transport, guard),
        )

        val signIn = async(Dispatchers.Default) { runtime.signIn(scope, "device-key") }
        keyStarted.await()
        val signOut = async(
            context = Dispatchers.Default,
            start = CoroutineStart.UNDISPATCHED,
        ) { runtime.signOut(scope, "device-key") }

        assertNull(withTimeoutOrNull(200) { revokeCalled.await() })
        assertEquals(listOf("key-create"), events.toList())

        releaseKeyCreation.countDown()
        withTimeout(2_000) {
            signIn.await()
            signOut.await()
        }

        assertEquals(listOf("key-create", "reactivate", "revoke", "cancel", "key-delete"), events.toList())
    }

    private class BlockingDeviceKeyStore(
        private val events: MutableList<String>,
        private val keyStarted: CountDownLatch,
        private val releaseKeyCreation: CountDownLatch,
    ) : DeviceKeyStore {
        override fun getOrCreate(alias: String): DeviceKeyHandle {
            events += "key-create"
            keyStarted.countDown()
            releaseKeyCreation.await()
            return DeviceKeyHandle(alias)
        }

        override fun contains(alias: String): Boolean = false

        override fun delete(alias: String): Boolean {
            events += "key-delete"
            return true
        }

        override fun keyFor(handle: DeviceKeyHandle): SecretKey =
            throw UnsupportedOperationException("not used by lifecycle test")
    }

    private class RecordingRevocationGuard(
        private val events: MutableList<String>,
        val revokeCalled: CompletableDeferred<Unit>,
    ) : SyncRevocationGuard {
        override suspend fun <T> withPermit(scope: AccountWorkspaceScope, operation: suspend () -> T): T =
            operation()

        override suspend fun revoke(scope: AccountWorkspaceScope) {
            events += "revoke"
            revokeCalled.complete(Unit)
        }

        override suspend fun reactivate(scope: AccountWorkspaceScope) {
            events += "reactivate"
        }
    }

    private class RecordingScheduler(private val events: MutableList<String>) : SyncScheduler {
        override fun enqueue(scope: AccountWorkspaceScope, cursor: String?, revision: Long?) = Unit

        override fun cancel(scope: AccountWorkspaceScope) {
            events += "cancel"
        }
    }
}
