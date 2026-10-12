# Stage 6: automatic closure, late recovery and dashboard reports

## Result

The existing backend now runs a lifecycle worker for mobile attendance. Main submissions are accepted only before the server’s 60-second deadline. Missing roster students become ABSENT. For the following 120 seconds, those students can explicitly start the same random liveness, face-template and Play Integrity checks without Bluetooth. Successful recovery records LATE with method fallback and a teacher-review flag. Accepted PRESENT or LATE records cannot be overwritten by another submission.

| Elapsed from Start | Mobile behavior | Server result |
| --- | --- | --- |
| 0–60 seconds | BLE proximity unlocks the automatic face check | PRESENT / ble |
| 60–180 seconds | Explicit Start late face check; fresh challenge, face and integrity; no BLE token | LATE / fallback; review required |
| After 180 seconds | Display final own result; no capture | Missing students remain ABSENT |

Coordinators still start attendance on a capable bound Android phone and verify themselves like every other student. A published timetable period can also auto-start when no session exists. Teachers and academic coordinators use read-only reports after main closure. Students see only their own session history.

## Closure and automatic timetable start

The worker starts with the existing backend HTTP service, reconciles once per second without overlapping its own ticks, and catches up expired sessions after a restart. Closure locks expired mobile sessions, inserts absence rows from the original enrollment-approved roster with ON CONFLICT DO NOTHING, closes the session, expires pending notifications and writes an audit event in one transaction. The effective deadline is enforced in challenge/submission routes independently of worker scheduling; database absence materialization occurs on the next available worker tick.

Submission holds a shared session lock for its final server checks. Its enrollment row uses FOR NO KEY UPDATE to serialize enrollment changes while allowing the closure insert’s foreign-key key-share lock; this avoids reversing incompatible student/session locks. Session creation reconciles an old session in a separate transaction before taking new roster/enrollment locks. Real PostgreSQL locking and load behavior still require Stage 7 verification.

Manual and automatic start use one shared service with the existing assignment, active-account, enrollment/model/device, advertising capability and published-current-period checks. A per-section advisory lock and a unique mobile section/period/day index prevent duplicate sessions; separate sections have separate locks. Roster, rotating tokens, helper broadcaster assignments and durable push outbox remain atomic.

MOBILE_AUTO_START_GRACE_SECONDS defaults to 15, with allowed values 5–60 (restricted during Stage 7 validation). The worker considers published class/lab periods for the current Asia/Kolkata weekday only between that grace and 120 seconds after period start. It selects a currently assigned coordinator with approved enrollment and a registered advertising-capable bound phone, then creates the same 60-second session and sends the existing scoped push. A simultaneous manual start is treated as an already-started period. Missing eligible phones or required Firebase/Integrity/threshold configuration prevents automatic start. The worker does not fabricate a broadcaster or attendance record. FCM/Android restrictions and force-stopped/offline phones still affect reception and broadcasting.

Expired enrollment previews are physically purged every minute. BLE proofs are deleted after main expiry, and session challenges after late expiry. Templates, attendance records, rosters and audits are retained. The legacy web-session housekeeping update now excludes mobile sessions.

## Late flow and API contracts

All routes stay under the existing /api/attendance mount and JWT/role middleware:

- GET /current?device_id=... returns the current roster session for the student’s own section today, BLE/fallback/closed phase, own record, server_time and valid_for_ms. It checks enrollment approval and bound device. A missing record after main expiry is shown as ABSENT even before closure materializes it.
- GET /sessions returns up to 100 scoped mobile sessions for assigned coordinators, session faculty, authorized academic departments/institution or admins. It returns server-derived open/closed status and whether late recovery is final.
- POST /session/:id/challenge accepts method fallback with device_id after main expiry and before late expiry. BLE tokens are rejected for this method. The same random eight-second challenge applies. BLE and fallback each have an eight-attempt allowance; accepted attendance blocks another challenge.
- POST /session/:id/late-checkin accepts the same identity, fresh numeric template, challenge, device, timestamp and integrity fields as the main submission, without ble_token. The request hash binds method fallback and a null token. The server rechecks own identity, current section, original roster, approval, model, bound device, freshness, challenge, integrity and similarity, including final locked checks. Only an absent/missing record can become LATE.
- GET /session/:id/status includes server-budget countdown, present/late/absent counts, total, late expiry and final state. Unmarked identities are returned only to an assigned coordinator; ordinary section students receive counts.
- GET /session/:id/report is restricted to authorized faculty, academic coordinators and admins and becomes available after main expiry. Each roster row includes Present/Absent/Late, method, similarity, challenge, recorded time and review_required for late/fallback.
- GET /history joins only the logged-in student’s session roster and includes absences, including missing rows after expiry. It does not return classmates’ records.

Late acceptance writes late_checkin_review. A third or later fallback within 30 days additionally writes frequent_fallback. Existing device-change and shared-device enrollment audits remain in place. Teacher review is a read-only flag; this stage adds no override endpoint.

The mobile UI anchors window budgets to a monotonic clock and subtracts full request delay. It retains a closed session to display own result and late recovery. It stops BLE broadcasting/scanning when the main window ends. Late capture prepares secure verification but waits for an explicit tap, and uses the exact Stage 5 camera/model without photos. Duplicate taps, existing server results, uncertain network commits and stale in-flight results on phase changes are handled. The native expiry message also applies to late challenges.

## Existing dashboard integration

Coordinator Attendance Session, Class Attendance and Attendance Status show a session selector, server-anchored countdown, marked/total count, late count and unmarked/absent list. Starting happens in the Android app. Polls are scheduled after each request completes and cancelled when the selected session/view changes; transient errors keep the last successful result visible with a retry message.

Student Attendance and Mark Attendance show private mobile history and Android-app guidance. The previous subject-level daily totals remain a separate legacy register; per-session mobile records are not collapsed into its one-row-per-day table.

Faculty Attendance links to Mobile Attendance Reports; the faculty and academic-coordinator menus also expose that page. Reports show method, similarity and late review without edit controls. Closed sessions are selected using server status. Reports poll during late recovery and identify provisional versus final results.

## Migration and keeping the server awake

Apply previous portal/mobile prerequisites first, then from backend run:

    npm run db:migrate:mobile-lifecycle

The new migration adds start_source and indexes for uniqueness, expiry and student history. Its runner uses the existing database SSL helper and a migration advisory lock, executes in a transaction and does not reset data. No migration was executed against the user’s database in this stage. Restart the backend after migration. Existing Firebase, Standard Play Integrity, real signing certificate and calibrated MOBILE_FACE_THRESHOLD configuration are required for session starts. No service-account keys or live settings were supplied or invented.

For an existing sleeping web service, an external helper is included:

    node tools/attendance-keep-warm.mjs --api-base https://YOUR-ACTUAL-SERVICE.onrender.com/api --interval-seconds 120

Run it on a separate awake computer or existing running host before and during classes. It calls the existing /api/health endpoint immediately and then every two minutes, rejects HTTP/placeholder URLs and credentials, uses a 15-second timeout, refuses redirects and stops on Ctrl+C. Add --once for a single health check. It uses no account password, JWT or paid dependency.

An internal timer cannot wake a sleeping host. The external helper must itself remain running and reach the service; use an already-running backend/VM for class-critical timing when available. The current health route checks HTTP service response, not database/Google readiness, and a successful ping does not guarantee provider uptime, push delivery or classroom timing. No live keep-warm process, hosting change or deployment was started. The requested editable mobile default remains https://<your-service-name>.onrender.com/api until the real URL is supplied.

## Verification

- Mobile: 41 Jest tests across 12 suites pass; TypeScript passes. Added checks cover late upload/hash without BLE, expiry boundaries, explicit capture, duplicate taps, cancellation, server budgets and the late screen.
- Backend attendance: 30 tests pass, including actual authenticated Express routes for fallback submission, absence replacement, no accepted-record overwrite, expired/early windows, BLE omission, method-bound integrity, review audits, discovery, report permissions, counts/privacy and own history. Worker tests cover idempotent closure, separate sections, rollback, timetable eligibility and retention cleanup. PostgreSQL and Google responses are mocked.
- Full backend regression: 46 tests pass. The wider suite found an existing stale faculty-register assertion; it now covers the existing optional section parameter, with and without a section, without changing that route’s behavior.
- Frontend: all 40 tests pass, including nine new view/polling tests. All portal entry points build successfully. The build retains its large-bundle warning.
- Keep-warm helper: syntax and CLI help checked locally; HTTP URL rejection verified; no live service was contacted. The in-app browser was unavailable, so dashboard validation used server-rendered component tests and build checks, not a visual browser session.

No live database migration or concurrent PostgreSQL stress test was run. Full Android APK integration, real camera/Integrity/FCM, phone-to-phone BLE range, helper seating, four-section timing and the classroom test remain unverified. Stage 5’s isolated Android compilation and JVM results remain recorded separately; they are not full APK/device verification.

## Files changed in this stage

- README.md
- backend/.env.example
- backend/package.json
- backend/scripts/migrate-mobile-lifecycle.js
- backend/src/routes/attendanceSessions.js
- backend/src/routes/mobileAttendance.js
- backend/src/server.js
- backend/src/services/mobileAttendanceLifecycle.js
- backend/tests/auth.test.js
- backend/tests/mobile-lifecycle.test.js
- backend/tests/mobile-session-start.test.js
- backend/tests/mobile-submit.test.js
- database/mobile-attendance-lifecycle.sql
- frontend/src/FacultyDashboard.jsx
- frontend/src/RoleDashboards.jsx
- frontend/src/MobileAttendance.jsx
- frontend/src/mobile-attendance.css
- frontend/src/mobile-attendance.js
- frontend/tests/mobile-attendance.test.js
- mobile/attendance/README.md
- mobile/attendance/__tests__/AttendanceHome.test.tsx
- mobile/attendance/__tests__/api.test.ts
- mobile/attendance/__tests__/attendancePolicy.test.ts
- mobile/attendance/__tests__/faceAttendance.test.ts
- mobile/attendance/__tests__/useFaceAttendance.test.tsx
- mobile/attendance/src/AttendanceHome.tsx
- mobile/attendance/src/api.ts
- mobile/attendance/src/attendancePolicy.ts
- mobile/attendance/src/faceAttendance.ts
- mobile/attendance/src/types.ts
- mobile/attendance/src/useBleProximity.ts
- mobile/attendance/src/useFaceAttendance.ts
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusNativeModule.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceAttendanceActivity.kt
- tools/attendance-keep-warm.mjs
- docs/mobile-attendance-stage-6.md

## Next stage

The original request says “show file changes per stage and wait for my approval before the next.” Stage 6 ends here. Stage 7’s 70-student simulation, real-phone and classroom/range tests await approval. Regression tests in this stage verify the newly changed behavior; they do not claim the Stage 7 scale or physical results.
