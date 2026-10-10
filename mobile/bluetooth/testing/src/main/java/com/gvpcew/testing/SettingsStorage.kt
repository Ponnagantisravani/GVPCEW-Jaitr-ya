package com.gvpcew.testing

import android.content.Context
import java.text.DateFormat
import java.util.Date

class SettingsStorage(context: Context) {
    val prefs = context.getSharedPreferences("testing", Context.MODE_PRIVATE)
    fun enabled(key: String) = prefs.getBoolean(key, true)
    fun enable(key: String, value: Boolean) { prefs.edit().putBoolean(key, value).apply() }
    fun log(message: String) {
        val line = "${DateFormat.getTimeInstance().format(Date())}  $message"
        prefs.edit().putString("log", (line + "\n" + prefs.getString("log", "")).take(12000)).apply()
    }
}
