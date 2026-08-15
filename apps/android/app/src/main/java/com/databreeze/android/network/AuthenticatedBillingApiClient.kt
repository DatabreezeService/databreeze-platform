package com.databreeze.android.network

import com.databreeze.contracts.v4.BuaPayosCheckoutSession
import com.databreeze.contracts.v4.BuaPayosPaymentStatus
import com.databreeze.contracts.v4.BuaPayosPlanCatalog
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

/** Server-owned PayOS billing models used by the authenticated Android client. */
data class BillingPlan(
    val id: String,
    val family: String,
    val billingCycle: String,
    val amountVnd: Long,
    val displayNameVi: String,
    val displayNameEn: String,
    val taglineVi: String,
    val taglineEn: String,
    val benefitsVi: List<String>,
    val benefitsEn: List<String>,
)

data class BillingSession(
    val paymentOrderId: String,
    val orderCode: Long,
    val planId: String,
    val amountVnd: Long,
    val currency: String,
    val status: String,
    val checkoutUrl: String?,
)

sealed interface BillingApiResult<out TValue> {
    data class Success<TValue>(val value: TValue) : BillingApiResult<TValue>
    data class Rejected(val code: String) : BillingApiResult<Nothing>
    data object Retryable : BillingApiResult<Nothing>
}

/**
 * Authenticated, contract-validating billing boundary.
 *
 * The client sends only an immutable plan id. Amounts, currency, checkout URL and status are
 * always accepted from the server after v4 schema validation; no payment secret or amount is
 * packaged in the APK.
 */
class AuthenticatedBillingApiClient(
    private val transport: AuthenticatedApiTransport,
    private val idempotencyKey: () -> String,
) {
    private val mapper = jacksonObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

    suspend fun listPlans(): BillingApiResult<List<BillingPlan>> {
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(method = "GET", path = "/v1/billing/payos/plans"),
            )
        ) {
        is AuthenticatedHttpResult.Success -> {
            val catalog = parseCatalog(response.body)
                ?: return BillingApiResult.Rejected("billing_response_invalid")
            BillingApiResult.Success(catalog.plans.map { plan ->
                BillingPlan(
                    id = plan.id,
                    family = plan.family,
                    billingCycle = plan.billingCycle,
                    amountVnd = plan.amountVnd,
                    displayNameVi = plan.displayNameVi,
                    displayNameEn = plan.displayNameEn,
                    taglineVi = plan.taglineVi,
                    taglineEn = plan.taglineEn,
                    benefitsVi = plan.benefitsVi,
                    benefitsEn = plan.benefitsEn,
                )
            })
        }
        is AuthenticatedHttpResult.TerminalAuthFailure ->
            BillingApiResult.Rejected("billing_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> BillingApiResult.Retryable
        }
    }

    suspend fun createCheckout(planId: String): BillingApiResult<BillingSession> {
        if (planId.isBlank() || planId.length > 64) return BillingApiResult.Rejected("plan_invalid")
        val body = mapper.writeValueAsString(mapOf("schemaVersion" to 4, "planId" to planId))
        return executeSession(
            AuthenticatedHttpRequest(
                method = "POST",
                path = "/v1/billing/payos/checkout-sessions",
                jsonBody = body,
                idempotencyKey = idempotencyKey(),
            ),
            CHECKOUT_SESSION_SCHEMA,
        )
    }

    suspend fun status(orderCode: Long): BillingApiResult<BillingSession> {
        if (orderCode < 1) return BillingApiResult.Rejected("order_invalid")
        return executeSession(
            AuthenticatedHttpRequest(
                method = "GET",
                path = "/v1/billing/payos/sessions/${orderCode}",
            ),
            PAYMENT_STATUS_SCHEMA,
        )
    }

    private suspend fun executeSession(
        request: AuthenticatedHttpRequest,
        schema: String,
    ): BillingApiResult<BillingSession> = when (val response = transport.execute(request)) {
        is AuthenticatedHttpResult.Success -> {
            val value = parseSession(response.body, schema)
            val session = when (value) {
                is BuaPayosCheckoutSession -> value.toBillingSession()
                is BuaPayosPaymentStatus -> value.toBillingSession()
                else -> null
            }
            if (session == null) BillingApiResult.Rejected("billing_response_invalid")
            else BillingApiResult.Success(session)
        }
        is AuthenticatedHttpResult.TerminalAuthFailure ->
            BillingApiResult.Rejected("billing_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> BillingApiResult.Retryable
    }

    private fun parseCatalog(body: String): BuaPayosPlanCatalog? = runCatching {
        mapper.readValue(body, BuaPayosPlanCatalog::class.java).takeIf { catalog ->
            catalog.schemaVersion == 4L && catalog.plans.isNotEmpty() && catalog.plans.all { plan ->
                plan.id.isNotBlank() && plan.amountVnd > 0L &&
                    plan.billingCycle in setOf("monthly", "annual") &&
                    plan.family in setOf("personal", "professional", "team") &&
                    plan.benefitsVi.isNotEmpty() && plan.benefitsEn.isNotEmpty()
            }
        }
    }.getOrNull()

    private fun parseSession(body: String, schema: String): Any? = runCatching {
        when (schema) {
            CHECKOUT_SESSION_SCHEMA -> mapper.readValue(body, BuaPayosCheckoutSession::class.java)
            PAYMENT_STATUS_SCHEMA -> mapper.readValue(body, BuaPayosPaymentStatus::class.java)
            else -> null
        }
    }.getOrNull()?.takeIf { value ->
        when (value) {
            is BuaPayosCheckoutSession -> value.schemaVersion == 4L && value.currency == "VND" &&
                value.orderCode > 0L && value.amountVnd > 0L && value.status in STATUS_VALUES &&
                (value.checkoutUrl == null || value.checkoutUrl.startsWith("https://"))
            is BuaPayosPaymentStatus -> value.schemaVersion == 4L && value.currency == "VND" &&
                value.orderCode > 0L && value.amountVnd > 0L && value.status in STATUS_VALUES &&
                (value.checkoutUrl == null || value.checkoutUrl.startsWith("https://"))
            else -> false
        }
    }

    private fun BuaPayosCheckoutSession.toBillingSession() = BillingSession(
        paymentOrderId = paymentOrderId,
        orderCode = orderCode,
        planId = planId,
        amountVnd = amountVnd,
        currency = currency,
        status = status,
        checkoutUrl = checkoutUrl,
    )

    private fun BuaPayosPaymentStatus.toBillingSession() = BillingSession(
        paymentOrderId = paymentOrderId,
        orderCode = orderCode,
        planId = planId,
        amountVnd = amountVnd,
        currency = currency,
        status = status,
        checkoutUrl = checkoutUrl,
    )

    private companion object {
        const val CHECKOUT_SESSION_SCHEMA = "https://schemas.databreeze.dev/contracts/v4/bua-payos-checkout-session"
        const val PAYMENT_STATUS_SCHEMA = "https://schemas.databreeze.dev/contracts/v4/bua-payos-payment-status"
        val STATUS_VALUES = setOf("PENDING", "PAID", "CANCELLED", "FAILED")
    }
}
