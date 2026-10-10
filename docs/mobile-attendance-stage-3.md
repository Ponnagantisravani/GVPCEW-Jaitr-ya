# Stage 3 — FCM and coordinator session start

This stage adds Firebase messaging to the existing campus backend/auth and the Android app. It does not apply production migrations, deploy the backend, create a Firebase project, or mark attendance before the BLE/liveness stages exist.

## Behavior and contracts

- POST /api/attendance/session/start now requires section_id, timetable_id and device_id. The authenticated assigned coordinator must have approved MobileFaceNet enrollment on that bound phone. It validates the current published class/lab period in Asia/Kolkata, locks the section, refuses duplicate starts for the same day/period, and commits the 60-second session, own-section approved roster, token rows, broadcaster assignments and outbox together. Firebase configuration, calibrated threshold and Play Integrity configuration remain required; failures do not bypass validation.
- GET /api/attendance/start-options returns only the coordinator's own assigned current published periods, subject/section labels and an already-created session if present. No student enters a UUID or attendance code.
- GET /api/attendance/active returns only an open session whose roster contains the authenticated student and whose section matches their current section. The app uses this authoritative discovery after a push or missed alert; push content never grants session access.
- POST /api/devices/register-fcm continues to derive user identity from the existing JWT and requires the bound device. POST /api/devices/unregister-fcm removes only that user's specified device. The app unregisters before existing auth logout, then clears local session/push state even offline. Existing JWT revocation remains enforced.
- Native Firebase token refresh attempts server registration while JavaScript is inactive. Approved foreground login, resume, refresh and 30-second checks also synchronize changed tokens. No Firebase Authentication, duplicate accounts, or public section topics are added.
- Native data-message reception checks account identity and expiry, persists only latest session metadata, displays a local attendance notification with a timeout, and supports cold/warm notification taps. The ready app checks active sessions every four seconds while foregrounded and shows server expiry/counts. The camera stays closed.

## Delivery queue

The additive mobile-attendance-fcm.sql migration creates mobile_push_outbox with one row per roster student/session. Backend startup starts a one-second worker. Claiming uses an atomic UPDATE with FOR UPDATE SKIP LOCKED and a 30-second recovery lease. Each batch claims up to 80 entries, with at most 40 parallel HTTP sends. There are up to four attempts, separated by two seconds, only before session expiry. Missing/ineligible devices and expired/closed sessions are skipped.

Before sending, the worker rechecks current section, active user, approved exact model and bound-device registration. It sends an individual HTTP v1 high-priority data message with TTL bounded by remaining session time, recipient user ID, session/section IDs, expiry and broadcaster flag. It never sends BLE tokens, face templates, photos or credentials. UNREGISTERED errors remove only the exact stale token; transient HTTP/transport errors retry. The queue survives backend restarts. A crash after FCM acceptance and before storing success can repeat delivery; notification IDs and app refresh handling are idempotent. State sent means FCM accepted the message, not that a phone received it. Transport deadlines cannot promise delivery within 60 seconds on sleeping hosting, offline or force-stopped phones.

The broadcaster flag is a handoff for Stage 4. Broadcasters do not yet automatically advertise; no BLE/liveness completion is claimed in this stage.

## Configuration and running

1. Use a Firebase project and register Android package com.gvpcew.attendance. Put the downloaded Android configuration at mobile/attendance/android/app/google-services.json, which is ignored by Git. Run npm run verify:firebase from the mobile directory. The Google services Gradle plugin is conditional on that file; without it, the app explicitly reports notifications unavailable.
2. Enable the Firebase Cloud Messaging HTTP v1 API. Set server-only FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON for a service account in that project with permission to send messages. Never put service-account private keys in the APK, google-services.json, or committed files.
3. From backend, run npm run db:migrate:mobile-fcm after the Stage 1 migration, then restart the backend. This migration has not been run against production in this task. Existing calibrated MOBILE_FACE_THRESHOLD and Play Integrity settings still gate session start.
4. The API default remains the user's editable https://<your-service-name>.onrender.com/api placeholder. Replace the service name before login. No actual deployed address was supplied.
5. Build/run Android using the Stage 2 instructions once the NDK dependency is installed. Firebase project/configuration was requested; none has been supplied or fabricated as of this review.

## Validation

Mobile Jest: six suites and 14 tests passed. TypeScript (tsc --noEmit) passed. MobileFaceNet asset checksum/tensor/pin verification passed. Backend attendance, enrollment, FCM sender/queue and coordinator-start checks: 13 tests passed. Tests use mocked database/FCM transport and do not measure real push timing or validate deployment SQL against production. The native math/pose tests from Stage 2 remain unchanged. Full Android compilation remains unverified following the failed Stage 2 NDK installation; no new APK is claimed. Native FCM delivery, token rotation and notification taps require Firebase configuration and Google Play services phones. Real-device/background/four-section timing tests remain Stage 7.

## Files changed in this stage

- database/mobile-attendance-fcm.sql
- backend/scripts/migrate-mobile-fcm.js
- backend/package.json
- backend/.env.example
- backend/src/server.js
- backend/src/routes/mobileAttendance.js
- backend/src/routes/mobileEnrollment.js
- backend/src/services/mobileFcm.js
- backend/src/services/mobilePushQueue.js
- backend/tests/mobile-fcm.test.js
- backend/tests/mobile-session-start.test.js
- mobile/attendance/.gitignore
- mobile/attendance/App.tsx
- mobile/attendance/README.md
- mobile/attendance/package.json
- mobile/attendance/android/build.gradle
- mobile/attendance/android/app/build.gradle
- mobile/attendance/android/app/src/main/AndroidManifest.xml
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusNativeModule.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusPush.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusMessagingService.kt
- mobile/attendance/android/app/src/main/res/drawable/ic_attendance_notification.xml
- mobile/attendance/src/api.ts
- mobile/attendance/src/native.ts
- mobile/attendance/src/types.ts
- mobile/attendance/src/AttendanceHome.tsx
- mobile/attendance/src/attendancePolicy.ts
- mobile/attendance/__tests__/api.test.ts
- mobile/attendance/__tests__/AttendanceHome.test.tsx
- mobile/attendance/__tests__/attendancePolicy.test.ts
- mobile/attendance/scripts/verify-firebase.mjs
- docs/mobile-attendance-stage-3.md

## Sources and next stage

[Firebase Android setup](https://firebase.google.com/docs/android/setup), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Android data-message reception](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [message priority and processing limits](https://firebase.google.com/docs/cloud-messaging/android-message-priority), [desugared Java APIs](https://github.com/google/desugar_jdk_libs/blob/master/CHANGELOG.md).

Stop here and obtain user approval before Stage 4 (BLE broadcast/scan and token rotation), as required by the original staged request.
