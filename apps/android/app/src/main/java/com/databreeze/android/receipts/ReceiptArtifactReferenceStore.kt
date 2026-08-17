package com.databreeze.android.receipts

import android.content.Context

/** Durable, non-sensitive mapping from a local upload session to a server artifact version. */
interface ReceiptArtifactReferenceStore {
    fun save(sessionId: String, artifactVersionId: String, contentDigest: String? = null)
    fun find(sessionId: String): String?
    fun findDigest(sessionId: String): String?
    fun clear()
}

class InMemoryReceiptArtifactReferenceStore : ReceiptArtifactReferenceStore {
    private val values = mutableMapOf<String, Pair<String, String?>>()
    override fun save(sessionId: String, artifactVersionId: String, contentDigest: String?) {
        values[sessionId] = artifactVersionId to contentDigest
    }
    override fun find(sessionId: String): String? = values[sessionId]?.first
    override fun findDigest(sessionId: String): String? = values[sessionId]?.second
    override fun clear() = values.clear()
}

class SharedPreferencesReceiptArtifactReferenceStore(context: Context) : ReceiptArtifactReferenceStore {
    private val preferences = context.applicationContext.getSharedPreferences(
        "databreeze-receipt-artifacts",
        Context.MODE_PRIVATE,
    )

    override fun save(sessionId: String, artifactVersionId: String, contentDigest: String?) {
        require(isUuid(sessionId) && isUuid(artifactVersionId))
        val editor = preferences.edit().putString(sessionId, artifactVersionId)
        if (contentDigest != null) editor.putString("$sessionId:digest", contentDigest)
        check(editor.commit())
    }

    override fun find(sessionId: String): String? =
        preferences.getString(sessionId, null)?.takeIf(::isUuid)

    override fun findDigest(sessionId: String): String? =
        preferences.getString("$sessionId:digest", null)?.takeIf { SHA256_PATTERN.matches(it) }

    override fun clear() {
        check(preferences.edit().clear().commit())
    }

    private fun isUuid(value: String): Boolean = UUID_PATTERN.matches(value)

    private companion object {
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        val SHA256_PATTERN = Regex("^[0-9a-f]{64}$")
    }
}
