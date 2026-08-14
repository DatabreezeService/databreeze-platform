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
    fun capture_never_uses_a_demo_scope_when_protected_session_is_absent() {
        composeRule.onNodeWithTag("capture-button").performClick()
        composeRule.onNodeWithTag("authenticated-runtime-required").assertIsDisplayed()
    }
}
