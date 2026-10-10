package com.gvpcew.testing

import android.Manifest
import android.app.*
import android.bluetooth.BluetoothManager
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.widget.*
import java.util.Calendar

class MainActivity : Activity() {
    private lateinit var body: LinearLayout
    private lateinit var store: SettingsStorage
    private lateinit var scheduler: ReminderScheduler
    private var screen = "home"
    private var logView: TextView? = null
    private val ink = Color.rgb(25, 39, 58)
    private val teal = Color.rgb(0, 105, 92)
    private fun surface(color: Int, radius: Int = 18) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
    }
    private val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == "log") runOnUiThread { logView?.text = store.prefs.getString("log", "No tests yet") }
    }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        store = SettingsStorage(this)
        scheduler = ReminderScheduler(this)
        NotificationService(this)
        store.prefs.registerOnSharedPreferenceChangeListener(listener)
        screen = state?.getString("screen") ?: intent.getStringExtra("screen") ?: "home"
        render()
    }
    override fun onSaveInstanceState(outState: Bundle) { outState.putString("screen", screen); super.onSaveInstanceState(outState) }
    override fun onDestroy() { store.prefs.unregisterOnSharedPreferenceChangeListener(listener); super.onDestroy() }
    override fun onResume() { super.onResume(); if (::body.isInitialized && screen == "diagnostics") render() }
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
    private fun text(value: String, size: Float = 16f): TextView = TextView(this).apply {
        text = value; textSize = size; setTextColor(Color.rgb(24, 40, 65)); setPadding(0, dp(6), 0, dp(6))
        body.addView(this)
    }
    private fun button(label: String, action: () -> Unit) {
        body.addView(Button(this).apply {
            text = label; isAllCaps = false; textSize = 15f; gravity = Gravity.CENTER
            setTextColor(teal); background = surface(Color.rgb(227, 241, 237), 12)
            minHeight = dp(52); setPadding(dp(16), dp(10), dp(16), dp(10))
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(5); bottomMargin = dp(7) }
            setOnClickListener {
            try { action() } catch (e: Exception) { store.log("Error: ${e.message}"); Toast.makeText(this@MainActivity, e.message, Toast.LENGTH_LONG).show() }
        } })
    }
    private fun go(page: String) {
        if (page == "face") { startActivity(Intent(this, FaceCameraActivity::class.java)); return }
        screen = page; render()
    }
    private fun card(title: String, description: String, status: String, page: String) {
        val outer = body
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(14), dp(18), dp(14))
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(20).toFloat() }
        }
        outer.addView(panel, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })
        body = panel
        text(title, 20f).setTypeface(null, Typeface.BOLD)
        text(description, 14f).setTextColor(Color.rgb(91, 105, 119))
        text(status, 13f).setTextColor(Color.rgb(30, 115, 100))
        button("Open ${title.substringAfter("  ")}  →") { go(page) }
        body = outer
    }
    private fun render() {
        logView = null
        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(20), dp(20), dp(20)) }
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.rgb(245, 247, 246)); addView(body); isFillViewport = true }
        setContentView(scroll)
        scroll.setOnApplyWindowInsetsListener { v, insets ->
            v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom); insets
        }
        text("TEST MODE: ON", 12f).apply { setTypeface(null, Typeface.BOLD); setTextColor(Color.rgb(25, 115, 100)) }
        if (screen == "home") button("Back to student dashboard") { finish() }
        if (screen != "home") button("‹ Dashboard") { go("home") }
        when (screen) {
            "home" -> {
                text("GVPCEW", 32f).setTypeface(null, Typeface.BOLD)
                text("Attendance, made simpler.", 17f)
                text(java.text.SimpleDateFormat("EEEE, d MMMM", java.util.Locale.getDefault()).format(java.util.Date()), 13f)
                val outer = body
                val hero = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(20), dp(22), dp(20))
                    background = surface(ink, 24)
                }
                body.addView(hero, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16); bottomMargin = dp(20) })
                body = hero
                text("YOUR CLASSROOM WORKSPACE", 11f).setTextColor(Color.rgb(148, 215, 199))
                text("Ready for attendance?", 25f).apply { setTextColor(Color.WHITE); setTypeface(null, Typeface.BOLD) }
                text("Manage access, discover nearby students and try face capture.", 15f).setTextColor(Color.rgb(209, 222, 229))
                button("Start Bluetooth session  →") { startActivity(Intent(this, BluetoothActivity::class.java)) }
                body = outer
                text("${store.prefs.getStringSet("approved_students", emptySet())!!.size} approved locally   •   ${store.prefs.getStringSet("attendance", emptySet())!!.size} test records", 14f)
                text("Attendance tools", 21f).setTypeface(null, Typeface.BOLD)
                card("Student access", "Review the student list and grant or revoke local test access.", "Coordinator workspace · local test", "access")
                card("Face detection", "Check the front camera with live positioning guidance.", "On-device detection · no identity matching", "face")
                card("Bluetooth attendance", "Discover student IDs nearby and review test records.", "Two phones required", "bluetooth")
                text("Stay on schedule", 21f).setTypeface(null, Typeface.BOLD)
                button("Notifications  ·  ${if (store.enabled("notifications")) "On" else "Off"}") { go("notification") }
                button("Alarms  ·  ${if (store.enabled("alarms")) "On" else "Off"}") { go("alarm") }
                button("Try a combined reminder") { go("reminder") }
                button("Permissions & device diagnostics") { go("diagnostics") }
            }
            "access" -> {
                text("Student access", 28f).setTypeface(null, Typeface.BOLD)
                text("Coordinator test workspace", 14f).setTextColor(teal)
                text("Approvals are stored on this phone. They are not sent over Bluetooth and do not authorize another device.")
                val student = EditText(this).apply { hint = "Student ID, e.g. 23CSE001"; isSingleLine = true; inputType = 4097 }
                body.addView(student)
                button("Grant local test access") {
                    val id = BleProtocol.normalize(student.text.toString())
                    require(BleProtocol.isValid(id)) { "Use 1–10 letters, digits, underscores or hyphens" }
                    val ids = store.prefs.getStringSet("approved_students", emptySet())!!.toMutableSet()
                    ids.add(id); store.prefs.edit().putStringSet("approved_students", ids).apply(); render()
                }
                val ids = store.prefs.getStringSet("approved_students", emptySet())!!.sorted()
                text("Approved students · ${ids.size}", 20f)
                if (ids.isEmpty()) text("No students approved yet. Add a student ID to begin.")
                ids.forEach { id -> button("$id   ·   Revoke access") {
                    AlertDialog.Builder(this).setTitle("Revoke access for $id?")
                        .setNegativeButton("Keep access", null).setPositiveButton("Revoke") { _, _ ->
                            val updated = store.prefs.getStringSet("approved_students", emptySet())!!.toMutableSet()
                            updated.remove(id); store.prefs.edit().putStringSet("approved_students", updated).apply(); render()
                        }.show()
                } }
            }
            "face" -> {
                text("Face capture", 28f).setTypeface(null, Typeface.BOLD)
                text("CAMERA TEST", 12f).setTextColor(teal)
                text("Position your face in the centre, use even lighting and keep the camera at eye level.")
                text("Live face detection checks positioning. Face matching and attendance confirmation require the college service.", 14f)
                button("Open camera") {
                    startActivity(Intent(this, FaceCameraActivity::class.java))
                }
                text("Camera frames are processed in memory. No photo is saved or uploaded.", 13f)
            }
            "reminder" -> {
                text("Reminder Test", 28f)
                toggle("Notifications", "notifications")
                toggle("Alarms", "alarms")
                text("Settings apply when a test fires. Both OFF means no reminder. Alarm playback includes Android’s required service indicator.")
                button("Test Notification") { now("notification") }
                button("Test Alarm") { now("alarm") }
                button("Test Reminder After 10 Seconds") { schedule("reminder", System.currentTimeMillis() + 10000) }
                button("Cancel Scheduled Reminders") { scheduler.cancel("reminder") }
                button("Stop Ringing Alarm") { stopService(Intent(this, AlarmService::class.java)) }
                permissions(); logs()
            }
            "notification", "alarm" -> {
                val kind = screen
                text(if (kind == "alarm") "Alarm Testing" else "Notification Testing", 28f)
                toggle(if (kind == "alarm") "Alarms" else "Notifications", if (kind == "alarm") "alarms" else "notifications")
                permissions()
                text("Quick Tests", 21f)
                button("Test Now") { now(kind) }
                button("Test After 10 Seconds") { schedule(kind, System.currentTimeMillis() + 10000) }
                button("Test After 1 Minute") { schedule(kind, System.currentTimeMillis() + 60000) }
                text("Schedule a Test", 21f)
                val title = EditText(this).apply { hint = "Title"; setText("Attendance Reminder") }; body.addView(title)
                val message = EditText(this).apply { hint = "Message"; setText("Your DBMS attendance session starts soon.") }; body.addView(message)
                var selected = System.currentTimeMillis() + 60000
                val date = text(java.util.Date(selected).toString())
                button("Select Date & Time") {
                    val c = Calendar.getInstance()
                    DatePickerDialog(this, { _, year, month, day ->
                        TimePickerDialog(this, { _, hour, minute ->
                            c.set(year, month, day, hour, minute, 0); c.set(Calendar.MILLISECOND, 0)
                            selected = c.timeInMillis; date.text = c.time.toString()
                        }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
                    }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                }
                button("Schedule ${kind.replaceFirstChar { it.uppercase() }}") { scheduler.schedule(kind, selected, title.text.toString(), message.text.toString()) }
                button("Cancel All Scheduled $kind Tests") { scheduler.cancel(kind) }
                if (kind == "alarm") button("Stop Ringing Alarm") { stopService(Intent(this, AlarmService::class.java)) }
                logs()
            }
            "bluetooth" -> {
                text("Bluetooth Attendance Test", 28f)
                text("Use two phones: one advertises a student ID and the other scans. Keep both screens on. Detection tests nearby presence, not authenticated attendance.")
                button("Scan Bluetooth / Detect Students") { startActivity(Intent(this, BluetoothActivity::class.java)) }
                button("Enable Bluetooth / Connection Settings") { startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
                text("Connect: reserved for a future GATT implementation. The current prototype detects advertised student IDs without connecting.")
                text("Mark attendance: frontend simulation")
                val student = EditText(this).apply { hint = "Detected student ID" }; body.addView(student)
                button("Mark Test Attendance") {
                    val id = student.text.toString().trim()
                    require(id.matches(Regex("[A-Za-z0-9_-]{1,32}"))) { "Enter a valid test student ID" }
                    val ids = store.prefs.getStringSet("attendance", emptySet())!!.toMutableSet()
                    ids.add(id); store.prefs.edit().putStringSet("attendance", ids).apply()
                    store.log("SIMULATED attendance marked: $id"); go("bluetooth")
                }
                text("Test attendance: " + store.prefs.getStringSet("attendance", emptySet())!!.sorted().joinToString().ifEmpty { "None" })
                button("Clear Test Attendance") { store.prefs.edit().remove("attendance").apply(); render() }
                logs()
            }
            "diagnostics" -> {
                text("Permissions & Diagnostics", 28f)
                text("Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n${Build.MANUFACTURER} ${Build.MODEL}\nApp version 1.0")
                permissions()
                text("Notification channel importance: ${getSystemService(NotificationManager::class.java).getNotificationChannel("reminders").importance}\nPending notifications: ${scheduler.count("notification")}\nPending alarms: ${scheduler.count("alarm")}\nPending combined reminders: ${scheduler.count("reminder")}")
                val allowed = Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
                val adapter = getSystemService(BluetoothManager::class.java)?.adapter
                text("Bluetooth: " + if (!allowed) "Requires permission" else if (adapter == null) "Unsupported" else if (adapter.isEnabled) "ON" else "OFF")
                button("Refresh Status") { render() }; logs()
            }
        }
    }
    private fun toggle(label: String, key: String) {
        body.addView(Switch(this).apply {
            text = label; textSize = 20f; isChecked = store.enabled(key)
            setOnCheckedChangeListener { _, checked ->
                store.enable(key, checked); store.log("$label ${if (checked) "ON" else "OFF"}")
                if (key == "alarms" && !checked) stopService(Intent(this@MainActivity, AlarmService::class.java))
            }
        })
    }
    private fun permissions() {
        text("Notifications: ${if (NotificationService(this).available()) "Available" else "Permission/channel disabled"}\nExact alarms: ${if (scheduler.available()) "Available" else "Permission required"}")
        button("Request Notification Permission") {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 10)
            else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        button("Check Alarm Permission") {
            if (Build.VERSION.SDK_INT >= 31) startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            else Toast.makeText(this, "Exact alarms available", Toast.LENGTH_SHORT).show()
        }
    }
    private fun now(kind: String) {
        if (!store.enabled(if (kind == "alarm") "alarms" else "notifications")) { store.log("$kind test skipped: switch OFF"); return }
        if (kind == "alarm") startForegroundService(Intent(this, AlarmService::class.java).putExtra("title", "Test alarm"))
        else NotificationService(this).send(0, "GVPCEW Testing", "Immediate notification test")
    }
    private fun schedule(kind: String, time: Long) { scheduler.schedule(kind, time, "Attendance Reminder", "Your DBMS attendance session starts soon.") }
    private fun logs() { text("Test Log", 21f); logView = text(store.prefs.getString("log", "No tests yet") ?: "", 13f); logView?.setTextIsSelectable(true) }
    @Deprecated("Platform back navigation")
    override fun onBackPressed() {
        if (screen != "home") go("home") else super.onBackPressed()
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        store.log("Notification permission: ${if (NotificationService(this).available()) "granted" else "denied"}"); render()
    }
}
