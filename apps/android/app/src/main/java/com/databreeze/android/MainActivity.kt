package com.databreeze.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DataBreezeApp() }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun DataBreezeApp() {
    val navController = rememberNavController()
    DataBreezeTheme {
        Scaffold(
            topBar = { TopAppBar(title = { Text(stringResource(R.string.app_name)) }) },
        ) { padding ->
            NavHost(
                navController = navController,
                startDestination = "home",
                modifier = Modifier.padding(padding),
            ) {
                composable("home") {
                    HomeScreen(onCapture = { navController.navigate("capture") })
                }
                composable("capture") { CaptureScreen(onBack = { navController.popBackStack() }) }
            }
        }
    }
}

@Composable
private fun HomeScreen(onCapture: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("home-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.home_body), style = MaterialTheme.typography.bodyLarge)
        Button(onClick = onCapture, modifier = Modifier.testTag("capture-button")) {
            Text(stringResource(R.string.capture_action))
        }
    }
}

@Composable
private fun CaptureScreen(onBack: () -> Unit) {
    var submitted by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("capture-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.capture_title), style = MaterialTheme.typography.headlineSmall)
        Text(
            stringResource(if (submitted) R.string.capture_saved else R.string.capture_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(onClick = { submitted = true }, modifier = Modifier.testTag("save-button")) {
            Text(stringResource(R.string.capture_save))
        }
        Button(onClick = onBack, modifier = Modifier.testTag("back-button")) {
            Text(stringResource(R.string.back_action))
        }
    }
}
