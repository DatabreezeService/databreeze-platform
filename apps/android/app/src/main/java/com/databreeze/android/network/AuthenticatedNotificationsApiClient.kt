package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

data class NotificationSummary(val id: String, val title: String, val state: String, val createdAt: String)

sealed interface NotificationsApiResult {
    data class Ready(val items: List<NotificationSummary>, val unreadCount: Int) : NotificationsApiResult
    data class Rejected(val code: String) : NotificationsApiResult
    data object Retryable : NotificationsApiResult
}

/** Redacted in-app notification reader. Payloads and deep-link tokens are never trusted locally. */
class AuthenticatedNotificationsApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun list(): NotificationsApiResult = when (
        val response = transport.execute(AuthenticatedHttpRequest("GET", "/v3/notifications?limit=50"))
    ) {
        is AuthenticatedHttpResult.Success -> runCatching {
            val root = mapper.readTree(response.body)
            val rows = root.get("items")
            if (rows == null || !rows.isArray || rows.size() > 50) return@runCatching NotificationsApiResult.Rejected("notification_response_invalid")
            val items = rows.mapNotNull { row ->
                val id = row.get("id")?.textValue() ?: row.get("notificationId")?.textValue()
                // The v3 contract deliberately exposes locale-specific safe labels, not an
                // arbitrary title/payload field. Prefer the Vietnamese label and fall back to
                // English only when the device is not running the default locale.
                val title = row.get("labelVi")?.textValue()
                    ?: row.get("labelEn")?.textValue()
                    ?: row.get("title")?.textValue()
                    ?: row.get("summary")?.textValue()
                val state = row.get("state")?.textValue() ?: "UNREAD"
                val created = row.get("createdAt")?.textValue() ?: row.get("occurredAt")?.textValue()
                if (id.isNullOrBlank() || title.isNullOrBlank() || created.isNullOrBlank()) null
                else NotificationSummary(id.take(128), title.take(240), state.take(32), created.take(64))
            }
            if (items.size != rows.size()) NotificationsApiResult.Rejected("notification_response_invalid")
            else NotificationsApiResult.Ready(items, root.get("unreadCount")?.intValue()?.coerceIn(0, 50) ?: 0)
        }.getOrElse { NotificationsApiResult.Rejected("notification_response_invalid") }
        is AuthenticatedHttpResult.TerminalAuthFailure -> NotificationsApiResult.Rejected("notification_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> NotificationsApiResult.Retryable
    }
}
