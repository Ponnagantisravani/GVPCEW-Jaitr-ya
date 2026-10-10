package com.gvpcew.testing

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.widget.EditText
import android.widget.TextView
import android.widget.Switch
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject
import java.util.concurrent.Executors

class PortalActivity : ComponentActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private var busy = false
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { render() }
    override fun onCreate(state: Bundle?) { super.onCreate(state); render() }
    private fun runWork(action: () -> String) {
        if (busy) return
        busy = true; status.text = "Connecting to college server..."
        worker.execute {
            val message = try { action() } catch (e: Exception) { e.message ?: "Connection failed. Retry." }
            runOnUiThread { if (!isDestroyed) { busy = false; render(); status.text = message } }
        }
    }
    private fun render() {
        val account = PortalAccount(this)
        val body = AttendanceUi.page(this, "College account & reminders", "Published timetable reminders and your college notifications", { finish() })
        status = AttendanceUi.text(body, getSharedPreferences("portal_delivery", 0).getString("status", "Sign in to sync your timetable and notifications.").orEmpty())
        val store = SettingsStorage(this)
        for ((key, label) in listOf("notifications" to "Show notifications", "alarms" to "Ring reminder alarms")) {
            body.addView(Switch(this).apply {
                text = label; isChecked = store.enabled(key)
                setOnCheckedChangeListener { _, checked ->
                    store.enable(key, checked)
                    if (key == "alarms" && !checked) stopService(Intent(this@PortalActivity, AlarmService::class.java))
                    if (account.user() != null) runWork { PortalSync.run(this@PortalActivity) }
                }
            })
        }
        AttendanceUi.button(body, "Allow notifications", false) {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
            else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        AttendanceUi.button(body, "Allow Alarms & reminders", false) {
            if (Build.VERSION.SDK_INT >= 31) startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            else status.text = "Exact alarms are available on this phone."
        }
        if (account.user() == null) {
            fun field(hintText: String, kind: Int): EditText = EditText(this).apply { hint = hintText; inputType = kind; setSingleLine(); body.addView(this) }
            val base = field("College HTTPS API URL (ending /api)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
            val email = field("College email", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
            val password = field("Password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
            val remember = android.widget.CheckBox(this).apply { text = "Keep me signed in on this phone for 30 days"; body.addView(this) }
            AttendanceUi.button(body, "Sign in & sync") {
                val address = base.text.toString().trim(); val mail = email.text.toString().trim(); val secret = password.text.toString(); val keep = remember.isChecked
                password.text.clear()
                runWork {
                    val result = PortalApi(address).call("POST", "/auth/login", JSONObject().put("email", mail).put("password", secret).put("rememberDevice", keep))
                    synchronized(PortalSync) { account.save(address, result); PortalSyncJob.schedule(this); PortalSync.run(this) }
                }
            }
        } else {
            AttendanceUi.text(body, "Signed in: ${account.user()?.optString("fullName")}")
            AttendanceUi.button(body, "Sync timetable & notifications") { runWork { PortalSync.run(this) } }
            AttendanceUi.button(body, "Show notifications", false) {
                runWork {
                    val rows = checkNotNull(account.api()).call("GET", "/notifications").getJSONArray("notifications")
                    runOnUiThread {
                        if (!isDestroyed) android.app.AlertDialog.Builder(this).setTitle("College notifications")
                            .setItems((0 until rows.length()).map { rows.getJSONObject(it).getString("title") }.toTypedArray()) { _, index ->
                                val row = rows.getJSONObject(index)
                                android.app.AlertDialog.Builder(this).setTitle(row.getString("title")).setMessage(row.getString("body"))
                                    .setPositiveButton("Mark read") { _, _ -> runWork { checkNotNull(account.api()).call("PATCH", "/notifications/${row.getString("id")}/read"); "Marked as read." } }
                                    .setNegativeButton("Close", null).show()
                            }.setNegativeButton("Close", null).show()
                    }
                    "${rows.length()} notifications loaded."
                }
            }
            AttendanceUi.button(body, "Sign out", false) {
                if (!busy) {
                    runWork { synchronized(PortalSync) { try { account.api()?.call("POST", "/auth/logout") } catch (error: PortalHttpException) { if (error.status != 401) throw error }; account.clear(); getSystemService(android.app.job.JobScheduler::class.java).cancel(4101)
                        stopService(Intent(this, AlarmService::class.java)) }; "Signed out. College reminders removed from this phone." }
                }
            }
        }
        AttendanceUi.button(body, "Schedule a personal alarm / test sound", false) { startActivity(Intent(this, MainActivity::class.java)) }
        AttendanceUi.text(body, "Allow both permissions, then sync. Upcoming class alarms are saved on your phone and restored after restart. Background updates depend on Android and connectivity; open this screen to sync immediately. Sign in again when your college session expires.", 14f)
    }
    override fun onResume() { super.onResume(); ReminderScheduler(this).restore() }
    override fun onDestroy() { worker.shutdownNow(); super.onDestroy() }
}
