package com.gvpcew.testing

/** Detection is deliberately not represented as an identity credential. */
data class AttendanceAttempt(val studentId: String, val classroomSignalSeen: Boolean, val faceDetected: Boolean)

sealed interface SubmissionResult {
    data class NotRecorded(val reason: String) : SubmissionResult
    // Only an authenticated server adapter may supply a receipt in a future integration.
    data class Confirmed(val receiptId: String, val studentId: String, val recordedAt: String) : SubmissionResult
}

interface AttendanceRepository {
    fun submit(attempt: AttendanceAttempt): SubmissionResult
}

/** No network service or recognition implementation exists in this repository. Fail closed. */
class UnconfiguredAttendanceRepository : AttendanceRepository {
    override fun submit(attempt: AttendanceAttempt): SubmissionResult = SubmissionResult.NotRecorded(
        "Attendance has not been recorded. Your college needs to connect identity verification and the attendance service. Please contact your coordinator."
    )
}
