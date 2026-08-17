package com.databreeze.android.receipts

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy

data class CaptureQuality(val blurLikely: Boolean, val glareLikely: Boolean, val focusLikely: Boolean) {
    val warning: String? = when {
        blurLikely -> "blur_likely"
        glareLikely -> "glare_likely"
        focusLikely -> "focus_likely"
        else -> null
    }
}

/** Bounded on-device hint only; it never replaces server extraction/acceptance. */
class CaptureQualityAnalyzer(private val onQuality: (CaptureQuality) -> Unit) : ImageAnalysis.Analyzer {
    override fun analyze(image: ImageProxy) {
        try {
            val plane = image.planes.firstOrNull()?.buffer ?: return
            val bytes = ByteArray(minOf(plane.remaining(), 16_384))
            plane.get(bytes)
            if (bytes.isEmpty()) return
            var sum = 0.0; var sumSq = 0.0; var bright = 0
            bytes.forEach { raw -> val v = raw.toInt() and 0xff; sum += v; sumSq += v * v; if (v >= 245) bright++ }
            val mean = sum / bytes.size
            val variance = (sumSq / bytes.size) - mean * mean
            onQuality(CaptureQuality(blurLikely = variance < 120.0, glareLikely = bright.toDouble() / bytes.size > 0.18, focusLikely = mean < 35.0))
        } finally { image.close() }
    }
}
