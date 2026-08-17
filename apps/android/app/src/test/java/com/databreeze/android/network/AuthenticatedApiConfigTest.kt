package com.databreeze.android.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Test

class AuthenticatedApiConfigTest {
    @Test
    fun `AND-003 production runtime rejects absent or unsafe origins`() {
        val provider = ProtectedAuthenticatedApiSessionProvider { validSession() }

        assertNull(AuthenticatedApiConfig.fromProtectedRuntime("", false, provider))
        assertNull(
            AuthenticatedApiConfig.fromProtectedRuntime(
                "http://api.example.test",
                false,
                provider,
            ),
        )
        assertNull(
            AuthenticatedApiConfig.fromProtectedRuntime(
                "https://user:secret@api.example.test",
                false,
                provider,
            ),
        )
        assertNull(
            AuthenticatedApiConfig.fromProtectedRuntime(
                "https://api.example.test/v1",
                false,
                provider,
            ),
        )
    }

    @Test
    fun `AND-003 protected session becomes typed API config without embedding the token`() {
        val session = validSession()
        val provider = ProtectedAuthenticatedApiSessionProvider { session }

        val runtime = AuthenticatedApiConfig.fromProtectedRuntime(
            "https://api.example.test/",
            false,
            provider,
        )!!

        assertEquals("https://api.example.test", runtime.api.baseUrl)
        assertEquals("account-1", runtime.scope.accountId)
        assertEquals("workspace-1", runtime.scope.workspaceId)
        assertEquals("grant-1", runtime.receiptWorkspaceGrantId)
        assertEquals("access-secret", kotlinx.coroutines.runBlocking { runtime.api.tokenProvider.bearerToken() })
        assertNull(runtime.toString().takeIf { it.contains("access-secret") })
    }

    @Test
    fun `AND-003 token provider fails closed after account or workspace switch`() {
        var session = validSession()
        val provider = ProtectedAuthenticatedApiSessionProvider { session }
        val runtime = AuthenticatedApiConfig.fromProtectedRuntime(
            "https://api.example.test",
            false,
            provider,
        )!!
        session = session.copy(workspaceId = "workspace-2", accessToken = "other-secret")

        assertNull(kotlinx.coroutines.runBlocking { runtime.api.tokenProvider.bearerToken() })
    }

    @Test
    fun `AND-003 loopback HTTP requires an explicit debug-only gate`() {
        val provider = ProtectedAuthenticatedApiSessionProvider { validSession() }

        assertNull(
            AuthenticatedApiConfig.fromProtectedRuntime(
                "http://10.0.2.2:3000",
                false,
                provider,
            ),
        )
        assertEquals(
            "http://10.0.2.2:3000",
            AuthenticatedApiConfig.fromProtectedRuntime(
                "http://10.0.2.2:3000",
                true,
                provider,
            )?.api?.baseUrl,
        )
    }

    @Test
    fun `protected session rejects path-like authority identifiers`() {
        assertThrows(IllegalArgumentException::class.java) {
            ProtectedAuthenticatedApiSession(
                accountId = "../account",
                organizationId = "organization-1",
                workspaceId = "workspace-1",
                receiptWorkspaceGrantId = "grant-1",
                accessToken = "access-secret",
            )
        }
    }

    @Test
    fun `native auth session may be read-only before a device grant is issued`() {
        val session = ProtectedAuthenticatedApiSession(
            accountId = "account-1",
            organizationId = "organization-1",
            workspaceId = "workspace-1",
            accessToken = "access-secret",
            sessionId = "session-1",
            refreshToken = "refresh-secret",
            accessExpiresAt = "2026-08-15T00:00:00Z",
            securityEpoch = 1,
        )

        assertEquals("", session.receiptWorkspaceGrantId)
        assertNull(session.toString().takeIf { it.contains("refresh-secret") })
    }

    private fun validSession() =
        ProtectedAuthenticatedApiSession(
            accountId = "account-1",
            organizationId = "organization-1",
            workspaceId = "workspace-1",
            receiptWorkspaceGrantId = "grant-1",
            accessToken = "access-secret",
        )
}
