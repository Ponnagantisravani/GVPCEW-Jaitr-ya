# Mobile attendance — Stage 1 review

Implemented an additive backend extension using the existing Express router, JWT login, active-account checks, role middleware, academic sections and published timetable. No deployment or production database migration has been performed.

## Files changed in this stage

Added:
- database/mobile-attendance.sql: enrollment fields, device uniqueness, session extension, roster, eight-second rotating tokens, broadcasters, one-use challenges, attendance records, audit log and FCM registrations.
- backend/scripts/migrate-mobile-attendance.js: transaction and migration lock.
- backend/scripts/purge-mobile-previews.js: delete pending previews older than seven days; schedule this in Stage 6.
- backend/src/services/mobileAttendancePolicy.js: strict 192-dimensional numeric templates, model isolation, cosine similarity, request hashing and time/token rules.
- backend/src/services/mobileIntegrity.js: Google OAuth and server decode, package/certificate/request hash/device/freshness checks. Rejects unavailable verification.
- backend/src/routes/mobileAttendance.js: session start, token, challenge, self-submit, late check-in, live counts, reports and own history.
- backend/src/routes/mobileEnrollment.js: setup, consent/password change, pending approval, private admin preview/review/reset and FCM registration.
- backend/tests/mobile-attendance.test.js: policy and HTTP rejection tests.
- docs/mobile-attendance-stage-1.md: this review and operational contract.

Updated:
- backend/src/routes/index.js: mounts the new routes under /api.
- backend/src/routes/auth.js: optional client='mobile' on the existing login skips the legacy web enrollment gate. Existing active-user/password/role checks and JWT issuance are reused. Attendance requires approved mobile enrollment independently. Mobile clients must request enrollment status immediately after login and force setup (Stage 2).
- backend/src/routes/attendanceSessions.js: old code check-in and stop cannot bypass the mobile session rules.
- backend/src/app.js: preserves expected 404/409/422/429/503 responses.
- backend/scripts/migrate-production.js: includes the new migration last.
- backend/package.json: migration and targeted test commands.
- backend/.env.example: threshold and Play Integrity configuration.

## API contract

All routes use existing Bearer authentication. Keep X-Portal-Role consistent with the selected role; coordinators remain students for self-verification.

- POST /api/auth/login: existing credentials plus optional client: 'mobile'.
- GET /api/mobile/enrollment/status
- POST /api/mobile/enrollment/setup: current_password, new_password (12+ characters), consent=true, device_id, embedding_model='mobilefacenet-v1', embedding (192 finite numbers), sample_count (3–5), preview (JPEG data URL, under 100 KB). Only the averaged vector is stored; frame capture and averaging happen in Stage 2.
- GET /api/mobile/enrollment/pending: admin only.
- GET /api/mobile/enrollment/:id/preview: admin only, private no-store response.
- POST /api/mobile/enrollment/:id/review: admin only, approve boolean; deletes preview immediately for approval or rejection.
- POST /api/mobile/enrollment/:id/reset: admin only, reason (10+ characters); deletes template, consent, preview and binding and removes FCM registration.
- POST /api/devices/register-fcm: device_id and fcm_token; must match bound device.
- POST /api/attendance/session/start: section_id and timetable_id, assigned coordinator of their own section only, approved enrollment required. Period must be the current published class/lab in Asia/Kolkata. One session per section and per timetable period/date. Exactly 60 seconds, plus 120 seconds for fallback.
- GET /api/attendance/session/:id/token: starting coordinator or selected broadcasters only; returns token, valid_from, valid_to. Tokens rotate every eight seconds. Token does not reveal a student identity.
- POST /api/attendance/session/:id/challenge: device_id, method ('ble'/'fallback'), ble_token for main window; server issues id, random challenge_type and expires_at, valid for at most eight seconds. Maximum eight attempts per student/session.
- POST /api/attendance/session/:id/submit and /late-checkin: student_id, device_id, challenge_id, challenge_type, liveness_result=true, embedding_model, embedding, ble_token (main window), ISO timestamp, integrity_token. No photos or client matched flag. Server ties student_id to authenticated user and verifies roster, enrollment, device, one-use challenge, current/previous token, time, Google integrity verdict, and fresh server cosine similarity. Per-student transaction locking and a primary key prevent duplicate records without serializing the entire section.
- GET /api/attendance/session/:id/status: scoped live counts; assigned section coordinators also receive the unmarked list.
- GET /api/attendance/session/:id/report: assigned faculty, authorized academic coordinator/HOD scope or admin, after close. Read-only, includes late flags, method, similarity and challenge.
- GET /api/attendance/history: own latest 200 records.

Integrity requestHash is base64url SHA-256 of UTF-8 JSON.stringify of this ordered array:
[session_id, student_id, device_id, challenge_id, challenge_type, liveness_result, embedding_model, embedding, ble_token || null, timestamp, method]. The integrity token itself is excluded. Mobile must implement exactly this serialization.

## Configuration and migration

From backend: npm.cmd run db:migrate:mobile-attendance after the existing production migrations. For a fresh database use the existing db:migrate:production. Run first against a disposable/staging PostgreSQL database. Existing legacy enrollment rows stay in face_embeddings and retain their old model identifiers; the new enrollment fields default to required and cannot match them.

Set MOBILE_FACE_THRESHOLD to a calibrated cosine threshold for the exact model asset and preprocessing selected in Stage 2. No guessed production threshold is enabled. The 192-dimensional contract must be confirmed against that asset before enrollment.

Configure PLAY_INTEGRITY_PACKAGE_NAME, PLAY_INTEGRITY_CERT_SHA256 (base64url digest, comma-separated) and PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON server-side; enable the Google API and authorize the account. Do not expose service credentials in the app. This implementation requires PLAY_RECOGNIZED plus MEETS_DEVICE_INTEGRITY. APK distribution/signing must be validated with Google's recognition rules; arbitrary sideloaded builds may not meet the app verdict. See https://developer.android.com/google/play/integrity/verdicts and https://developer.android.com/google/play/integrity/standard.

Run npm.cmd run test:mobile-attendance for targeted tests, npm.cmd test for the backend suite.

## Limits and next stages

Backend challenge validation verifies issued challenge ownership, type, timing and one-time use. Actual ML Kit liveness and model execution are Stage 2/5 work; the backend cannot independently establish visual liveness from a boolean and embedding. Integrity binds those results to the submitted request and recognized app but does not itself prove a blink. BLE tokens are proximity evidence and can still be forwarded during their short validity window. Fallback deliberately has no BLE evidence and is flagged for review.

Stage 3 adds section-only FCM delivery. Stage 4 replaces provisional random broadcaster selection with a room placement strategy and implements actual advertising/scanning. Stage 6 adds a durable auto-close/ABSENT materialization worker, timetable auto-start, retention scheduling, legacy dashboard report integration and hosting behavior. Current submit endpoints enforce expiry without needing a timer; reports derive ABSENT from missing records. History currently lists stored records, so missing ABSENT records require that worker. Existing legacy daily attendance remains separate until the Stage 6 dashboard integration.

Pending previews expire after seven days for access; physical expiry deletion requires scheduling purge-mobile-previews.js. Approved/rejected previews are deleted in the same review transaction. Embeddings remain until administrator reset/account deletion; campus retention policy and consent wording must be finalized in Stage 2. Audit records contain metadata, not templates, previews or tokens.

70/280-student load and real-device/range/timing verification are Stage 7 and have not been performed. No claim is made yet about completing 70 devices within 60 seconds.

Stop here for the user's approval before Stage 2, as explicitly requested in the attached requirements.

## Validation result

All 8 mobile attendance tests passed, including real HTTP requests against mocked database access for unauthenticated, proxy identity, wrong roster, wrong device, face mismatch and stale BLE rejection. These are not PostgreSQL integration tests. Full backend suite: 23 passed, 1 failed in tests/auth.test.js:64, which expects three faculty attendance-register SQL parameters but the existing route supplies a fourth undefined parameter. That faculty route was not changed in this stage. PostgreSQL migration execution, real Google credentials/verdicts and real phones remain unverified.
