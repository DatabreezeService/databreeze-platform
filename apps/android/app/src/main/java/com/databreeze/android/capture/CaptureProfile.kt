package com.databreeze.android.capture

enum class CaptureProfile {
    RECEIPT_V1,
    INVOICE_V1,
    TABLE_V1,
    ;

    fun label(localeTag: String): String =
        when (this) {
            RECEIPT_V1 -> if (localeTag.startsWith("vi")) "Hóa đơn bán lẻ" else "Receipt"
            INVOICE_V1 -> if (localeTag.startsWith("vi")) "Hóa đơn GTGT" else "Invoice"
            TABLE_V1 -> if (localeTag.startsWith("vi")) "Bảng" else "Table"
        }
}
