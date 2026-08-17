package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.util.UUID

sealed interface ConversationApiResult {
    data class Created(val conversationId: String) : ConversationApiResult
    data class Answer(val conversationId: String, val narrative: String) : ConversationApiResult
    data class Rejected(val code: String) : ConversationApiResult
    data object Retryable : ConversationApiResult
}

/** Uses the governed conversation/agent endpoints; provider credentials never reach Android. */
class AuthenticatedConversationApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun create(title: String, datasetId: String, datasetVersionId: String): ConversationApiResult {
        if (title.isBlank() || title.length > 200 || !isUuid(datasetId) || !isUuid(datasetVersionId)) {
            return ConversationApiResult.Rejected("conversation_request_invalid")
        }
        val key = "android-conversation-${UUID.randomUUID()}"
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    "POST",
                    "/v1/dda/conversations",
                    mapper.writeValueAsString(
                        mapOf(
                            "title" to title,
                            "datasetIds" to listOf(datasetId),
                            "datasetVersionIds" to mapOf(datasetId to datasetVersionId),
                            "idempotencyKey" to key,
                        ),
                    ),
                    key,
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val id = runCatching { mapper.readTree(response.body).get("conversationId")?.textValue() }.getOrNull()
                if (id == null || !isUuid(id)) ConversationApiResult.Rejected("conversation_response_invalid")
                else ConversationApiResult.Created(id)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> ConversationApiResult.Rejected("conversation_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ConversationApiResult.Retryable
        }
    }

    suspend fun turn(conversationId: String, text: String, locale: String = "vi-VN"): ConversationApiResult {
        if (!isUuid(conversationId) || text.isBlank() || text.length > 8_000 || locale !in setOf("vi-VN", "en")) {
            return ConversationApiResult.Rejected("agent_turn_request_invalid")
        }
        val key = "android-turn-${UUID.randomUUID()}"
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    "POST",
                    "/v1/dda/agent/turns",
                    mapper.writeValueAsString(
                        mapOf(
                            "schemaVersion" to 4,
                            "conversationId" to conversationId,
                            "messageId" to UUID.randomUUID().toString(),
                            "text" to text,
                            "idempotencyKey" to key,
                            "locale" to locale,
                        ),
                    ),
                    key,
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val root = runCatching { mapper.readTree(response.body) }.getOrNull()
                val narrative = root?.get("narrative")?.takeIf { it.isTextual }?.textValue()
                if (narrative.isNullOrBlank()) ConversationApiResult.Rejected("agent_response_invalid")
                else ConversationApiResult.Answer(conversationId, narrative)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> ConversationApiResult.Rejected("agent_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ConversationApiResult.Retryable
        }
    }

    private fun isUuid(value: String): Boolean = UUID_PATTERN.matches(value)
    private companion object {
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    }
}
