package com.gvpcew.testing

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

data class CaptureTicket(val deadline: Long)
data class StudentReviewScreen(val busy: Boolean = false, val message: String = "Choose the paired coordinator phone, then submit your face photo.",
    val canRetry: Boolean = false, val canCheck: Boolean = false, val launch: CaptureTicket? = null)

class StudentReviewModel(application: Application) : AndroidViewModel(application) {
    val screen = MutableLiveData(StudentReviewScreen())
    private val prefs = application.getSharedPreferences("student_review", 0)
    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var busy = false
    @Volatile private var cleared = false
    init { publish(savedMessage()) }
    private fun draft() = prefs.getString("draft", null)?.let(::JSONObject)
    private fun receipt() = prefs.getString("receipt", null)?.let(::JSONObject)
    private fun savedMessage(): String {
        if (draft()?.optString("photo").orEmpty().isNotEmpty()) return "Photo saved but delivery is unconfirmed. Retry sending to the coordinator."
        return receipt()?.let { "${it.getString("studentId")}: ${ReviewStatus.valueOf(it.getString("status")).label}" }
            ?: "Choose the paired coordinator phone, then submit your face photo."
    }
    private fun publish(message: String, ticket: CaptureTicket? = null) {
        screen.postValue(StudentReviewScreen(false, message, draft()?.optString("photo").orEmpty().isNotEmpty(), receipt() != null, ticket))
    }
    private fun task(action: () -> Unit) {
        if (busy || cleared) return
        busy = true
        screen.value = screen.value?.copy(busy = true, launch = null)
        worker.execute {
            try { action() } catch (e: Exception) { publish(e.message ?: "Could not send attendance. Please retry.") }
            finally { busy = false }
        }
    }
    fun consumeCameraLaunch() { screen.value = screen.value?.copy(launch = null) }
    fun join(studentId: String, address: String) = task {
        check(draft()?.optString("photo").orEmpty().isEmpty()) { "Retry or discard the unsent photo before capturing again." }
        check(StudentId.valid(studentId)) { "Enter a valid student ID." }
        val reply = ReviewBluetooth.exchange(getApplication(), address, ReviewRequest("JOIN"))
        UUID.fromString(reply.classId)
        val data = JSONObject().put("studentId", studentId).put("address", address)
            .put("classId", reply.classId).put("requestId", UUID.randomUUID().toString()).put("photo", "")
        check(prefs.edit().putString("draft", data.toString()).commit()) { "Could not save capture request." }
        publish("Coordinator connected. Capture your face for review.", CaptureTicket(SystemClock.elapsedRealtime() + 40_000))
    }
    fun captured(path: String?) = task {
        if (path == null) { publish("Capture cancelled. No new submission sent."); return@task }
        val file = File(path)
        require(file.parentFile?.canonicalFile == File(getApplication<Application>().filesDir, "attendance_photos").canonicalFile && file.isFile) { "Capture file not found. Try again." }
        val data = checkNotNull(draft()) { "Capture request expired. Try again." }.put("photo", path)
        check(prefs.edit().putString("draft", data.toString()).commit()) { "Could not save photo for sending." }
        send()
    }
    fun retry() = task { send() }
    private fun send() {
        val data = checkNotNull(draft()) { "No unsent photo." }
        val path = data.getString("photo")
        val bytes = smallPhoto(path)
        val reply = ReviewBluetooth.exchange(getApplication(), data.getString("address"), ReviewRequest("SUBMIT",
            data.getString("classId"), data.getString("requestId"), data.getString("studentId"), bytes))
        require(reply.requestId == data.getString("requestId") && reply.classId == data.getString("classId") &&
            reply.studentId == data.getString("studentId")) { "Coordinator reply did not match your submission. Retry." }
        ReviewStatus.valueOf(reply.status)
        val saved = JSONObject().put("address", data.getString("address")).put("requestId", reply.requestId)
            .put("classId", reply.classId).put("studentId", reply.studentId).put("status", reply.status).put("reviewedAt", reply.reviewedAt)
        check(prefs.edit().putString("receipt", saved.toString()).remove("draft").commit()) { "Could not save receipt. Retry to recover it." }
        File(path).delete()
        publish("${reply.studentId}: ${ReviewStatus.valueOf(reply.status).label}. Check decision to receive the coordinator's response.")
    }
    fun checkDecision() = task {
        val data = checkNotNull(receipt()) { "Send a photo first." }
        val reply = ReviewBluetooth.exchange(getApplication(), data.getString("address"), ReviewRequest("STATUS", requestId = data.getString("requestId")))
        require(reply.requestId == data.getString("requestId") && reply.studentId == data.getString("studentId") && reply.classId == data.getString("classId")) { "Unexpected coordinator response." }
        ReviewStatus.valueOf(reply.status)
        data.put("status", reply.status).put("reviewedAt", reply.reviewedAt)
        check(prefs.edit().putString("receipt", data.toString()).commit()) { "Could not save decision. Check again." }
        publish(savedMessage())
    }
    fun discard() = task {
        val path = draft()?.optString("photo").orEmpty()
        check(prefs.edit().remove("draft").commit()) { "Could not discard draft." }
        if (path.isNotEmpty()) File(path).delete()
        publish("Local draft discarded. If it already reached the coordinator, it remains in her review list.")
    }
    private fun smallPhoto(path: String): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Photo could not be read. Capture again." }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 1280) sample *= 2
        val original = checkNotNull(BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample }))
        val orientation = ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix().apply {
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
            }
        }
        val rotated = Bitmap.createBitmap(original, 0, 0, original.width, original.height, matrix, true)
        val scale = minOf(1f, 640f / maxOf(rotated.width, rotated.height))
        val resized = Bitmap.createScaledBitmap(rotated, maxOf(1, (rotated.width * scale).toInt()), maxOf(1, (rotated.height * scale).toInt()), true)
        return try {
            ByteArrayOutputStream().use { output ->
                check(resized.compress(Bitmap.CompressFormat.JPEG, 78, output)) { "Photo compression failed." }
                output.toByteArray().also { require(it.size <= ReviewWire.MAX_PHOTO) { "Photo too large. Capture again." } }
            }
        } finally {
            if (resized !== rotated) resized.recycle()
            if (rotated !== original) rotated.recycle()
            original.recycle()
        }
    }
    override fun onCleared() { cleared = true; worker.shutdown() }
}
