package com.databreeze.android

import android.content.Context
import com.databreeze.android.network.AuthenticatedApiConfig
import com.databreeze.android.network.HttpUrlConnectionAuthenticatedApiTransport
import com.databreeze.android.receipts.AuthenticatedReceiptUploadApiClient
import com.databreeze.android.receipts.FailClosedReceiptUploadApiClient
import com.databreeze.android.receipts.FileBackedReceiptStagingStore
import com.databreeze.android.receipts.ReceiptExtractionApiClient
import com.databreeze.android.receipts.ReceiptStagingStore
import com.databreeze.android.receipts.ReceiptUploadApiClient
import com.databreeze.android.receipts.ReceiptUploadScheduler
import com.databreeze.android.receipts.ReceiptUploadTransport
import com.databreeze.android.receipts.RecordingReceiptUploadScheduler
import com.databreeze.android.receipts.StagedReceiptUploadTransport
import com.databreeze.android.receipts.UnconfiguredReceiptUploadTransport
import com.databreeze.android.receipts.WorkManagerReceiptUploadScheduler
import com.databreeze.android.security.AndroidDeviceKeyStore
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.LocalStorePort
import com.databreeze.android.storage.RoomLocalStore
import com.databreeze.android.sync.DataBreezeWorkerFactory
import com.databreeze.android.sync.SharedPreferencesSyncRevocationGuard
import com.databreeze.android.sync.SyncRevocationGuard
import com.databreeze.android.sync.SyncScheduler
import com.databreeze.android.sync.SyncTransport
import com.databreeze.android.sync.UnconfiguredSyncTransport
import com.databreeze.android.sync.WorkManagerSyncScheduler
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
    val receiptUploadApiClient: ReceiptUploadApiClient,
    val receiptExtractionApiClient: ReceiptExtractionApiClient?,
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
        fun create(
            context: Context,
            apiConfig: AuthenticatedApiConfig? = null,
        ): AndroidRuntime {
            val localStore = RoomLocalStore.create(context.applicationContext)
            val transport = UnconfiguredSyncTransport()
            val revocationGuard = SharedPreferencesSyncRevocationGuard(
                context.applicationContext.getSharedPreferences("databreeze-sync", Context.MODE_PRIVATE),
            )
            val deviceKeyStore = AndroidDeviceKeyStore()
            val receiptKeyHandle = deviceKeyStore.getOrCreate("receipt-staging")
            val receiptCipher = DevicePayloadCipher(deviceKeyStore)
            val receiptStagingRoot = File(context.applicationContext.filesDir, "receipt-staging")
            val receiptStaging =
                FileBackedReceiptStagingStore(receiptStagingRoot, receiptCipher, deviceKeyStore)
            val apiTransport =
                apiConfig?.let {
                    HttpUrlConnectionAuthenticatedApiTransport(
                        baseUrl = it.baseUrl,
                        tokenProvider = it.tokenProvider,
                    )
                }
            val receiptUploadApiClient: ReceiptUploadApiClient =
                if (apiConfig != null && apiTransport != null) {
                    AuthenticatedReceiptUploadApiClient(
                        transport = apiTransport,
                        organizationId = apiConfig.organizationId,
                        workspaceId = apiConfig.workspaceId,
                        nowIso = { java.time.Instant.now().toString() },
                    )
                } else {
                    FailClosedReceiptUploadApiClient()
                }
            val receiptExtractionApiClient =
                if (apiConfig != null && apiTransport != null) {
                    ReceiptExtractionApiClient(
                        transport = apiTransport,
                        organizationId = apiConfig.organizationId,
                        workspaceId = apiConfig.workspaceId,
                        nowIso = { java.time.Instant.now().toString() },
                    )
                } else {
                    null
                }
            val receiptTransport = StagedReceiptUploadTransport(
                stagingStore = receiptStaging,
                keyHandle = receiptKeyHandle,
                apiClient = receiptUploadApiClient,
            )
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
                receiptUploadApiClient = receiptUploadApiClient,
                receiptExtractionApiClient = receiptExtractionApiClient,
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
            receiptUploadApiClient: ReceiptUploadApiClient = FailClosedReceiptUploadApiClient(),
            receiptExtractionApiClient: ReceiptExtractionApiClient? = null,
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
            receiptUploadApiClient = receiptUploadApiClient,
            receiptExtractionApiClient = receiptExtractionApiClient,
            receiptKeyHandle = receiptKeyHandle,
        )
    }
}
