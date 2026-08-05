package com.databreeze.android.workbench

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.databreeze.android.R

@Composable
fun WorkbenchScreen(
    onModule: (AndroidProductModule) -> Unit,
    onBack: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("module-workbench-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    stringResource(R.string.workbench_title),
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    stringResource(R.string.workbench_body),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
        items(ProductModuleWorkbench.modules, key = AndroidProductModule::id) { module ->
            ModuleCard(module = module, onOpen = { onModule(module) })
        }
        item {
            Button(
                onClick = onBack,
                modifier = Modifier.testTag("workbench-back-button"),
            ) {
                Text(stringResource(R.string.back_action))
            }
        }
    }
}

@Composable
private fun ModuleCard(
    module: AndroidProductModule,
    onOpen: () -> Unit,
) {
    val title = stringResource(module.titleRes)
    val lifecycle = stringResource(module.lifecycle.labelRes())
    val role = stringResource(module.roleRes)
    val openDescription = stringResource(
        R.string.workbench_accessibility_open_module,
        title,
        lifecycle,
        role,
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("module-card-${module.id}"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(lifecycle, style = MaterialTheme.typography.labelLarge)
            Text(stringResource(module.summaryRes), style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(R.string.workbench_mobile_role_prefix, role),
                style = MaterialTheme.typography.bodySmall,
            )
            Button(
                onClick = onOpen,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = openDescription }
                    .testTag("module-open-${module.id}"),
            ) {
                Text(stringResource(R.string.workbench_open_context))
            }
        }
    }
}

@Composable
fun ModuleDetailScreen(
    module: AndroidProductModule?,
    onBack: () -> Unit,
    onCapture: () -> Unit,
) {
    if (module == null) {
        UnknownModuleScreen(onBack = onBack)
        return
    }

    val title = stringResource(module.titleRes)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("module-detail-${module.id}"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(
            stringResource(module.lifecycle.labelRes()),
            style = MaterialTheme.typography.labelLarge,
        )
        Text(stringResource(module.summaryRes), style = MaterialTheme.typography.bodyLarge)
        Text(
            stringResource(R.string.workbench_requirement_prefix, module.requirementPrefix),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            stringResource(R.string.workbench_mobile_role_prefix, stringResource(module.roleRes)),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            stringResource(R.string.workbench_read_only_body),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            stringResource(R.string.workbench_server_authority),
            style = MaterialTheme.typography.bodySmall,
        )
        if (module.id == "operations-capture") {
            Button(
                onClick = onCapture,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("module-open-capture"),
            ) {
                Text(stringResource(R.string.workbench_open_capture))
            }
        }
        Button(
            onClick = onBack,
            modifier = Modifier.testTag("module-detail-back-button"),
        ) {
            Text(stringResource(R.string.back_action))
        }
    }
}

@Composable
private fun UnknownModuleScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("module-unavailable-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            stringResource(R.string.workbench_module_unavailable_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            stringResource(R.string.workbench_module_unavailable_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(
            onClick = onBack,
            modifier = Modifier.testTag("module-unavailable-back-button"),
        ) {
            Text(stringResource(R.string.back_action))
        }
    }
}

private fun AndroidModuleLifecycle.labelRes(): Int = when (this) {
    AndroidModuleLifecycle.PARTIAL -> R.string.workbench_lifecycle_partial
    AndroidModuleLifecycle.PLANNED -> R.string.workbench_lifecycle_planned
}
