package com.gvpcew.testing

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.UUID
import java.util.concurrent.Executors

class ReviewLedgerTest {
    @get:Rule val folder = TemporaryFolder()
    private fun id() = UUID.randomUUID().toString()
    private fun jpeg() = ByteArray(150).apply { this[0] = -1; this[1] = -40; this[148] = -1; this[149] = -39 }
    private fun fails(action: () -> Unit) {
        try { action(); fail("Expected rejection") } catch (_: IllegalArgumentException) { }
    }
    @Test fun onlyCoordinatorDecisionMarksAttendanceAndSurvivesRestart() {
        val dir = folder.newFolder(); val ledger = ReviewLedger(dir); val classroom = ledger.newClass()
        val pending = ledger.submit(id(), classroom, "23CSE001", "PHONE_A", jpeg(), true)
        assertEquals(ReviewStatus.PENDING, pending.status)
        assertEquals(0L, pending.reviewedAt)
        assertTrue(ledger.photo(pending).isFile)
        assertEquals(ReviewStatus.PENDING, ReviewLedger(dir).receipt(pending.requestId, "PHONE_A").status)
        val accepted = ledger.decide(pending.requestId, ReviewStatus.ACCEPTED)
        assertTrue(accepted.reviewedAt > 0)
        assertEquals(ReviewStatus.ACCEPTED, ReviewLedger(dir).receipt(pending.requestId, "PHONE_A").status)
        fails { ledger.decide(pending.requestId, ReviewStatus.REJECTED) }
    }
    @Test fun retriesNeverDuplicateOrResetAnAcceptedRecord() {
        val ledger = ReviewLedger(folder.newFolder()); val classroom = ledger.newClass(); val request = id()
        ledger.submit(request, classroom, "S1", "A", jpeg(), true)
        ledger.decide(request, ReviewStatus.ACCEPTED)
        val retry = ledger.submit(request, classroom, "S1", "A", jpeg(), false)
        assertEquals(ReviewStatus.ACCEPTED, retry.status)
        assertEquals(1, ledger.all().size)
        fails { ledger.submit(request, classroom, "S1", "B", jpeg(), true) }
        fails { ledger.submit(request, classroom, "S2", "A", jpeg(), true) }
        fails { ledger.receipt(request, "B") }
    }
    @Test fun rejectionIsNotAttendanceAndAllowsNewCapture() {
        val ledger = ReviewLedger(folder.newFolder()); val classroom = ledger.newClass()
        val first = ledger.submit(id(), classroom, "S1", "A", jpeg(), true)
        fails { ledger.submit(id(), classroom, "S1", "A", jpeg(), true) }
        ledger.decide(first.requestId, ReviewStatus.REJECTED)
        val second = ledger.submit(id(), classroom, "S1", "A", jpeg(), true)
        assertEquals(ReviewStatus.PENDING, second.status)
        assertEquals(0, ledger.all().count { it.status == ReviewStatus.ACCEPTED })
    }
    @Test fun closedChangedAndMalformedSubmissionsAreRejected() {
        val ledger = ReviewLedger(folder.newFolder()); val oldClass = ledger.newClass()
        fails { ledger.submit(id(), oldClass, "S1", "A", jpeg(), false) }
        ledger.newClass()
        fails { ledger.submit(id(), oldClass, "S1", "A", jpeg(), true) }
        fails { ledger.submit(id(), ledger.classId, "S1", "A", byteArrayOf(), true) }
        fails { ledger.submit(id(), ledger.classId, "BAD ID", "A", jpeg(), true) }
        assertTrue(ledger.all().isEmpty())
    }
    @Test fun newClassKeepsPastDecisionsAndAllowsSameStudent() {
        val dir = folder.newFolder(); val ledger = ReviewLedger(dir)
        val old = ledger.submit(id(), ledger.newClass(), "S1", "A", jpeg(), true)
        ledger.decide(old.requestId, ReviewStatus.ACCEPTED)
        val current = ledger.submit(id(), ledger.newClass(), "S1", "A", jpeg(), true)
        val reloaded = ReviewLedger(dir)
        assertEquals(ReviewStatus.ACCEPTED, reloaded.receipt(old.requestId, "A").status)
        assertEquals(ReviewStatus.PENDING, reloaded.receipt(current.requestId, "A").status)
        assertEquals(current.classId, reloaded.classId)
    }
    @Test fun simultaneousTransfersAndRetriesKeepEveryStudentExactlyOnce() {
        val dir = folder.newFolder(); val ledger = ReviewLedger(dir); val classroom = ledger.newClass()
        val pool = Executors.newFixedThreadPool(10)
        try {
            val requests = List(10) { id() }
            val tasks = (0 until 30).map { n -> java.util.concurrent.Callable {
                val student = n % 10
                ledger.submit(requests[student], classroom, "S$student", "PHONE$student", jpeg(), true)
            } }
            pool.invokeAll(tasks).forEach { assertEquals(ReviewStatus.PENDING, it.get().status) }
            assertEquals(10, ReviewLedger(dir).all().size)
        } finally { pool.shutdownNow() }
    }
    @Test fun missingPhotoCannotBeAccepted() {
        val ledger = ReviewLedger(folder.newFolder())
        val record = ledger.submit(id(), ledger.newClass(), "S1", "A", jpeg(), true)
        assertTrue(ledger.photo(record).delete())
        fails { ledger.decide(record.requestId, ReviewStatus.ACCEPTED) }
        assertEquals(ReviewStatus.PENDING, ledger.receipt(record.requestId, "A").status)
        assertEquals(ReviewStatus.REJECTED, ledger.decide(record.requestId, ReviewStatus.REJECTED).status)
    }
}
