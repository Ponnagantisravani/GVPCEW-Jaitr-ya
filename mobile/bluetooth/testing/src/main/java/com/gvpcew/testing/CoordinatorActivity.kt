package com.gvpcew.testing

import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModelProvider
import com.google.android.material.button.MaterialButton
import java.io.File
import java.text.DateFormat
import java.util.Date

class CoordinatorActivity : ComponentActivity() {
    private lateinit var model: CoordinatorReviewModel
    private lateinit var status: TextView
    private lateinit var count: TextView
    private lateinit var toggle: MaterialButton
    private lateinit var reviews: LinearLayout
    private lateinit var previousPage: MaterialButton
    private lateinit var nextPage: MaterialButton
    private var reviewPage = 0
    private var lastRecords: List<ReviewRecord>? = null
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (ReviewBluetooth.permissions().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) model.open()
        else status.text = "Allow Nearby devices in app permissions to receive submissions."
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = ViewModelProvider(this)[CoordinatorReviewModel::class.java]
        val ui = AttendanceUi
        val body = ui.page(this, "Coordinator review", "Accept each student's face photo to mark attendance.", { finish() })
        ui.button(body, "Pair student phones / Bluetooth settings", false) { startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
        ui.button(body, "App permissions", false) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
        status = ui.text(body, "Loading...", 17f, ui.ink, true)
        toggle = ui.button(body, "Open class") {
            if (model.screen.value?.accepting == true) model.closeSubmissions()
            else if (ReviewBluetooth.permissions().any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }) permissions.launch(ReviewBluetooth.permissions())
            else model.open()
        }
        ui.button(body, "Start a new class", false) {
            AlertDialog.Builder(this).setTitle("Start a new class?")
                .setMessage("Current submissions will close. Existing photos and decisions will remain in your review list.")
                .setPositiveButton("New class") { _, _ -> model.newClass() }.setNegativeButton("Cancel", null).show()
        }
        ui.text(body, "Pair each student phone once. Keep this screen visible during transfers and status checks. Only you can accept or reject here.", 14f, ui.muted)
        count = ui.text(body, "", 18f, ui.teal, true)
        reviewPage = savedInstanceState?.getInt("reviewPage") ?: 0
        previousPage = ui.button(body, "Previous reviews", false) { reviewPage--; render(lastRecords.orEmpty()) }
        nextPage = ui.button(body, "More reviews", false) { reviewPage++; render(lastRecords.orEmpty()) }
        reviews = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; body.addView(reviews)
        model.screen.observe(this) { screen ->
            status.text = screen.message
            toggle.text = if (screen.accepting) "Close submissions" else "Open class"
            if (screen.listening) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            val current = screen.records.filter { it.classId == screen.classId }
            count.text = "Current class: ${current.count { it.status == ReviewStatus.PENDING }} pending / ${current.count { it.status == ReviewStatus.ACCEPTED }} marked / ${current.count { it.status == ReviewStatus.REJECTED }} rejected"
            if (lastRecords != screen.records) { lastRecords = screen.records; render(screen.records) }
        }
    }
    private fun render(records: List<ReviewRecord>) {
        reviews.removeAllViews()
        reviewPage = reviewPage.coerceIn(0, maxOf(0, (records.size - 1) / 20))
        previousPage.isEnabled = reviewPage > 0
        nextPage.isEnabled = (reviewPage + 1) * 20 < records.size
        if (records.isEmpty()) { AttendanceUi.text(reviews, "Student IDs and face photos will appear here after submission."); return }
        val visible = records.sortedWith(compareBy<ReviewRecord> { it.status != ReviewStatus.PENDING }.thenByDescending { it.submittedAt }).drop(reviewPage * 20).take(20)
        for (record in visible) {
            val card = AttendanceUi.card(reviews)
            AttendanceUi.text(card, record.studentId, 22f, AttendanceUi.ink, true)
            AttendanceUi.text(card, "Class ${record.classId.take(8)} / ${DateFormat.getDateTimeInstance().format(Date(record.submittedAt))}", 12f)
            val image = ImageView(this).apply {
                contentDescription = "Submitted face for ${record.studentId}"
                scaleType = ImageView.ScaleType.FIT_CENTER
                val options = BitmapFactory.Options().apply { inSampleSize = 2 }
                setImageBitmap(BitmapFactory.decodeFile(File(filesDir, "coordinator_reviews/${record.requestId}.jpg").path, options))
            }
            card.addView(image, LinearLayout.LayoutParams(-1, AttendanceUi.dp(this, 220)))
            AttendanceUi.text(card, record.status.label, 17f,
                if (record.status == ReviewStatus.ACCEPTED) AttendanceUi.teal else AttendanceUi.ink, true)
            if (record.status == ReviewStatus.PENDING) {
                AttendanceUi.button(card, "Accept - Mark attendance") {
                    AlertDialog.Builder(this).setTitle("Mark attendance for ${record.studentId}?")
                        .setMessage("Confirm that this face belongs to this student.")
                        .setPositiveButton("Accept") { _, _ -> model.decide(record.requestId, true) }.setNegativeButton("Cancel", null).show()
                }
                AttendanceUi.button(card, "Reject", false) { model.decide(record.requestId, false) }
            }
        }
        AttendanceUi.text(reviews, "Page ${reviewPage + 1} of ${(records.size + 19) / 20}. ${records.size} saved submissions, pending first.", 13f)
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt("reviewPage", reviewPage)
        super.onSaveInstanceState(outState)
    }
    override fun onStop() {
        if (!isChangingConfigurations) model.pause()
        super.onStop()
    }
}

