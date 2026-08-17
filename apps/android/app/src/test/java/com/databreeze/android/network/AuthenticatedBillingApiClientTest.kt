package com.databreeze.android.network

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthenticatedBillingApiClientTest {
    @Test
    fun `catalog and checkout use server-owned amount and immutable plan id`() = runBlocking {
        val transport = RecordingTransport(
            listOf(
                AuthenticatedHttpResult.Success(200, catalogJson),
                AuthenticatedHttpResult.Success(201, sessionJson),
            ),
        )
        val client = AuthenticatedBillingApiClient(transport) { "android-billing-test" }

        val plans = client.listPlans() as BillingApiResult.Success
        assertEquals(1, plans.value.size)
        assertEquals(149_000L, plans.value.single().amountVnd)

        val checkout = client.createCheckout("personal-monthly") as BillingApiResult.Success
        assertEquals(149_000L, checkout.value.amountVnd)
        assertTrue(transport.requests[1].jsonBody!!.contains("\"planId\":\"personal-monthly\""))
        assertTrue(!transport.requests[1].jsonBody!!.contains("amountVnd"))
        assertEquals("android-billing-test", transport.requests[1].idempotencyKey)
    }

    @Test
    fun `malformed or non-server checkout responses fail closed`() = runBlocking {
        val transport = RecordingTransport(
            listOf(AuthenticatedHttpResult.Success(200, "{\"schemaVersion\":4,\"plans\":[]}")),
        )
        val result = AuthenticatedBillingApiClient(transport) { "idempotency" }.listPlans()
        assertEquals(BillingApiResult.Rejected("billing_response_invalid"), result)
    }

    private class RecordingTransport(
        private val responses: List<AuthenticatedHttpResult>,
    ) : AuthenticatedApiTransport {
        val requests = mutableListOf<AuthenticatedHttpRequest>()

        override suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult {
            requests += request
            return responses[requests.lastIndex]
        }
    }

    private companion object {
        const val catalogJson = """
            {"schemaVersion":4,"plans":[{"id":"personal-monthly","family":"personal","billingCycle":"monthly","amountVnd":149000,"description":"DataBreeze Ca nhan thang","displayNameVi":"Cá nhân","displayNameEn":"Personal","taglineVi":"Cho cá nhân","taglineEn":"For individuals","benefitsVi":["Web, Desktop và Android"],"benefitsEn":["Web, Desktop and Android"],"allowances":{"connectedFolders":"unlimited","ocrPagesPerMonth":200,"agentCreditsPerMonth":1000,"etlRowsPerMonth":5000000,"logicalDatasets":20,"governedStorageGb":10,"agentEnabledMembers":1,"viewerMembers":2,"workspaces":1,"refreshMinutes":60}}]}
        """
        const val sessionJson = """
            {"schemaVersion":4,"paymentOrderId":"11111111-1111-4111-8111-111111111111","orderCode":123456,"planId":"personal-monthly","amountVnd":149000,"currency":"VND","status":"PENDING","checkoutUrl":"https://localhost:8443/vi-VN/billing/mock-checkout/123456"}
        """
    }
}
