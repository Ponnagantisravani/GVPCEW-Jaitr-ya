package com.gvpcew.testing

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModelProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

class AttendanceActivity : ComponentActivity() {
    private lateinit var model: StudentReviewModel
    private lateinit var input: TextInputEditText
    private lateinit var field: TextInputLayout
    private lateinit var status: TextView
    private lateinit var choose: MaterialButton
    private lateinit var submit: MaterialButton
    private lateinit var retry: MaterialButton
    private lateinit var decision: MaterialButton
    private lateinit var discard: MaterialButton
    private var address = ""
    private var coordinatorName = ""
    private var cameraOpen = false
    private var permissionAction = ""
    private fun required(): Array<String> = ReviewBluetooth.permissions() + Manifest.permission.CAMERA
    private fun allowed(): Boolean = required().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val action = permissionAction; permissionAction = ""
        if (allowed()) {
            if (action == "submit") startSubmission() else selectCoordinator()
        } else status.text = "Camera and Nearby devices access are required. Allow them in App permissions."
    }
    private val camera = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        cameraOpen = false
        model.captured(if (it.resultCode == RESULT_OK && it.data?.getBooleanExtra("face_detected", false) == true) it.data?.getStringExtra("photo_path") else null)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = ViewModelProvider(this)[StudentReviewModel::class.java]
        val prefs = getSharedPreferences("student_review_device", 0)
        address = savedInstanceState?.getString("address") ?: prefs.getString("address", "").orEmpty()
        coordinatorName = savedInstanceState?.getString("name") ?: prefs.getString("name", "").orEmpty()
        cameraOpen = savedInstanceState?.getBoolean("cameraOpen") ?: false
        permissionAction = savedInstanceState?.getString("permissionAction").orEmpty()
        val ui = AttendanceUi
        val body = ui.page(this, "Submit attendance", "Send your face photo. Attendance is marked after your coordinator accepts it.")
        ui.button(body, "Pair phones / Bluetooth settings", false) { startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
        ui.button(body, "App permissions", false) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
        choose = ui.button(body, coordinatorLabel(), false) {
            if (!allowed()) { permissionAction = "choose"; permissions.launch(required()) }
            else selectCoordinator()
        }
        field = TextInputLayout(this).apply { hint = "Student ID"; boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE }
        input = TextInputEditText(field.context).apply {
            setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_DONE
            setText(savedInstanceState?.getString("id") ?: prefs.getString("id", ""))
        }
        field.addView(input); body.addView(field)
        submit = ui.button(body, "Capture & submit for approval") { startSubmission() }
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_DONE) { startSubmission(); true } else false
        }
        status = ui.text(body, "", 17f, ui.ink, true).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        retry = ui.button(body, "Retry sending photo") { model.retry() }
        decision = ui.button(body, "Check coordinator decision", false) { model.checkDecision() }
        discard = ui.button(body, "Discard unsent photo", false) {
            AlertDialog.Builder(this).setTitle("Discard local photo?")
                .setMessage("This removes the retry copy on this phone. Any submission already received by the coordinator remains in her review list.")
                .setPositiveButton("Discard") { _, _ -> model.discard() }.setNegativeButton("Cancel", null).show()
        }
        ui.text(body, "Select the coordinator's paired phone. Ask her to open class and keep her screen visible. Your photo is sent over Bluetooth for her review.", 14f, ui.muted)
        ui.button(body, "Coordinator: review attendance", false) { startActivity(Intent(this, CoordinatorActivity::class.java)) }
        model.screen.observe(this) { screen ->
            status.text = if (screen.busy) "Connecting / transferring over Bluetooth. Please wait..." else screen.message
            submit.isEnabled = !screen.busy && !screen.canRetry && !cameraOpen
            choose.isEnabled = !screen.busy && !screen.canRetry
            input.isEnabled = !screen.busy && !screen.canRetry
            retry.visibility = if (screen.canRetry) View.VISIBLE else View.GONE
            discard.visibility = retry.visibility
            retry.isEnabled = !screen.busy; discard.isEnabled = !screen.busy
            decision.visibility = if (screen.canCheck) View.VISIBLE else View.GONE
            decision.isEnabled = !screen.busy
            screen.launch?.let { ticket ->
                model.consumeCameraLaunch()
                if (!cameraOpen) {
                    cameraOpen = true
                    camera.launch(Intent(this, FaceCameraActivity::class.java).putExtra("attendance_flow", true).putExtra("deadline", ticket.deadline))
                }
            }
        }
    }
    private fun coordinatorLabel() = if (address.isEmpty()) "Choose paired coordinator" else "Coordinator: $coordinatorName"
    @SuppressLint("MissingPermission")
    private fun selectCoordinator() {
        try {
            val devices = ReviewBluetooth.adapter(this).bondedDevices.sortedBy { it.name ?: it.address }
            if (devices.isEmpty()) {
                status.text = "No paired phones. Open Bluetooth settings on both phones and pair them first."
                return
            }
            AlertDialog.Builder(this).setTitle("Choose the coordinator's phone")
                .setItems(devices.map { "${it.name ?: "Phone"} (${it.address})" }.toTypedArray()) { _, which ->
                    val device = devices[which]; address = device.address; coordinatorName = device.name ?: device.address
                    getSharedPreferences("student_review_device", 0).edit().putString("address", address).putString("name", coordinatorName).apply()
                    choose.text = coordinatorLabel()
                    status.text = "Coordinator selected. Enter your ID and capture your face."
                }.show()
        } catch (e: Exception) { status.text = e.message ?: "Bluetooth unavailable. Check permissions and settings." }
    }
    private fun startSubmission() {
        if (cameraOpen || model.screen.value?.busy == true) return
        field.error = StudentId.error(input.text.toString())
        if (field.error != null) return
        if (!allowed()) { permissionAction = "submit"; permissions.launch(required()); return }
        if (address.isEmpty()) { selectCoordinator(); return }
        val id = StudentId.normalize(input.text.toString())
        getSharedPreferences("student_review_device", 0).edit().putString("id", id).apply()
        model.join(id, address)
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("id", input.text.toString()); outState.putString("address", address)
        outState.putString("name", coordinatorName); outState.putString("permissionAction", permissionAction)
        outState.putBoolean("cameraOpen", cameraOpen)
        super.onSaveInstanceState(outState)
    }
}

