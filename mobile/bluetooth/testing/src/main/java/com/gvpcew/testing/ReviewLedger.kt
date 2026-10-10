package com.gvpcew.testing

import java.io.*
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID

enum class ReviewStatus(val label: String) {
    PENDING("Pending coordinator approval"), ACCEPTED("Attendance marked"), REJECTED("Rejected - attendance not marked")
}

data class ReviewRecord(
    val requestId: String, val classId: String, val studentId: String, val device: String,
    val submittedAt: Long, val status: ReviewStatus = ReviewStatus.PENDING, val reviewedAt: Long = 0
)

/** The coordinator's durable source of truth. No transport operation can approve a record. */
class ReviewLedger(private val directory: File) {
    private val index = File(directory, "reviews.bin")
    private var records = listOf<ReviewRecord>()
    var classId: String = ""
        private set

    init {
        check(directory.isDirectory || directory.mkdirs()) { "Cannot create review storage." }
        if (index.exists()) DataInputStream(index.inputStream().buffered()).use { input ->
            require(input.readInt() == 1) { "Unsupported review storage." }
            classId = input.readUTF()
            val count = input.readInt(); require(count in 0..500)
            records = List(count) {
                ReviewRecord(input.readUTF(), input.readUTF(), input.readUTF(), input.readUTF(),
                    input.readLong(), ReviewStatus.valueOf(input.readUTF()), input.readLong())
            }
        }
    }

    @Synchronized fun newClass(): String {
        val next = UUID.randomUUID().toString()
        persist(next, records); classId = next
        return next
    }
    @Synchronized fun all(): List<ReviewRecord> = records.toList()
    fun photo(record: ReviewRecord) = File(directory, "${UUID.fromString(record.requestId)}.jpg")

    @Synchronized fun receipt(requestId: String, device: String): ReviewRecord =
        records.firstOrNull { it.requestId == requestId && it.device == device }
            ?: throw IllegalArgumentException("Submission not found for this phone.")

    @Synchronized fun submit(requestId: String, requestedClass: String, studentId: String,
                             device: String, photo: ByteArray, accepting: Boolean): ReviewRecord {
        require(UUID.fromString(requestId).toString() == requestId) { "Invalid submission ID." }
        require(StudentId.valid(studentId)) { "Invalid student ID." }
        // A retry after a lost acknowledgement returns the original decision, even after closing class.
        records.firstOrNull { it.requestId == requestId }?.let {
            require(it.device == device && it.studentId == studentId && it.classId == requestedClass) { "Submission does not match this phone." }
            return it
        }
        require(accepting && classId.isNotEmpty() && classId == requestedClass) { "Class closed or changed. Capture again in the current class." }
        require(records.none { it.classId == classId && it.studentId == studentId && it.status != ReviewStatus.REJECTED }) {
            "This student ID already has a submission in this class. Ask the coordinator to review it."
        }
        require(records.size < 500) { "Review storage is full. Contact the coordinator." }
        require(photo.size in 100..ReviewWire.MAX_PHOTO && photo[0] == 0xff.toByte() && photo[1] == 0xd8.toByte() &&
            photo[photo.lastIndex - 1] == 0xff.toByte() && photo.last() == 0xd9.toByte()) { "Invalid camera photo." }
        val record = ReviewRecord(requestId, classId, studentId, device, System.currentTimeMillis())
        val file = photo(record)
        file.outputStream().use { it.write(photo); it.fd.sync() }
        try { persist(classId, records + record) } catch (e: Exception) { file.delete(); throw e }
        records = records + record
        return record
    }

    @Synchronized fun decide(requestId: String, decision: ReviewStatus): ReviewRecord {
        require(decision != ReviewStatus.PENDING) { "Choose Accept or Reject." }
        val old = records.firstOrNull { it.requestId == requestId } ?: error("Submission not found.")
        require(old.status == ReviewStatus.PENDING || old.status == decision) { "This submission has already been reviewed." }
        if (old.status == decision) return old
        if (decision == ReviewStatus.ACCEPTED) require(photo(old).isFile && photo(old).length() > 0) { "Photo is missing. Reject this submission and ask the student to capture again." }
        val updated = old.copy(status = decision, reviewedAt = System.currentTimeMillis())
        val next = records.map { if (it.requestId == requestId) updated else it }
        persist(classId, next); records = next
        return updated
    }

    private fun persist(nextClass: String, next: List<ReviewRecord>) {
        val temporary = File(directory, "reviews.tmp")
        FileOutputStream(temporary).use { file ->
            val out = DataOutputStream(file)
            out.writeInt(1); out.writeUTF(nextClass); out.writeInt(next.size)
            next.forEach {
                out.writeUTF(it.requestId); out.writeUTF(it.classId); out.writeUTF(it.studentId); out.writeUTF(it.device)
                out.writeLong(it.submittedAt); out.writeUTF(it.status.name); out.writeLong(it.reviewedAt)
            }
            out.flush(); file.fd.sync()
        }
        Files.move(temporary.toPath(), index.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    }
}
