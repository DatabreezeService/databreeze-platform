package com.databreeze.android.network

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceGrantApiClientTest {
    @Test
    fun `only grants for the requested workspace are accepted`() = runBlocking {
        val workspaceId = "22222222-2222-4222-8222-222222222222"
        val deviceId = "11111111-1111-4111-8111-111111111111"
        val transport = RecordingTransport(
            AuthenticatedHttpResult.Success(
                200,
                """
                {"accepted":true,"value":[
                  {"id":"33333333-3333-4333-8333-333333333333","workspaceId":"$workspaceId","status":"ACTIVE","revision":1,"allowedActionTypes":["RECEIPT.UPLOAD"]}
                ]}
                """.trimIndent(),
            ),
        )

        val result = DeviceGrantApiClient(transport, workspaceId).list(deviceId)

        assertTrue(result is DeviceGrantApiClient.Result.Ready)
        assertEquals(
            "33333333-3333-4333-8333-333333333333",
            (result as DeviceGrantApiClient.Result.Ready).grants.single().id,
        )
        assertEquals("/v1/devices/$deviceId/grants", transport.requests.single().path)
    }

    @Test
    fun `malformed grant response fails closed`() = runBlocking {
        val result = DeviceGrantApiClient(
            RecordingTransport(AuthenticatedHttpResult.Success(200, "{\"accepted\":true,\"value\":[{\"status\":\"ACTIVE\"}]}")),
            "22222222-2222-4222-8222-222222222222",
        ).list("11111111-1111-4111-8111-111111111111")

        assertEquals(DeviceGrantApiClient.Result.Rejected("device_grant_response_invalid"), result)
    }

    private class RecordingTransport(
        private val response: AuthenticatedHttpResult,
    ) : AuthenticatedApiTransport {
        val requests = mutableListOf<AuthenticatedHttpRequest>()

        override suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult {
            requests += request
            return response
        }
    }
}
