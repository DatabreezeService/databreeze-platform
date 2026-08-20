package com.databreeze.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

@Composable
fun DataBreezeTheme(content: @Composable () -> Unit) {
    val primary = colorResource(com.databreeze.android.R.color.db_color_primary)
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = primary,
            onPrimary = colorResource(com.databreeze.android.R.color.db_color_on_primary),
            background = colorResource(com.databreeze.android.R.color.db_color_background),
            surface = colorResource(com.databreeze.android.R.color.db_color_surface),
            onSurface = colorResource(com.databreeze.android.R.color.db_color_text),
            onSurfaceVariant = colorResource(com.databreeze.android.R.color.db_color_text_muted),
            outline = colorResource(com.databreeze.android.R.color.db_color_border),
            outlineVariant = colorResource(com.databreeze.android.R.color.db_color_surface_strong),
            primaryContainer = colorResource(com.databreeze.android.R.color.db_color_status_info_surface),
            onPrimaryContainer = colorResource(com.databreeze.android.R.color.db_color_status_info_text),
        ),
        typography = Typography().run {
            copy(
                headlineLarge = headlineLarge.copy(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.SemiBold),
                headlineSmall = headlineSmall.copy(fontSize = 23.sp, lineHeight = 29.sp, fontWeight = FontWeight.SemiBold),
                titleLarge = titleLarge.copy(fontSize = 21.sp, lineHeight = 27.sp, fontWeight = FontWeight.SemiBold),
                titleMedium = titleMedium.copy(fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold),
                bodyLarge = bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp),
                bodyMedium = bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp),
                labelLarge = labelLarge.copy(fontSize = 13.sp, fontWeight = FontWeight.SemiBold),
            )
        },
        content = content,
    )
}
