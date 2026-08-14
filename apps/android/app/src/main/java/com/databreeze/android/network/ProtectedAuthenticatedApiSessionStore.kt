package com.databreeze.android.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

interface ProtectedAuthenticatedApiSessionStore : ProtectedAuthenticatedApiSessionProvider {
    fun replace(session: ProtectedAuthenticatedApiSession): Boolean
    fun clear(): Boolean
}

/** Android Keystore-backed session boundary. No API/provider credential is a BuildConfig field. */
class AndroidProtectedAuthenticatedApiSessionStore private constructor(
    private val preferences: SharedPreferences,
) : ProtectedAuthenticatedApiSessionStore {
    override fun currentSession(): ProtectedAuthenticatedApiSession? =
        runCatching {
            val accountId = preferences.getString(ACCOUNT_ID, null) ?: return null
            val organizationId = preferences.getString(ORGANIZATION_ID, null) ?: return null
            val workspaceId = preferences.getString(WORKSPACE_ID, null) ?: return null
            val grantId = preferences.getString(RECEIPT_GRANT_ID, null) ?: return null
            val accessToken = preferences.getString(ACCESS_TOKEN, null) ?: return null
            ProtectedAuthenticatedApiSession(
                accountId = accountId,
                organizationId = organizationId,
                workspaceId = workspaceId,
                receiptWorkspaceGrantId = grantId,
                accessToken = accessToken,
            )
        }.getOrNull()

    override fun replace(session: ProtectedAuthenticatedApiSession): Boolean =
        preferences.edit()
            .clear()
            .putString(ACCOUNT_ID, session.accountId)
            .putString(ORGANIZATION_ID, session.organizationId)
            .putString(WORKSPACE_ID, session.workspaceId)
            .putString(RECEIPT_GRANT_ID, session.receiptWorkspaceGrantId)
            .putString(ACCESS_TOKEN, session.accessToken)
            .commit()

    override fun clear(): Boolean = preferences.edit().clear().commit()

    companion object {
        private const val ACCOUNT_ID = "account_id"
        private const val ORGANIZATION_ID = "organization_id"
        private const val WORKSPACE_ID = "workspace_id"
        private const val RECEIPT_GRANT_ID = "receipt_workspace_grant_id"
        private const val ACCESS_TOKEN = "access_token"

        fun create(context: Context): AndroidProtectedAuthenticatedApiSessionStore {
            val applicationContext = context.applicationContext
            val masterKey =
                MasterKey.Builder(applicationContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
            val encryptedPreferences =
                EncryptedSharedPreferences.create(
                    applicationContext,
                    "databreeze-authenticated-api-v1",
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
            return AndroidProtectedAuthenticatedApiSessionStore(encryptedPreferences)
        }
    }
}
