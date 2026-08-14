package com.databreeze.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.colorResource

@Composable
fun DataBreezeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = colorResource(com.databreeze.android.R.color.db_color_primary),
            onPrimary = colorResource(com.databreeze.android.R.color.db_color_on_primary),
            background = colorResource(com.databreeze.android.R.color.db_color_background),
            surface = colorResource(com.databreeze.android.R.color.db_color_surface),
            onSurface = colorResource(com.databreeze.android.R.color.db_color_text),
        ),
        content = content,
    )
}
