package com.databreeze.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

@Composable
fun DataBreezeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF344EF8),
            onPrimary = Color.White,
            background = Color(0xFFFFFFFF),
            surface = Color(0xFFF7F8FC),
            onSurface = Color(0xFF171B2A),
        ),
        content = content,
    )
}
