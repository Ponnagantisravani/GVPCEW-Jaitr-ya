package com.gvpcew.testing

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import com.google.android.material.button.MaterialButton

class FaceCameraActivity : ComponentActivity() {
    private var session: FaceCameraSession? = null
    private lateinit var preview: PreviewView
    private lateinit var guide: FaceGuideView
    private lateinit var status: TextView
    private lateinit var retry: MaterialButton
    private lateinit var settings: MaterialButton
    private val handler = Handler(Looper.getMainLooper())
    private var lastFeedback = 0L
    private var completed = false
    private var capturing = false
    private var pendingPhoto: java.io.File? = null
    private var resumed = false
    private var permissionPending = false
    private var permissionAttempted = false
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionPending = false
        if (granted && resumed) openCamera()
        else if (!granted) showError("Camera permission is required to check your face. Allow access to continue.")
    }
    private val watchdog = object : Runnable {
        override fun run() {
            if (session == null || completed) return
            if (intent.getBooleanExtra("attendance_flow", false) &&
                SystemClock.elapsedRealtime() >= intent.getLongExtra("deadline", Long.MAX_VALUE)) {
                setResult(RESULT_CANCELED); finish(); return
            }
            if (SystemClock.elapsedRealtime() - lastFeedback > 12_000) {
                showError("The camera stopped responding. Close other camera apps, then try again.")
            } else handler.postDelayed(this, 2000)
        }
    }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        permissionAttempted = state?.getBoolean("permissionAttempted") ?: false
        val ui = AttendanceUi
        val subtitle = if (intent.hasExtra("target_action")) "Follow the movement instruction. Keep your face visible."
        else if (intent.getBooleanExtra("attendance_flow", false))
            "Coordinator connected - Capture sends for approval" else "Keep your face inside the oval. Detection runs automatically."
        val body = ui.page(this, "Position your face", subtitle, { finish() })
        val cameraFrame = FrameLayout(this)
        preview = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        guide = FaceGuideView(this)
        cameraFrame.addView(preview, FrameLayout.LayoutParams(-1, -1))
        cameraFrame.addView(guide, FrameLayout.LayoutParams(-1, -1))
        body.addView(cameraFrame, LinearLayout.LayoutParams(-1, ui.dp(this, 340)))
        status = ui.text(body, "Preparing camera…", 19f, ui.ink, true).apply {
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        ui.text(body, if (intent.hasExtra("target_action")) "Follow the instruction below the camera in even lighting. Only you should be visible." else "Look straight ahead in even lighting. Only you should be visible.", 14f, ui.muted)
        retry = ui.button(body, "Try again") { completed = false; requestCamera() }
        settings = ui.button(body, "Open app settings", false) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
        ui.text(body, if (intent.hasExtra("target_action")) "Your captures are sent to the college verifier through the coordinator's phone. Attendance is confirmed only after identity and liveness verification."
            else if (intent.getBooleanExtra("attendance_flow", false))
            "Your photo will be sent to the paired coordinator. Attendance is marked only after she accepts it. Keep your face in position until capture finishes."
            else "Face detection checks visibility, not identity. No photo is saved or uploaded.", 13f, ui.muted)
        retry.visibility = View.GONE; settings.visibility = View.GONE
    }
    override fun onResume() {
        super.onResume(); resumed = true
        if (!completed && !permissionPending) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) openCamera()
            else if (!permissionAttempted) requestCamera()
            else showError("Camera permission is required to check your face. Allow access to continue.")
        }
    }
    private fun requestCamera() {
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) openCamera()
        else if (!permissionPending) {
            permissionPending = true; permissionAttempted = true
            permission.launch(Manifest.permission.CAMERA)
        }
    }
    private fun openCamera() {
        if (!resumed || completed || session != null) return
        status.text = "Preparing camera…"; status.setTextColor(AttendanceUi.ink)
        retry.visibility = View.GONE; settings.visibility = View.GONE
        guide.ready = false
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        lastFeedback = SystemClock.elapsedRealtime()
        val camera = FaceCameraSession(this, preview, guide, { feedback, stable ->
            if (resumed && !completed) {
                lastFeedback = SystemClock.elapsedRealtime()
                val instruction = when (intent.getStringExtra("target_action")) { "turn_left" -> "Turn your head slightly left"; "turn_right" -> "Turn your head slightly right"; else -> "Look straight ahead" }
                if (!capturing) status.text = if (intent.hasExtra("target_action")) "$instruction — ${if (feedback == FaceFeedback.TURNED) "Hold the requested pose" else feedback.message}" else feedback.message
                guide.ready = feedback == FaceFeedback.READY
                status.setTextColor(if (guide.ready) AttendanceUi.teal else AttendanceUi.ink)
                if (stable && !capturing) completeDetection()
            }
        }, { message -> if (resumed && !completed) showError(message) })
        session = camera
        camera.targetAction = intent.getStringExtra("target_action") ?: "look_straight"
        camera.start(this)
        handler.postDelayed(watchdog, 2000)
    }
    private fun completeDetection() {
        if (intent.getBooleanExtra("attendance_flow", false)) {
            capturing = true
            status.text = "Capturing photo..."
            try {
                val folder = java.io.File(filesDir, "attendance_photos")
                if (!folder.isDirectory && !folder.mkdirs()) throw java.io.IOException("Cannot create photo folder")
                val photo = java.io.File.createTempFile("face_", ".jpg", folder)
                pendingPhoto = photo
                session?.capture(photo, {
                    if (resumed && SystemClock.elapsedRealtime() < intent.getLongExtra("deadline", Long.MAX_VALUE)) {
                        pendingPhoto = null; completed = true; closeCamera()
                        setResult(RESULT_OK, Intent().putExtra("face_detected", true).putExtra("photo_path", photo.absolutePath))
                        finish()
                    } else { photo.delete(); setResult(RESULT_CANCELED); finish() }
                }, { showError("Photo could not be saved. Please try again.") })
            } catch (_: Exception) { showError("Photo could not be saved. Please try again.") }
            return
        }
        completed = true; closeCamera()
        guide.ready = true; status.text = "Face detected"
        status.setTextColor(AttendanceUi.teal)
        status.text = "Face detected. Camera check complete."
        retry.text = "Check again"; retry.visibility = View.VISIBLE
    }
    private fun showError(message: String) {
        closeCamera(); guide.ready = false
        status.text = message; status.setTextColor(AttendanceUi.error)
        retry.visibility = View.VISIBLE
        settings.visibility = if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) View.VISIBLE else View.GONE
    }
    private fun closeCamera() {
        handler.removeCallbacks(watchdog)
        session?.close(); session = null
        pendingPhoto?.delete(); pendingPhoto = null; capturing = false
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    override fun onPause() { resumed = false; closeCamera(); super.onPause() }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("permissionAttempted", permissionAttempted)
        super.onSaveInstanceState(outState)
    }
    override fun onDestroy() { closeCamera(); super.onDestroy() }
}
