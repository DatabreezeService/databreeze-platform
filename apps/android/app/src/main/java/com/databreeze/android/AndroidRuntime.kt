package com.databreeze.android

import android.content.Context
import com.databreeze.android.security.AndroidDeviceKeyStore
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
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

/** Application-owned adapters. Feature packages receive ports, never Context or raw clients. */
class AndroidRuntime private constructor(
    val localStore: LocalStorePort,
    val deviceKeyStore: DeviceKeyStore,
    val syncTransport: SyncTransport,
    val syncScheduler: SyncScheduler,
    val syncRevocationGuard: SyncRevocationGuard,
    val workerFactory: DataBreezeWorkerFactory,
) {
    /**
     * Re-enables a scope only after authentication has succeeded and its device key is ready.
     * The explicit call prevents a process restart from silently undoing sign-out revocation.
     */
    suspend fun signIn(scope: AccountWorkspaceScope, keyAlias: String): DeviceKeyHandle {
        val handle = deviceKeyStore.getOrCreate(keyAlias)
        syncRevocationGuard.reactivate(scope)
        return handle
    }

    /** Revocation/account switch clears local work and the device-bound key before returning. */
    suspend fun signOut(scope: AccountWorkspaceScope, keyAlias: String) {
        syncRevocationGuard.revoke(scope)
        syncScheduler.cancel(scope)
        localStore.clear(scope)
        deviceKeyStore.delete(keyAlias)
    }

    companion object {
        fun create(context: Context): AndroidRuntime {
            val localStore = RoomLocalStore.create(context.applicationContext)
            val transport = UnconfiguredSyncTransport()
            val revocationGuard = SharedPreferencesSyncRevocationGuard(
                context.applicationContext.getSharedPreferences("databreeze-sync", Context.MODE_PRIVATE),
            )
            return AndroidRuntime(
                localStore = localStore,
                deviceKeyStore = AndroidDeviceKeyStore(),
                syncTransport = transport,
                syncScheduler = WorkManagerSyncScheduler(context.applicationContext),
                syncRevocationGuard = revocationGuard,
                workerFactory = DataBreezeWorkerFactory(localStore, transport, revocationGuard),
            )
        }
    }
}
