package com.databreeze.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun homeScreenIsDisplayed() {
        composeRule.onNodeWithTag("home-screen").assertIsDisplayed()
    }

    @Test
    fun queued_draft_is_visible_after_activity_recreation() {
        val savedText = composeRule.activity.getString(R.string.capture_saved)
        composeRule.onNodeWithTag("capture-button").performClick()
        composeRule.onNodeWithTag("save-button").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(savedText).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText(savedText).assertIsDisplayed()

        composeRule.activityRule.scenario.recreate()
        composeRule.onNodeWithTag("capture-screen").assertIsDisplayed()
        composeRule.onNodeWithText(savedText).assertIsDisplayed()
    }

    @Test
    fun folder_autopilot_keeps_actions_content_free_and_reversible() {
        composeRule.onNodeWithTag("autopilot-button").performClick()
        composeRule.onNodeWithTag("autopilot-screen").assertIsDisplayed()

        composeRule.onNodeWithTag("autopilot-pause-button").performClick()
        composeRule.onNodeWithTag("autopilot-assignment-state").assertIsDisplayed()

        composeRule.onNodeWithTag("autopilot-approve-button").performClick()
        composeRule.onNodeWithTag("autopilot-approval-state").assertIsDisplayed()

        composeRule.onNodeWithTag("autopilot-undo-button").performClick()
        composeRule.onNodeWithTag("autopilot-undo-state").assertIsDisplayed()
    }
}
