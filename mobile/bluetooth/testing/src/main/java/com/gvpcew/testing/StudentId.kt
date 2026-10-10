package com.gvpcew.testing

import java.util.Locale

/** Kept compatible with the existing ten-byte BLE student payload. */
object StudentId {
    fun normalize(value: String) = value.trim().uppercase(Locale.ROOT)
    fun valid(value: String) = Regex("[A-Z0-9_-]{1,10}").matches(value)
    fun error(value: String): String? = when {
        value.isBlank() -> "Enter your student ID to continue."
        !valid(normalize(value)) -> "Use up to 10 letters, numbers, hyphens or underscores."
        else -> null
    }
}
