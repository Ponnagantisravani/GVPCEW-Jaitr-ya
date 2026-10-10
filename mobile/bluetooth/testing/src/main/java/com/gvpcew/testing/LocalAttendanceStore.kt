package com.gvpcew.testing

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/** Local review records, never server-confirmed identity or attendance receipts. */
class LocalAttendanceStore(private val context: Context) {
    fun todaySummary(id: String): String {
        val saved = context.getSharedPreferences("local_attendance", Context.MODE_PRIVATE)
            .contains("${LocalDate.now()}:$id")
        return if (saved) "Attendance saved today for $id on this phone. Pending coordinator verification." else ""
    }
    fun record(id: String, path: String): Boolean {
        val photo = File(path)
        val directory = File(context.filesDir, "attendance_photos")
        if (!StudentId.valid(id) || photo.parentFile?.canonicalFile != directory.canonicalFile || !photo.isFile || photo.length() == 0L) return false
        val prefs = context.getSharedPreferences("local_attendance", Context.MODE_PRIVATE)
        val key = "${LocalDate.now()}:$id"
        val previous = prefs.getString(key, null)?.let { JSONObject(it).optString("photo") }
        val data = JSONObject().put("studentId", id).put("photo", path)
            .put("recordedAt", System.currentTimeMillis()).put("status", "pending_verification")
        val saved = prefs.edit().putString(key, data.toString()).commit()
        if (saved && previous != null && previous != path) {
            val old = File(previous)
            if (old.parentFile?.canonicalFile == directory.canonicalFile) old.delete()
        }
        if (!saved) photo.delete()
        return saved
    }
}
