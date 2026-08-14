package com.databreeze.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
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
    fun receipt_capture_fails_closed_without_a_protected_authenticated_session() {
        composeRule.onNodeWithTag("capture-button").performClick()
        composeRule.onNodeWithTag("authenticated-runtime-required").assertIsDisplayed()

        composeRule.activityRule.scenario.recreate()
        composeRule.onNodeWithTag("home-screen").assertIsDisplayed()
    }

    @Test
    fun module_workbench_lists_the_catalog_and_routes_operations_capture_to_receipt_flow() {
        val captureTitle = composeRule.activity.getString(R.string.module_operations_capture_title)
        val captureRole = composeRule.activity.getString(R.string.module_operations_capture_role)
        val captureStatus = composeRule.activity.getString(R.string.workbench_lifecycle_partial)
        val openCaptureDescription = composeRule.activity.getString(
            R.string.workbench_accessibility_open_module,
            captureTitle,
            captureStatus,
            captureRole,
        )

        composeRule.onNodeWithTag("workbench-button").performClick()
        composeRule.onNodeWithTag("module-workbench-screen").assertIsDisplayed()
        composeRule.onNodeWithTag("module-card-folder-autopilot").assertIsDisplayed()
        composeRule.onNodeWithTag("module-card-operations-capture")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText(captureTitle).assertIsDisplayed()

        composeRule.onNodeWithContentDescription(openCaptureDescription).performClick()
        composeRule.onNodeWithTag("module-detail-operations-capture").assertIsDisplayed()
        composeRule.onNodeWithTag("module-open-capture").performClick()
        composeRule.onNodeWithTag("authenticated-runtime-required").assertIsDisplayed()
    }
}
