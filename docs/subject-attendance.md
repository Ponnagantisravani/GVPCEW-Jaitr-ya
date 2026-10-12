# III CSE, semester 5: subject and period attendance

The student coordinator opens Attendance Session, chooses one of the eight mapped subjects, a published period for today, a configured lab batch if applicable, and a time limit (default 600 seconds; 30–1800 allowed). The server verifies her own class and semester. Labs cover up to three consecutive periods of the same subject, stopping at another subject, a break, a gap such as lunch, or the end of the day. The UI reports the periods actually covered.

Students retain their existing camera and face-verification entry. The internal markPresent(sourceSessionId, studentId, transactionClient) is invoked only after the existing verifier succeeds; there is no public mark-success endpoint. One verified mark updates every covered period. A per-session roster is snapshotted, with one record per student per covered period. Unmarked students remain Pending until the coordinator ends the session or its authoritative deadline expires, then become Absent. Subject sessions do not accept a late window. Legacy sessions retain their existing behavior. No old daily attendance history is rewritten or inferred as period history.

Faculty Attendance shows only subjects whose mapping matches the authenticated login email, with date/period selection, roster counts, percentage, and semester totals per student. Student Attendance shows only the authenticated student's current-class data, today's periods, subject totals and date/period history. Reports poll every 10 seconds. Pending periods are excluded from completed-period denominators. Local demo records are labelled and totals are separate from official records.

## Setup

- Migration: database/subject-attendance.sql; run npm.cmd --prefix backend run db:migrate:subject-attendance. Local demo startup also applies it. It is additive and repeatable and does not change credentials or remove attendance.
- Eight subject metadata/faculty-email mappings are seeded. CN and CN Lab map to indu@gvpcew.ac.in; Data Mining theory/lab map to sowmya@gvpcew.ac.in. Other mappings are as requested.
- The six requested faculty emails currently have no faculty login accounts in this database. Subject mappings do not create passwords or impersonate faculty. Create/assign those accounts through existing Admin User Management before real teacher login testing.
- Batches are configured from the user's rule: first 35 active students in roll-number order are Batch 1. The user delegated handling of extra students, so everyone remaining is Batch 2; nobody is excluded. Counts for Sections 1–4 are 35/54, 35/41, 35/41, and 35/2. Existing section assignments are preserved. Lab batch selection is mandatory. Server verifies batch ownership and active class membership.
- Period numbers come from distinct published start/end times for the day, in order. Gaps stop a lab block. Unpublished or missing schedules never produce fabricated periods. For local testing on Sunday, Section 3 now has P1 Computer Networks (09:00–09:50), and P2–P4 Computer Networks Lab (09:50–12:20). These rows are labelled Local Sunday demo and use the LOCAL-SUNDAY-DEMO classroom. Other days and sections are unchanged. The local webcam demo permits selection of these published Sunday periods for testing outside their wall-clock times; the official Android path still enforces the current time.
- The local webcam mode remains a demonstration using heuristic blink and separate face/reference/attendance records, without BLE, Play Integrity, or certified anti-spoofing. Official starts use the existing registered Android device, current published slot, BLE broadcasts, Firebase and Integrity readiness checks. This change adds the picker to the React dashboard; it does not redesign the Android picker or certify physical phone behavior.

## Integrity and endpoints

All new APIs mount under /api/attendance: GET /subjects; POST /sessions ({subjectId,period,batchId?,durationSeconds?}); GET /sessions/current; POST /sessions/:id/end; GET /faculty/subjects; GET /faculty/subjects/:id/attendance?date=&period=; GET /student/attendance. Authorization uses current database roles and X-Portal-Role, not token role claims. Teachers cannot read another mapped subject; coordinators cannot read faculty reports through the coordinator role; students cannot select another student's identity.

Transactions, class advisory locks, session/verification lock ordering, and database primary keys protect roster snapshots, one mark per session, student-period claims and class/batch-period claims. Whole-class sessions conflict with every batch, while disjoint batches may run simultaneously. Closed claims remain reserved for that date/period, preventing a second attendance session from double-counting it.

## Verification

- Backend unit/API suite: 55 tests passed.
- Frontend suite: 40 tests passed; production build passed.
- npm.cmd --prefix backend run test:subject-attendance: real PostgreSQL + actual role-protected HTTP routes, rollback-only fixtures. Covers 3-period labs, 1-period theory, end-of-day clipping, overlap rejection, one mark updating 3 records, idempotency, Pending/Absent lifecycle, manual/automatic closure, self-only student queries, teacher ownership including both mapped subjects, class mismatch, disjoint batch rosters and hard unique constraints.
- Real browser checks passed for the coordinator and student React attendance screens at a 390px phone width, using the existing authorized login.
- Pure policy tests also cover breaks, another subject, lunch gaps, missing schedules, and Asia/Kolkata dates.

Physical phone camera/BLE/Integrity testing remains required for the official Android path. The existing mobile face checks are preserved.
