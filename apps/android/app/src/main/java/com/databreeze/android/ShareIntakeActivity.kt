package com.databreeze.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.databreeze.android.R
import com.databreeze.android.receipts.ReceiptDestination
import com.databreeze.android.receipts.ReceiptUploadRequest
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Android Share receiver (AND-005). Shared content is copied directly into encrypted app-private
 * staging and then handed to the authenticated WorkManager queue. No external path or URI is
 * persisted, and unauthenticated/ungranted shares are rejected without leaking metadata.
 */
class ShareIntakeActivity : ComponentActivity() {
    private val maxBytes = 512_000L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val message = TextView(this).apply { setPadding(32, 64, 32, 32) }
        setContentView(message)
        lifecycleScope.launch {
            message.text = processShare()
            message.setOnClickListener { finish() }
        }
    }

    private suspend fun processShare(): String = withContext(Dispatchers.IO) {
        val application = application as DataBreezeApplication
        val session = application.sessionManager.currentSession()
            ?: return@withContext getString(R.string.share_sign_in_required)
        val runtime = application.runtime
        val grant = session.receiptWorkspaceGrantId
        if (grant.isBlank()) return@withContext getString(R.string.share_device_grant_required)
        val uris = sharedUris(intent)
        if (uris.isEmpty()) return@withContext getString(R.string.share_file_missing)
        val scope = com.databreeze.android.storage.AccountWorkspaceScope(session.accountId, session.workspaceId)
        val key = runtime.receiptKeyHandle
        var accepted = 0
        for (uri in uris.take(8)) {
            val mime = contentResolver.getType(uri).orEmpty().lowercase()
            if (mime !in setOf("image/jpeg", "image/png", "image/webp")) continue
            val bytes = readBounded(uri) ?: continue
            val id = UUID.randomUUID().toString()
            val digest = "sha256:" + sha256(bytes)
            if (!runtime.receiptStagingStore.stage(scope, key, id, bytes, digest).accepted) continue
            val scheduled = runtime.receiptUploadScheduler.schedule(
                ReceiptUploadRequest(
                    scope = scope,
                    artifactSessionId = id,
                    contentDigest = digest,
                    destination = ReceiptDestination.Hybrid(grant),
                    uploadedBytes = 0,
                    totalBytes = bytes.size.toLong(),
                ),
            )
            if (scheduled.accepted) accepted++
        }
        if (accepted == 0) getString(R.string.share_rejected)
        else getString(R.string.share_queued, accepted)
    }

    private fun sharedUris(value: Intent): List<Uri> = when (value.action) {
        Intent.ACTION_SEND -> listOfNotNull(value.getParcelableExtra(Intent.EXTRA_STREAM))
        Intent.ACTION_SEND_MULTIPLE -> value.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
        else -> emptyList()
    }

    private fun readBounded(uri: Uri): ByteArray? = runCatching {
        contentResolver.openInputStream(uri)?.use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(16 * 1024)
            var total = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > maxBytes) return null
                output.write(buffer, 0, count)
            }
            output.toByteArray().takeIf { it.isNotEmpty() }
        }
    }.getOrNull()

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
