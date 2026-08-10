package com.databreeze.android.receipts

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.databreeze.android.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Golden Android receipt journey (prototype).
 * Honest limits: shutter prototype, in-memory staging, fake OCR; emulator optional (086).
 */
@RunWith(AndroidJUnit4::class)
class DdaGoldenReceiptJourneyTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun reviewed_receipt_journey_reaches_queued_or_review_without_streaming_claims() {
        val resources = InstrumentationRegistry.getInstrumentation().targetContext.resources
        val allCopy =
            (
                resources.getString(com.databreeze.android.R.string.receipt_capture_title) +
                    resources.getString(com.databreeze.android.R.string.receipt_review_title) +
                    resources.getString(com.databreeze.android.R.string.receipt_capture_body)
                ).lowercase()
        assertFalse(allCopy.contains("streaming"))
        assertFalse(allCopy.contains("real-time"))
        assertFalse(allCopy.contains("realtime"))

        composeRule.onNodeWithTag("capture-button").performClick()
        composeRule.onNodeWithTag("receipt-capture-screen").assertIsDisplayed()
        composeRule.onNodeWithTag("receipt-capture-shutter").performClick()
        composeRule.onNodeWithTag("receipt-capture-confirm").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) {
            runCatching {
                composeRule.onNodeWithTag("receipt-capture-queued").assertIsDisplayed()
                true
            }.getOrDefault(false) ||
                runCatching {
                    composeRule.onNodeWithTag("receipt-review-screen").assertIsDisplayed()
                    true
                }.getOrDefault(false)
        }

        val accepted = ReceiptValidationState.evaluate(
            merchant = "Demo Cafe",
            transactionDateTime = "2026-08-10T10:15:00+07:00",
            currency = "VND",
            subtotal = 100_000,
            tax = 25_000,
            total = 125_000,
            fieldConfidence = mapOf("merchant" to 91, "total" to 93, "currency" to 97),
        )
        assertEquals(ReceiptValidationOutcome.ACCEPTED, accepted.outcome)
    }
}
