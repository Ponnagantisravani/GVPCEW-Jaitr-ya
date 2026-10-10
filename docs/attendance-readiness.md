# Attendance and reminders setup

The Android launcher includes automatic face attendance, college account/reminders,
coordinator photo review, and alarm diagnostics. Manual photo review stores local
coordinator decisions; automatic attendance writes the college database only after
the identity/liveness verifier accepts the challenge.

## Backend

1. Configure the existing database and authentication secrets in `backend/.env`.
2. Run `node backend/scripts/migrate-attendance-reminders.js` on an existing portal,
   or the production migration for a new installation.
3. Configure `ATTENDANCE_VERIFIER_URL` (full POST endpoint) and
   `ATTENDANCE_VERIFIER_KEY`. Production requires HTTPS. The supplied development
   face detector is not a liveness verifier and cannot replace this service.
4. Run `node backend/scripts/check-attendance-readiness.js` and
   `node backend/scripts/check-mobile-feed.js`.
5. Build the frontend with `npm run build` and restart/deploy the backend through
   the deployment's normal process.

The verifier receives challengeId, studentId, evidenceDigest, four ordered JPEG
frames, required actions, reference embedding/model_version, issuedAt and expiresAt.
It must independently check the enrolled identity, movement order and liveness,
and return the same IDs/digest plus identityVerified=true, livenessVerified=true
and a nonempty verifierVersion. Model compatibility, matching thresholds and
anti-spoof accuracy require validation with the chosen service. Neither a positive
face detection nor a client-reported movement is an accepted verification result.

Online enrollment additionally needs a compatible `FACE_API_URL` and
`FACE_SERVICE_KEY`; the /analyze result must include a valid embedding and verified
liveness. Existing supervised enrollments can be used if their embedding model
matches the attendance verifier.

## Android

Build from `mobile/bluetooth` using
`./gradlew.bat :testing:assembleDebug :testing:testDebugUnitTest :testing:lintDebug`.
Install `testing/build/outputs/apk/debug/testing-debug.apk` on both phones.

In College account & reminders, enter the deployed HTTPS API URL ending in `/api`,
sign in, allow notifications and exact alarms, then sync. The optional remembered
sign-in lasts 30 days; ordinary sign-in lasts 8 hours. Tokens are encrypted using
Android Keystore; passwords are not saved. Sign out removes account reminders.

Published timetable rows schedule alerts five minutes before class using
Asia/Kolkata college time, for the coming week. Re-sync replaces changed times and
removes cancelled classes. Personal scheduled portal reminders are also synced.
The app refreshes through Android JobScheduler (15-minute requested interval),
and immediately when Sync is pressed. This is polling, not real-time push:
Android/background restrictions and connectivity can delay new notifications.
Existing alarms are local and restored after boot, app update or an exact-alarm
permission grant. A force-stopped app must be reopened. Alarm volume, Do Not
Disturb and notification settings remain controlled by the phone.

For automatic attendance, a faculty member or student coordinator starts a
Face + Bluetooth session in the web portal, signs into the Android college account,
and selects that session under Automatic face attendance → Coordinator. Keep this
screen visible. Students pair to the coordinator, enter their roll number and
complete four guided captures. Retry confirmation recovers a committed receipt
if the Bluetooth reply was interrupted. Only a server receipt means confirmed.

## Required physical acceptance

- Test enrolled student success, wrong face, printed photo/video replay, multiple
  faces, expired challenge, stopped class, repeated submission and reused phone.
- Interrupt Bluetooth after sending and recover the same receipt without a second
  attendance row. Rotate during capture and use Continue current capture.
- Verify portal attendance records and coordinator counts against the receipt.
- Schedule a reminder, press Home and lock the phone; verify visible notification,
  audible alarm and Stop. Repeat with each notification/alarm switch combination.
- Reboot before a reminder, update a timetable time, remove a class, deny/regrant
  alarm permission, and sign out. Check that only intended reminders remain.
- Confirm notification sync after reauthentication and after network recovery.

Compilation and unit tests do not replace these checks. No connected phones or
configured identity/liveness service were available during implementation.
