package com.gvpcew.testing

import org.junit.Assert.*
import org.junit.Test

class AttendanceBoundaryTest {
    @Test fun sharedClassroomRejectsPersonalAndMalformedAdvertisements() {
        val payload = ClassroomSignal.classroomPayload()
        assertTrue(ClassroomSignal.isClassroom(payload))
        assertFalse(ClassroomSignal.isClassroom(null))
        assertFalse(ClassroomSignal.isClassroom(payload + byteArrayOf(0)))
        assertFalse(ClassroomSignal.isClassroom(ClassroomSignal.encode("CLASSROOM")))
        assertFalse(ClassroomSignal.matches(payload, "CLASSROOM"))
        // Legacy advertising: flags + AD header + 128-bit UUID + payload <= 31 bytes.
        assertTrue(3 + 2 + 16 + payload.size <= 31)
    }
    @Test fun studentIdValidationAndNormalization() {
        assertNotNull(StudentId.error("")); assertNotNull(StudentId.error("    "))
        assertNotNull(StudentId.error("23 CSE001")); assertNotNull(StudentId.error("12345678901"))
        assertNotNull(StudentId.error("学生01"))
        assertEquals("23CSE001", StudentId.normalize(" 23cse001 "))
        assertNull(StudentId.error("23cse001"))
    }
    @Test fun classroomSignalMustMatchExactId() {
        val payload = ClassroomSignal.encode("23CSE001")
        assertTrue(ClassroomSignal.matches(payload, "23CSE001"))
        assertFalse(ClassroomSignal.matches(payload, "23CSE002"))
        assertFalse(ClassroomSignal.matches(null, "23CSE001"))
        assertFalse(ClassroomSignal.matches(payload + byteArrayOf(0), "23CSE001"))
        assertFalse(ClassroomSignal.matches(payload, ""))
    }
    @Test fun detectionAndRadioNeverBecomeServerConfirmation() {
        val repository: AttendanceRepository = UnconfiguredAttendanceRepository()
        for (face in listOf(false, true)) for (radio in listOf(false, true)) {
            val attempt = AttendanceAttempt("23CSE001", radio, face)
            assertTrue(repository.submit(attempt) is SubmissionResult.NotRecorded)
            assertTrue(repository.submit(attempt) is SubmissionResult.NotRecorded)
        }
    }
}
