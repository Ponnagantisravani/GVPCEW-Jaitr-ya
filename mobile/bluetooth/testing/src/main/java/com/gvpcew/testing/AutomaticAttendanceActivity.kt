package com.gvpcew.testing

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.SystemClock
import android.util.Base64
import android.view.WindowManager
import android.widget.EditText
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.concurrent.Executors

class AutomaticCaptureState : androidx.lifecycle.ViewModel() {
    var address = ""
    var challenge: JSONObject? = null
    var frames = JSONArray()
    var student = ""
    var deadline = 0L
    var sessionId = ""
    var submission: JSONObject? = null
}

class AutomaticAttendanceActivity : ComponentActivity() {
    private val captureState by lazy { androidx.lifecycle.ViewModelProvider(this)[AutomaticCaptureState::class.java] }
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private lateinit var roll: EditText
    private var address: String
        get() = captureState.address
        set(value) { captureState.address = value }
    private var challenge: JSONObject?
        get() = captureState.challenge
        set(value) { captureState.challenge = value }
    private var frames: JSONArray
        get() = captureState.frames
        set(value) { captureState.frames = value }
    private var student: String
        get() = captureState.student
        set(value) { captureState.student = value }
    private var deadline: Long
        get() = captureState.deadline
        set(value) { captureState.deadline = value }
    private var relay: PortalBluetoothServer? = null
    private var busy = false
    private var sessionId: String
        get() = captureState.sessionId
        set(value) { captureState.sessionId = value }
    private var submission: JSONObject?
        get() = captureState.submission
        set(value) { captureState.submission = value }
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        status.text = "Permissions updated. Choose your action again."
    }
    private val camera = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val path = result.data?.getStringExtra("photo_path")
        if (result.resultCode != RESULT_OK || path == null) { challenge = null; frames = JSONArray(); status.text = "Capture cancelled. Start a new capture." }
        else {
            work {
                val image = try { Base64.encodeToString(PortalPhoto.compress(path), Base64.NO_WRAP) } finally { File(path).delete() }
                val current = checkNotNull(challenge) { "Capture expired. Start again." }
                frames.put(JSONObject().put("action", current.getJSONArray("actions").getString(frames.length())).put("image", "data:image/jpeg;base64,$image"))
                runOnUiThread { if (!isDestroyed) { if (frames.length() < 4) captureNext() else sendCapture() } }
                "Face ${frames.length()} of 4 captured."
            }
        }
    }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val body = AttendanceUi.page(this, "Automatic face attendance", "The college server must verify your enrolled face and movement challenge before attendance is recorded.", { finish() })
        roll = EditText(this).apply { hint = "Student roll number"; setSingleLine(); body.addView(this) }
        status = AttendanceUi.text(body, "Students: pair with the coordinator's phone first. Coordinators: sign in and open a face attendance session in the portal.")
        AttendanceUi.button(body, "Pair phones", false) { startActivity(Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)) }
        AttendanceUi.button(body, "Choose coordinator phone", false) { choosePhone() }
        AttendanceUi.button(body, "Start automatic face capture") {
            if (busy) return@button
            if (!allowed()) return@button
            val id = roll.text.toString().trim().uppercase()
            if (!id.matches(Regex("[A-Z0-9_-]{1,32}"))) { status.text = "Enter your official roll number."; return@button }
            if (address.isEmpty()) { choosePhone(); return@button }
            student = id; frames = JSONArray(); submission = null
            work {
                val response = PortalWire.exchange(this, address, JSONObject().put("action", "challenge").put("rollNumber", student))
                challenge = response.getJSONObject("challenge")
                sessionId = response.getString("sessionId")
                deadline = SystemClock.elapsedRealtime() + minOf(85_000L, Instant.parse(challenge!!.getString("expires_at")).toEpochMilli() - System.currentTimeMillis())
                runOnUiThread { if (!isDestroyed) captureNext() }
                "Follow all four movement instructions."
            }
        }
        AttendanceUi.button(body, "Continue current capture", false) { if (!busy && challenge != null && frames.length() < 4) captureNext() else status.text = "Start a new capture or retry confirmation." }
        AttendanceUi.button(body, "Retry confirmation", false) { if (submission == null) status.text = "Complete a capture first." else sendCapture() }
        AttendanceUi.button(body, "College account sign in", false) { startActivity(Intent(this, PortalActivity::class.java)) }
        AttendanceUi.button(body, "Coordinator: connect an active class") { connectClass() }
        AttendanceUi.button(body, "Coordinator: stop Bluetooth relay", false) { closeRelay(); status.text = "Bluetooth relay stopped. Close the session in the portal when class ends." }
        AttendanceUi.text(body, "Keep the coordinator screen visible during attendance. Students need Bluetooth and camera; the coordinator needs an internet connection. A failed verification never marks attendance. Retry confirmation after a connection failure to recover the same receipt.", 14f)
    }
    private fun allowed(): Boolean {
        val required = ReviewBluetooth.permissions() + Manifest.permission.CAMERA
        if (required.any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }) { permissions.launch(required); return false }
        return true
    }
    @SuppressLint("MissingPermission") private fun choosePhone() {
        if (busy || !allowed()) return
        try {
            val phones = ReviewBluetooth.adapter(this).bondedDevices.toList()
            if (phones.isEmpty()) { status.text = "Pair with the coordinator in Bluetooth settings first."; return }
            AlertDialog.Builder(this).setTitle("Coordinator phone").setItems(phones.map { it.name ?: it.address }.toTypedArray()) { _, i ->
                address = phones[i].address; status.text = "Selected ${phones[i].name ?: address}"; submission = null; challenge = null
            }.show()
        } catch (e: Exception) { status.text = e.message }
    }
    private fun captureNext() {
        if (SystemClock.elapsedRealtime() >= deadline) { status.text = "Challenge expired. Start again."; challenge = null; return }
        val current = challenge ?: return
        camera.launch(Intent(this, FaceCameraActivity::class.java).putExtra("attendance_flow", true)
            .putExtra("target_action", current.getJSONArray("actions").getString(frames.length())).putExtra("deadline", deadline))
    }
    private fun sendCapture() {
        // Callback may arrive before the compression task posts its completion.
        if (busy) { window.decorView.postDelayed({ if (!isDestroyed) sendCapture() }, 100); return }
        if (submission == null) {
            val current = challenge ?: return
            submission = JSONObject().put("action", "submit").put("sessionId", sessionId).put("rollNumber", student)
                .put("challengeId", current.getString("id")).put("frames", frames)
        }
        work {
            val result = PortalWire.exchange(this, address, checkNotNull(submission))
            val receipt = result.getString("receiptId")
            submission = null; challenge = null; frames = JSONArray()
            "Attendance confirmed for ${result.getString("rollNumber")}. Receipt: $receipt"
        }
    }
    private fun connectClass() {
        if (busy || !allowed()) return
        work {
            val api = PortalAccount(this).api() ?: error("Sign in with your faculty or student coordinator account first.")
            val capability = api.call("GET", "/bluetooth-attendance/capabilities")
            check(capability.optBoolean("ready")) { capability.optString("message") }
            val all = api.call("GET", "/attendance-sessions/active").getJSONArray("sessions")
            val rows = (0 until all.length()).map { all.getJSONObject(it) }.filter { it.optString("verification_mode") == "face_bluetooth" }
            check(rows.isNotEmpty()) { "Open a Face + Bluetooth session from the college portal first." }
            runOnUiThread {
                if (!isDestroyed) AlertDialog.Builder(this).setTitle("Choose active class")
                    .setItems(rows.map { it.getString("subject") + " · " + it.getString("section") }.toTypedArray()) { _, i ->
                        try {
                            closeRelay()
                            val selected = rows[i].getString("id")
                            relay = PortalBluetoothServer(this, { request, device ->
                                val action = request.getString("action")
                                require(action == "challenge" || action == "submit") { "Unsupported attendance request." }
                                if (action == "submit") require(request.getString("sessionId") == selected) { "Class changed. Capture again." }
                                request.put("sessionId", selected).put("deviceAddress", device)
                                api.call("POST", "/bluetooth-attendance/$action", request).put("sessionId", selected)
                            }, { message -> runOnUiThread { if (!isDestroyed) { closeRelay(); status.text = message } } })
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            status.text = "Connected to ${rows[i].getString("subject")}. Keep this screen open for student captures."
                        } catch (e: Exception) { status.text = e.message }
                    }.show()
            }
            "Choose the class to receive captures."
        }
    }
    private fun work(action: () -> String) {
        if (busy) return
        busy = true; status.text = "Please wait..."
        worker.execute {
            val message = try { action() } catch (e: Exception) { e.message ?: "Could not confirm attendance. Retry." }
            runOnUiThread { if (!isDestroyed) { busy = false; status.text = message } }
        }
    }
    private fun closeRelay() { relay?.close(); relay = null; window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    override fun onStop() { closeRelay(); super.onStop() }
    override fun onDestroy() { closeRelay(); worker.shutdownNow(); super.onDestroy() }
}
