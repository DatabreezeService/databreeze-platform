package com.databreeze.android.receipts

import com.databreeze.android.storage.AccountWorkspaceScope
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-040: unique idempotent WorkManager upload scheduling. */
class ReceiptUploadSchedulerTest {
    private val scope = AccountWorkspaceScope("account-1", "workspace-1")

    @Test
    fun unique_work_name_is_stable_for_artifact_session() {
        val name = ReceiptUploadScheduler.uniqueWorkName(
            scope = scope,
            artifactSessionId = "session-abc",
        )
        assertEquals(
            ReceiptUploadScheduler.uniqueWorkName(scope, "session-abc"),
            name,
        )
        assertTrue(name.startsWith("receipt-upload-"))
        assertFalse(name.contains("account-1"))
        assertFalse(name.contains("workspace-1"))
        assertFalse(name.contains("session-abc"))
    }

    @Test
    fun schedule_uses_keep_policy_and_rejects_duplicate_enqueue() {
        val recorder = RecordingReceiptUploadScheduler()
        val request = ReceiptUploadRequest(
            scope = scope,
            artifactSessionId = "session-1",
            contentDigest = "sha256:${"a".repeat(64)}",
            destination = ReceiptDestination.Hybrid(workspaceGrantId = "grant-1"),
            uploadedBytes = 0L,
            totalBytes = 1200L,
        )

        assertTrue(recorder.schedule(request).accepted)
        assertFalse(recorder.schedule(request).accepted)
        assertEquals(ExistingWorkPolicyKind.KEEP, recorder.lastPolicy)
        assertEquals(1, recorder.enqueueCount)
    }

    @Test
    fun schedule_rejects_strict_local_destination() {
        val recorder = RecordingReceiptUploadScheduler()
        val result = recorder.schedule(
            ReceiptUploadRequest(
                scope = scope,
                artifactSessionId = "session-2",
                contentDigest = "sha256:${"b".repeat(64)}",
                destination = ReceiptDestination.StrictLocal,
                uploadedBytes = 0L,
                totalBytes = 100L,
            ),
        )
        assertFalse(result.accepted)
        assertEquals(ReceiptUploadDenyReason.STRICT_LOCAL_DESTINATION, result.denyReason)
    }

    @Test
    fun schedule_rejects_missing_destination_and_revoked_scope() {
        val recorder = RecordingReceiptUploadScheduler(revoked = setOf(scope.stableKey))
        assertEquals(
            ReceiptUploadDenyReason.MISSING_DESTINATION,
            recorder.schedule(
                ReceiptUploadRequest(
                    scope = scope,
                    artifactSessionId = "session-3",
                    contentDigest = "sha256:${"c".repeat(64)}",
                    destination = null,
                    uploadedBytes = 0L,
                    totalBytes = 100L,
                ),
            ).denyReason,
        )
        assertEquals(
            ReceiptUploadDenyReason.SCOPE_REVOKED,
            recorder.schedule(
                ReceiptUploadRequest(
                    scope = scope,
                    artifactSessionId = "session-4",
                    contentDigest = "sha256:${"d".repeat(64)}",
                    destination = ReceiptDestination.Cloud(workspaceGrantId = "grant-2"),
                    uploadedBytes = 0L,
                    totalBytes = 100L,
                ),
            ).denyReason,
        )
    }

    @Test
    fun partial_upload_resumes_from_verified_byte_offset() {
        val progress = ReceiptUploadProgress(
            artifactSessionId = "session-5",
            uploadedBytes = 512L,
            totalBytes = 2048L,
        )
        assertEquals(512L, progress.resumeFromByte)
        assertFalse(progress.isComplete)
        assertTrue(
            ReceiptUploadProgress(
                artifactSessionId = "session-5",
                uploadedBytes = 2048L,
                totalBytes = 2048L,
            ).isComplete,
        )
    }

    @Test
    fun offline_retry_keeps_same_unique_work_name() {
        val first = ReceiptUploadScheduler.uniqueWorkName(scope, "offline-session")
        val second = ReceiptUploadScheduler.uniqueWorkName(scope, "offline-session")
        assertEquals(first, second)
    }
}
