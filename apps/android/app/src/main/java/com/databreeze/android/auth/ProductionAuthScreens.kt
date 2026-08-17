package com.databreeze.android.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.databreeze.android.R
import com.databreeze.android.network.AndroidSessionManager
import com.databreeze.android.network.IamApiResult
import com.databreeze.android.ui.AppBrandMark
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import kotlinx.coroutines.launch

/** Production login. There is no demo identity or fallback credential. */
@Composable
fun ProductionSignInScreen(
    sessionManager: AndroidSessionManager,
    onAuthenticated: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val networkError = stringResource(R.string.auth_network_error)

    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("production-sign-in"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            AppBrandMark()
            AppSectionHeader(
                eyebrow = stringResource(R.string.app_name),
                title = stringResource(R.string.auth_sign_in_title),
                description = stringResource(R.string.auth_sign_in_body),
                modifier = Modifier.padding(top = 10.dp),
            )
        }
        item {
            AppCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it; error = null },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text(stringResource(R.string.auth_email)) },
                        enabled = !submitting,
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = null },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text(stringResource(R.string.auth_password)) },
                        visualTransformation = PasswordVisualTransformation(),
                        enabled = !submitting,
                    )
                    error?.let { AppStatusBanner(it, error = true) }
                    Button(
                        onClick = {
                            submitting = true
                            error = null
                            scope.launch {
                                when (val result = sessionManager.signIn(email, password)) {
                                    is IamApiResult.Success -> onAuthenticated()
                                    is IamApiResult.Rejected -> error = authError(result.code)
                                    IamApiResult.Retryable -> error = networkError
                                }
                                submitting = false
                            }
                        },
                        enabled = !submitting && email.isNotBlank() && password.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (submitting) stringResource(R.string.auth_signing_in) else stringResource(R.string.auth_sign_in))
                    }
                }
            }
        }
    }
}

@Composable
fun MfaRequiredScreen(onSignOut: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp).testTag("mfa-required"),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        AppBrandMark()
        AppSectionHeader(
            eyebrow = stringResource(R.string.app_name),
            title = stringResource(R.string.auth_mfa_required_title),
            description = stringResource(R.string.auth_mfa_required_body),
        )
        Button(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.auth_sign_out))
        }
    }
}

private fun authError(code: String): String = when (code) {
    "api_not_configured" -> "API ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh cho b\u1ea3n build n\u00e0y."
    "email_invalid" -> "Email kh\u00f4ng h\u1ee3p l\u1ec7."
    "password_invalid" -> "M\u1eadt kh\u1ea9u ph\u1ea3i c\u00f3 t\u1eeb 12 k\u00fd t\u1ef1."
    "credentials_rejected" -> "Email ho\u1eb7c m\u1eadt kh\u1ea9u kh\u00f4ng \u0111\u00fang."
    "session_store_unavailable" -> "Kh\u00f4ng th\u1ec3 l\u01b0u phi\u00ean \u0111\u0103ng nh\u1eadp an to\u00e0n tr\u00ean thi\u1ebft b\u1ecb."
    else -> "Kh\u00f4ng th\u1ec3 \u0111\u0103ng nh\u1eadp. H\u00e3y th\u1eed l\u1ea1i."
}
