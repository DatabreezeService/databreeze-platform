package com.databreeze.android

import android.content.Context
import com.databreeze.android.receipts.InMemoryReceiptStagingStore
import com.databreeze.android.receipts.ReceiptStagingStore
import com.databreeze.android.receipts.ReceiptUploadScheduler
import com.databreeze.android.receipts.ReceiptUploadTransport
import com.databreeze.android.receipts.RecordingReceiptUploadScheduler
import com.databreeze.android.receipts.UnconfiguredReceiptUploadTransport
import com.databreeze.android.receipts.WorkManagerReceiptUploadScheduler
import com.databreeze.android.security.AndroidDeviceKeyStore
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.storage.LocalStorePort
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.RoomLocalStore
import com.databreeze.android.sync.DataBreezeWorkerFactory
import com.databreeze.android.sync.SharedPreferencesSyncRevocationGuard
import com.databreeze.android.sync.SyncRevocationGuard
import com.databreeze.android.sync.SyncScheduler
import com.databreeze.android.sync.SyncTransport
import com.databreeze.android.sync.UnconfiguredSyncTransport
import com.databreeze.android.sync.WorkManagerSyncScheduler
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/** Application-owned adapters. Feature packages receive ports, never Context or raw clients. */
class AndroidRuntime internal constructor(
    val localStore: LocalStorePort,
    val deviceKeyStore: DeviceKeyStore,
    val syncTransport: SyncTransport,
    val syncScheduler: SyncScheduler,
    val syncRevocationGuard: SyncRevocationGuard,
    val workerFactory: DataBreezeWorkerFactory,
    val receiptStagingStore: ReceiptStagingStore,
    val receiptUploadScheduler: ReceiptUploadScheduler,
    val receiptUploadTransport: ReceiptUploadTransport,
    val receiptKeyHandle: DeviceKeyHandle,
) {
    private val lifecycleMutexes = ConcurrentHashMap<String, Mutex>()

    /**
     * Re-enables a scope only after authentication has succeeded and its device key is ready.
     * The explicit call prevents a process restart from silently undoing sign-out revocation.
     */
    suspend fun signIn(scope: AccountWorkspaceScope, keyAlias: String): DeviceKeyHandle =
        lifecycleMutex(scope).withLock {
            val handle = deviceKeyStore.getOrCreate(keyAlias)
            syncRevocationGuard.reactivate(scope)
            handle
        }

    /** Revocation/account switch clears local work and the device-bound key before returning. */
    suspend fun signOut(scope: AccountWorkspaceScope, keyAlias: String) =
        lifecycleMutex(scope).withLock {
            syncRevocationGuard.revoke(scope)
            syncScheduler.cancel(scope)
            receiptStagingStore.clearScope(scope)
            localStore.clear(scope)
            deviceKeyStore.delete(keyAlias)
        }

    private fun lifecycleMutex(scope: AccountWorkspaceScope): Mutex =
        lifecycleMutexes.computeIfAbsent(scope.stableKey) { Mutex() }

    companion object {
        fun create(context: Context): AndroidRuntime {
            val localStore = RoomLocalStore.create(context.applicationContext)
            val transport = UnconfiguredSyncTransport()
            val revocationGuard = SharedPreferencesSyncRevocationGuard(
                context.applicationContext.getSharedPreferences("databreeze-sync", Context.MODE_PRIVATE),
            )
            val deviceKeyStore = AndroidDeviceKeyStore()
            val receiptKeyHandle = deviceKeyStore.getOrCreate("receipt-staging")
            val receiptCipher = DevicePayloadCipher(deviceKeyStore)
            val receiptStaging = InMemoryReceiptStagingStore(receiptCipher, deviceKeyStore)
            val receiptTransport = UnconfiguredReceiptUploadTransport()
            return AndroidRuntime(
                localStore = localStore,
                deviceKeyStore = deviceKeyStore,
                syncTransport = transport,
                syncScheduler = WorkManagerSyncScheduler(context.applicationContext),
                syncRevocationGuard = revocationGuard,
                workerFactory = DataBreezeWorkerFactory(
                    localStore,
                    transport,
                    revocationGuard,
                    receiptTransport,
                ),
                receiptStagingStore = receiptStaging,
                receiptUploadScheduler = WorkManagerReceiptUploadScheduler(context.applicationContext),
                receiptUploadTransport = receiptTransport,
                receiptKeyHandle = receiptKeyHandle,
            )
        }

        /** Test-friendly runtime without WorkManager. */
        fun createForTests(
            localStore: LocalStorePort,
            deviceKeyStore: DeviceKeyStore,
            syncTransport: SyncTransport = UnconfiguredSyncTransport(),
            syncScheduler: SyncScheduler,
            syncRevocationGuard: SyncRevocationGuard,
            receiptStagingStore: ReceiptStagingStore,
            receiptUploadScheduler: ReceiptUploadScheduler = RecordingReceiptUploadScheduler(),
            receiptUploadTransport: ReceiptUploadTransport = UnconfiguredReceiptUploadTransport(),
            receiptKeyHandle: DeviceKeyHandle,
        ): AndroidRuntime = AndroidRuntime(
            localStore = localStore,
            deviceKeyStore = deviceKeyStore,
            syncTransport = syncTransport,
            syncScheduler = syncScheduler,
            syncRevocationGuard = syncRevocationGuard,
            workerFactory = DataBreezeWorkerFactory(
                localStore,
                syncTransport,
                syncRevocationGuard,
                receiptUploadTransport,
            ),
            receiptStagingStore = receiptStagingStore,
            receiptUploadScheduler = receiptUploadScheduler,
            receiptUploadTransport = receiptUploadTransport,
            receiptKeyHandle = receiptKeyHandle,
        )
    }
}
