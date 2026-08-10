package com.databreeze.android.receipts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-042: Android-side validation state mirrors deterministic server rules. */
class ReceiptValidationStateTest {
    @Test
    fun accepts_reconciled_receipt_and_flags_mismatch_or_duplicate_for_review() {
        val accepted = ReceiptValidationState.evaluate(
            merchant = "Cafe",
            transactionDateTime = "2026-08-10T10:15:00Z",
            currency = "VND",
            subtotal = 100_000,
            tax = 20_000,
            total = 120_000,
            fieldConfidence = mapOf("merchant" to 90, "total" to 95, "currency" to 97),
        )
        assertEquals(ReceiptValidationOutcome.ACCEPTED, accepted.outcome)

        val mismatch = ReceiptValidationState.evaluate(
            merchant = "Cafe",
            transactionDateTime = "2026-08-10T10:15:00Z",
            currency = "VND",
            subtotal = 100_000,
            tax = 20_000,
            total = 130_000,
            fieldConfidence = mapOf("merchant" to 90, "total" to 95, "currency" to 97),
        )
        assertEquals(ReceiptValidationOutcome.REVIEW_REQUIRED, mismatch.outcome)
        assertEquals("TOTAL_MISMATCH", mismatch.reasonCode)

        val duplicate = ReceiptValidationState.evaluate(
            merchant = "Cafe",
            transactionDateTime = "2026-08-10T10:15:00Z",
            currency = "VND",
            subtotal = 100_000,
            tax = 20_000,
            total = 120_000,
            fieldConfidence = mapOf("merchant" to 90, "total" to 95, "currency" to 97),
            artifactHash = "abc",
            existingArtifactHashes = setOf("abc"),
        )
        assertEquals(ReceiptValidationOutcome.REVIEW_REQUIRED, duplicate.outcome)
        assertTrue(duplicate.duplicateReviewRequired)
    }
}
