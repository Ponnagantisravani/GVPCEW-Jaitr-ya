package com.gvpcew.testing
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
class DashboardActivity : ComponentActivity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val body = AttendanceUi.page(this, "GVPCEW attendance", "Attendance, class reminders and college notifications")
        AttendanceUi.button(body, "Automatic face attendance") { startActivity(Intent(this, AutomaticAttendanceActivity::class.java)) }
        AttendanceUi.button(body, "College account & reminders") { startActivity(Intent(this, PortalActivity::class.java)) }
        AttendanceUi.button(body, "Coordinator photo review", false) { startActivity(Intent(this, AttendanceActivity::class.java)) }
        AttendanceUi.button(body, "Alarm settings & diagnostics", false) { startActivity(Intent(this, MainActivity::class.java)) }
        ReminderScheduler(this).restore()
    }
}
