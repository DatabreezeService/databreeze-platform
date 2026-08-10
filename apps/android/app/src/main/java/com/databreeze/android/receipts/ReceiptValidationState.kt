package com.databreeze.android.receipts

enum class ReceiptValidationOutcome {
    ACCEPTED,
    REVIEW_REQUIRED,
    REJECTED,
}

data class ReceiptValidationState(
    val outcome: ReceiptValidationOutcome,
    val reasonCode: String? = null,
    val duplicateReviewRequired: Boolean = false,
) {
    companion object {
        private val supportedCurrencies = setOf("VND", "USD", "EUR")
        private const val TOLERANCE = 1L
        private const val LOW_CONFIDENCE = 85

        fun evaluate(
            merchant: String,
            transactionDateTime: String,
            currency: String,
            subtotal: Long,
            tax: Long,
            total: Long,
            fieldConfidence: Map<String, Int>,
            artifactHash: String? = null,
            existingArtifactHashes: Set<String> = emptySet(),
            paymentReference: String? = null,
            existingReferences: Set<String> = emptySet(),
        ): ReceiptValidationState {
            if (merchant.isBlank()) {
                return ReceiptValidationState(ReceiptValidationOutcome.REJECTED, "REQUIRED_FIELD_MISSING")
            }
            if (transactionDateTime.isBlank()) {
                return ReceiptValidationState(ReceiptValidationOutcome.REJECTED, "INVALID_DATETIME")
            }
            if (currency !in supportedCurrencies) {
                return ReceiptValidationState(ReceiptValidationOutcome.REJECTED, "UNSUPPORTED_CURRENCY")
            }
            if (subtotal <= 0L || tax < 0L || total <= 0L) {
                return ReceiptValidationState(ReceiptValidationOutcome.REJECTED, "NEGATIVE_OR_ZERO_AMOUNT")
            }
            if (kotlin.math.abs(subtotal + tax - total) > TOLERANCE) {
                return ReceiptValidationState(
                    ReceiptValidationOutcome.REVIEW_REQUIRED,
                    "TOTAL_MISMATCH",
                )
            }
            val low = fieldConfidence.any { (field, score) ->
                field in setOf("merchant", "total", "currency") && score < LOW_CONFIDENCE
            }
            if (low) {
                return ReceiptValidationState(
                    ReceiptValidationOutcome.REVIEW_REQUIRED,
                    "LOW_CONFIDENCE_REVIEW",
                )
            }
            val duplicate = (artifactHash != null && artifactHash in existingArtifactHashes) ||
                (paymentReference != null && paymentReference in existingReferences)
            if (duplicate) {
                return ReceiptValidationState(
                    outcome = ReceiptValidationOutcome.REVIEW_REQUIRED,
                    reasonCode = "PROBABLE_DUPLICATE",
                    duplicateReviewRequired = true,
                )
            }
            return ReceiptValidationState(ReceiptValidationOutcome.ACCEPTED)
        }
    }
}
