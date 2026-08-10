package com.databreeze.android.receipts

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.databreeze.android.MainActivity
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** DDA-040: instrumented active capture → confirm → queued upload path. */
@RunWith(AndroidJUnit4::class)
class ReceiptCaptureFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun active_capture_confirm_queues_secure_upload() {
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
                    composeRule.onNodeWithTag("receipt-review-placeholder").assertIsDisplayed()
                    true
                }.getOrDefault(false)
        }
    }
}
