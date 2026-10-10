package com.gvpcew.testing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import java.io.File
import java.util.concurrent.Executors

data class ReviewScreen(val records: List<ReviewRecord> = emptyList(), val classId: String = "",
                        val listening: Boolean = false, val accepting: Boolean = false,
                        val message: String = "Loading saved submissions...")

class CoordinatorReviewModel(application: Application) : AndroidViewModel(application) {
    val screen = MutableLiveData(ReviewScreen())
    private val worker = Executors.newSingleThreadExecutor()
    private var ledger: ReviewLedger? = null
    private var server: ReviewBluetoothServer? = null
    @Volatile private var cleared = false
    init { run { ledger = ReviewLedger(File(application.filesDir, "coordinator_reviews")); publish("Open class to receive student photos.") } }
    private fun run(action: () -> Unit) {
        if (cleared) return
        worker.execute {
            if (!cleared) try { action() }
            catch (e: Exception) { publish(e.message ?: "Could not update attendance. Please retry.") }
        }
    }
    private fun publish(message: String) {
        val store = ledger
        screen.postValue(ReviewScreen(store?.all().orEmpty(), store?.classId.orEmpty(), server != null, server?.accepting == true, message))
    }
    fun open() = run {
        val store = checkNotNull(ledger) { "Review storage could not be loaded. Restart the app." }
        if (store.classId.isEmpty()) store.newClass()
        if (server == null) server = ReviewBluetoothServer(getApplication(), store,
            { run { publish("New submission received. Review the face and student ID.") } },
            { message -> run { server = null; publish(message) } })
        server?.accepting = true
        publish("Class open. Students can send photos over Bluetooth.")
    }
    fun closeSubmissions() = run {
        server?.accepting = false
        publish("Submissions closed. You can still review photos and students can check decisions.")
    }
    fun newClass() = run {
        server?.accepting = false
        checkNotNull(ledger).newClass()
        publish("New class created. Tap Open class. Earlier reviews are kept below.")
    }
    fun decide(id: String, accepted: Boolean) = run {
        val record = checkNotNull(ledger).decide(id, if (accepted) ReviewStatus.ACCEPTED else ReviewStatus.REJECTED)
        publish("${record.studentId}: ${record.status.label}")
    }
    fun pause() = run { server?.close(); server = null; publish("Bluetooth paused. Tap Open class to reconnect. Reviews are saved.") }
    override fun onCleared() {
        cleared = true
        worker.execute { server?.close(); server = null }
        worker.shutdown()
    }
}
