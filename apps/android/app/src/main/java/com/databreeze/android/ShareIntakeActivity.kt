package com.databreeze.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.databreeze.android.receipts.ReceiptDestination
import com.databreeze.android.receipts.ReceiptUploadRequest
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.CaptureBundleEntity
import com.databreeze.android.storage.CaptureItemEntity
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Android Share receiver (AND-005). The user explicitly confirms before any bytes are copied.
 * Only bounded content:// streams are accepted; no filesystem path or external URI is persisted.
 */
class ShareIntakeActivity : ComponentActivity() {
    private val maxBytesPerItem = 20L * 1024L * 1024L
    private val maxBytesTotal = 50L * 1024L * 1024L
    private val maxItems = 8
    private val allowedMimeTypes = setOf(
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val message = TextView(this).apply {
            setPadding(32, 64, 32, 24)
            text = getString(R.string.share_confirmation_required)
        }
        val confirm = Button(this).apply {
            text = getString(R.string.share_confirm)
            setOnClickListener {
                isEnabled = false
                lifecycleScope.launch {
                    message.text = processShare()
                    message.setOnClickListener { finish() }
                    isEnabled = true
                }
            }
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(message, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(confirm, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        setContentView(root)
    }

    private suspend fun processShare(): String = withContext(Dispatchers.IO) {
        val application = application as DataBreezeApplication
        val session = application.sessionManager.currentSession()
            ?: return@withContext getString(R.string.share_sign_in_required)
        val runtime = application.runtime
        val grant = session.receiptWorkspaceGrantId
        if (grant.isBlank()) return@withContext getString(R.string.share_device_grant_required)
        val uris = sharedUris(intent).take(maxItems)
        if (uris.isEmpty()) return@withContext getString(R.string.share_file_missing)
        val scope = AccountWorkspaceScope(session.accountId, session.workspaceId)
        val key = runtime.receiptKeyHandle
        var accepted = 0
        var ordinal = 0
        var totalBytes = 0L
        val bundleId = UUID.randomUUID().toString()
        val createdAt = System.currentTimeMillis()
        val bundlePersisted = runCatching {
            runtime.localStore.saveCaptureBundle(
                CaptureBundleEntity(
                    accountId = scope.accountId,
                    workspaceId = scope.workspaceId,
                    bundleId = bundleId,
                    kind = "document",
                    state = CaptureBundleEntity.DRAFT_STATE,
                    dataModeSnapshot = "HYBRID",
                    operationId = bundleId,
                    createdAtEpochMs = createdAt,
                ),
            )
        }.isSuccess
        if (!bundlePersisted) return@withContext getString(R.string.share_rejected)
        for (uri in uris) {
            if (uri.scheme != "content") continue
            if ((intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0) continue
            val mime = contentResolver.getType(uri).orEmpty().lowercase().substringBefore(';')
            if (mime !in allowedMimeTypes) continue
            val bytes = readBounded(uri, maxBytesPerItem) ?: continue
            totalBytes += bytes.size
            if (totalBytes > maxBytesTotal) break
            val id = UUID.randomUUID().toString()
            val digest = "sha256:" + sha256(bytes)
            if (!runtime.receiptStagingStore.stage(scope, key, id, bytes, digest).accepted) continue
            val itemOrdinal = ordinal++
            val metadataPersisted = runCatching {
                runtime.localStore.saveCaptureItem(
                    CaptureItemEntity(
                        accountId = scope.accountId,
                        workspaceId = scope.workspaceId,
                        itemId = id,
                        bundleId = bundleId,
                        ordinal = itemOrdinal,
                        mediaType = mime,
                        appPrivateUri = "app-private://share/$id",
                        byteLength = bytes.size.toLong(),
                        sha256 = digest,
                        source = "SHARE",
                        original = true,
                        syncState = CaptureBundleEntity.DRAFT_STATE,
                        createdAtEpochMs = createdAt,
                    ),
                )
            }.isSuccess
            if (!metadataPersisted) {
                runtime.receiptStagingStore.delete(scope, id)
                continue
            }
            val scheduled = runtime.receiptUploadScheduler.schedule(
                ReceiptUploadRequest(
                    scope = scope,
                    artifactSessionId = id,
                    contentDigest = digest,
                    destination = ReceiptDestination.Hybrid(grant),
                    uploadedBytes = 0,
                    totalBytes = bytes.size.toLong(),
                    fileName = safeDisplayName(uri, mime, id),
                    mediaType = mime,
                ),
            )
            if (scheduled.accepted) accepted++
        }
        if (accepted > 0) runtime.localStore.updateCaptureState(scope, bundleId, CaptureBundleEntity.QUEUED_STATE)
        if (accepted == 0) getString(R.string.share_rejected)
        else getString(R.string.share_queued, accepted)
    }

    private fun sharedUris(value: Intent): List<Uri> = when (value.action) {
        Intent.ACTION_SEND -> listOfNotNull(value.getParcelableExtra(Intent.EXTRA_STREAM))
        Intent.ACTION_SEND_MULTIPLE -> value.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
        else -> emptyList()
    }

    private fun readBounded(uri: Uri, limit: Long): ByteArray? = runCatching {
        contentResolver.openInputStream(uri)?.use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(16 * 1024)
            var total = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > limit) return null
                output.write(buffer, 0, count)
            }
            output.toByteArray().takeIf { it.isNotEmpty() }
        }
    }.getOrNull()

    private fun safeDisplayName(uri: Uri, mime: String, fallbackId: String): String {
        val raw = runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull().orEmpty()
        val sanitized = raw.replace(Regex("[^A-Za-z0-9 ._()\\-]"), "_")
            .trim().take(120).trim('.')
        if (sanitized.isNotBlank()) return sanitized
        val extension = when (mime) {
            "application/pdf" -> "pdf"
            "text/csv" -> "csv"
            "application/vnd.ms-excel" -> "xls"
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> "xlsx"
            "image/png" -> "png"
            "image/webp" -> "webp"
            else -> "jpg"
        }
        return "shared-$fallbackId.$extension"
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
