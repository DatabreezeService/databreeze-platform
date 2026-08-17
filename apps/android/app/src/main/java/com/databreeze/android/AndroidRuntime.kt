package com.databreeze.android

import android.content.Context
import com.databreeze.android.network.AuthenticatedApiConfig
import com.databreeze.android.network.AuthenticatedBillingApiClient
import com.databreeze.android.network.AuthenticatedDatasetApiClient
import com.databreeze.android.network.AuthenticatedDashboardApiClient
import com.databreeze.android.network.AuthenticatedConversationApiClient
import com.databreeze.android.network.AuthenticatedOperationsApiClient
import com.databreeze.android.network.AuthenticatedNotificationsApiClient
import com.databreeze.android.network.AuthenticatedMobileApiClient
import com.databreeze.android.network.AuthenticatedArtifactApiClient
import com.databreeze.android.network.AuthenticatedApprovalApiClient
import com.databreeze.android.network.AuthenticatedInvoiceApiClient
import com.databreeze.android.network.HttpUrlConnectionAuthenticatedApiTransport
import com.databreeze.android.receipts.AuthenticatedReceiptUploadApiClient
import com.databreeze.android.receipts.FailClosedReceiptUploadApiClient
import com.databreeze.android.receipts.FileBackedReceiptStagingStore
import com.databreeze.android.receipts.ReceiptExtractionApiClient
import com.databreeze.android.receipts.ReceiptStagingStore
import com.databreeze.android.receipts.ReceiptArtifactReferenceStore
import com.databreeze.android.receipts.SharedPreferencesReceiptArtifactReferenceStore
import com.databreeze.android.receipts.InMemoryReceiptArtifactReferenceStore
import com.databreeze.android.receipts.ReceiptUploadApiClient
import com.databreeze.android.receipts.ReceiptUploadScheduler
import com.databreeze.android.receipts.ReceiptUploadTransport
import com.databreeze.android.receipts.RecordingReceiptUploadScheduler
import com.databreeze.android.receipts.StagedReceiptUploadTransport
import com.databreeze.android.receipts.UnconfiguredReceiptUploadTransport
import com.databreeze.android.receipts.WorkManagerReceiptUploadScheduler
import com.databreeze.android.capture.EncryptedVoiceArtifactStore
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
import com.databreeze.android.sync.AuthenticatedDeviceSyncTransport
import com.databreeze.android.sync.StrictLocalPackageExporter
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
    val receiptArtifactReferenceStore: ReceiptArtifactReferenceStore = InMemoryReceiptArtifactReferenceStore(),
    val voiceArtifactStore: EncryptedVoiceArtifactStore? = null,
    val receiptExtractionApiClient: ReceiptExtractionApiClient?,
    val billingApiClient: AuthenticatedBillingApiClient? = null,
    val datasetApiClient: AuthenticatedDatasetApiClient? = null,
    val dashboardApiClient: AuthenticatedDashboardApiClient? = null,
    val conversationApiClient: AuthenticatedConversationApiClient? = null,
    val operationsApiClient: AuthenticatedOperationsApiClient? = null,
    val notificationsApiClient: AuthenticatedNotificationsApiClient? = null,
    val mobileApiClient: AuthenticatedMobileApiClient? = null,
    val artifactApiClient: AuthenticatedArtifactApiClient? = null,
    val approvalApiClient: AuthenticatedApprovalApiClient? = null,
    val invoiceApiClient: AuthenticatedInvoiceApiClient? = null,
    val strictLocalPackageExporter: StrictLocalPackageExporter? = null,
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
            voiceArtifactStore?.clear(scope)
            receiptArtifactReferenceStore.clear()
            localStore.clear(scope)
            localStore.close()
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
            val revocationGuard = SharedPreferencesSyncRevocationGuard(
                context.applicationContext.getSharedPreferences("databreeze-sync", Context.MODE_PRIVATE),
            )
            val deviceKeyStore = AndroidDeviceKeyStore()
            val receiptKeyHandle = deviceKeyStore.getOrCreate("receipt-staging")
            val receiptCipher = DevicePayloadCipher(deviceKeyStore)
            val voiceArtifactStore = EncryptedVoiceArtifactStore(context.applicationContext, deviceKeyStore, receiptKeyHandle)
            val receiptStagingRoot = File(context.applicationContext.filesDir, "receipt-staging")
            val receiptStaging =
                FileBackedReceiptStagingStore(receiptStagingRoot, receiptCipher, deviceKeyStore)
            val receiptArtifactReferences =
                SharedPreferencesReceiptArtifactReferenceStore(context.applicationContext)
            val apiTransport =
                apiConfig?.let {
                    HttpUrlConnectionAuthenticatedApiTransport(
                        baseUrl = it.baseUrl,
                        tokenProvider = it.tokenProvider,
                    )
                }
            val transport: SyncTransport =
                if (
                    apiConfig != null && apiTransport != null &&
                    apiConfig.deviceId.isNotBlank() && apiConfig.workspaceGrantId.isNotBlank()
                ) {
                    AuthenticatedDeviceSyncTransport(
                        transport = apiTransport,
                        deviceId = apiConfig.deviceId,
                        grantId = apiConfig.workspaceGrantId,
                        organizationId = apiConfig.organizationId,
                    )
                } else {
                    UnconfiguredSyncTransport()
                }
            val receiptUploadApiClient: ReceiptUploadApiClient =
                if (apiConfig != null && apiTransport != null) {
                    // Production always uses the IAE resumable control plane. The bounded
                    // /dda/receipts/intake adapter remains available for compatibility tests,
                    // but must never be selected by the production composition because it sends
                    // the complete original as one Base64 request.
                    AuthenticatedReceiptUploadApiClient(
                        transport = apiTransport,
                        organizationId = apiConfig.organizationId,
                        workspaceId = apiConfig.workspaceId,
                        references = receiptArtifactReferences,
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
            val billingApiClient =
                if (apiConfig != null && apiTransport != null) {
                    AuthenticatedBillingApiClient(
                        transport = apiTransport,
                        idempotencyKey = { "android-billing-${java.util.UUID.randomUUID()}" },
                    )
                } else {
                    null
                }
            val datasetApiClient = apiTransport?.let { AuthenticatedDatasetApiClient(it) }
            val dashboardApiClient = apiTransport?.let { AuthenticatedDashboardApiClient(it) }
            val conversationApiClient = apiTransport?.let { AuthenticatedConversationApiClient(it) }
            val operationsApiClient = apiTransport?.let { AuthenticatedOperationsApiClient(it) }
            val notificationsApiClient = apiTransport?.let { AuthenticatedNotificationsApiClient(it) }
            val mobileApiClient = apiTransport?.let { AuthenticatedMobileApiClient(it) }
            val artifactApiClient = apiTransport?.let { AuthenticatedArtifactApiClient(it) }
            val approvalApiClient = apiTransport?.let { AuthenticatedApprovalApiClient(it) }
            val invoiceApiClient = apiTransport?.let { AuthenticatedInvoiceApiClient(it) }
            val strictLocalPackageExporter =
                if (apiConfig != null && apiTransport != null && apiConfig.deviceId.isNotBlank()) {
                    StrictLocalPackageExporter(
                        transport = apiTransport,
                        organizationId = apiConfig.organizationId,
                        workspaceId = apiConfig.workspaceId,
                        deviceId = apiConfig.deviceId,
                    )
                } else null
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
                receiptArtifactReferenceStore = receiptArtifactReferences,
                voiceArtifactStore = voiceArtifactStore,
                receiptExtractionApiClient = receiptExtractionApiClient,
                billingApiClient = billingApiClient,
                datasetApiClient = datasetApiClient,
                dashboardApiClient = dashboardApiClient,
                conversationApiClient = conversationApiClient,
                operationsApiClient = operationsApiClient,
                notificationsApiClient = notificationsApiClient,
                mobileApiClient = mobileApiClient,
                artifactApiClient = artifactApiClient,
                approvalApiClient = approvalApiClient,
                invoiceApiClient = invoiceApiClient,
                strictLocalPackageExporter = strictLocalPackageExporter,
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
            receiptArtifactReferenceStore: ReceiptArtifactReferenceStore = InMemoryReceiptArtifactReferenceStore(),
            voiceArtifactStore: EncryptedVoiceArtifactStore? = null,
            receiptExtractionApiClient: ReceiptExtractionApiClient? = null,
            billingApiClient: AuthenticatedBillingApiClient? = null,
            datasetApiClient: AuthenticatedDatasetApiClient? = null,
            dashboardApiClient: AuthenticatedDashboardApiClient? = null,
            conversationApiClient: AuthenticatedConversationApiClient? = null,
            operationsApiClient: AuthenticatedOperationsApiClient? = null,
            notificationsApiClient: AuthenticatedNotificationsApiClient? = null,
            mobileApiClient: AuthenticatedMobileApiClient? = null,
            artifactApiClient: AuthenticatedArtifactApiClient? = null,
            strictLocalPackageExporter: StrictLocalPackageExporter? = null,
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
            receiptArtifactReferenceStore = receiptArtifactReferenceStore,
            voiceArtifactStore = voiceArtifactStore,
            receiptExtractionApiClient = receiptExtractionApiClient,
            billingApiClient = billingApiClient,
            datasetApiClient = datasetApiClient,
            dashboardApiClient = dashboardApiClient,
            conversationApiClient = conversationApiClient,
            operationsApiClient = operationsApiClient,
            notificationsApiClient = notificationsApiClient,
            mobileApiClient = mobileApiClient,
            artifactApiClient = artifactApiClient,
            strictLocalPackageExporter = strictLocalPackageExporter,
            receiptKeyHandle = receiptKeyHandle,
        )
    }
}
