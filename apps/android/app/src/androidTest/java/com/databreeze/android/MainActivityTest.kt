package com.databreeze.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
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
        composeRule.onNodeWithTag("capture-button").performClick()
        composeRule.onNodeWithTag("save-button").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithTag("draft-status").fetchSemanticsNodes().isNotEmpty()
        }

        composeRule.activityRule.scenario.recreate()
        composeRule.onNodeWithTag("capture-screen").assertIsDisplayed()
        composeRule.onNodeWithTag("draft-status").assertIsDisplayed()
    }
}
