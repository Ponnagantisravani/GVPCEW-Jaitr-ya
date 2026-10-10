# Stage 5: front camera, random liveness, matching and submit

## Result

An approved student on the bound phone automatically enters the front camera after Stage 4 validates a classroom BLE token. The app first prepares Standard Play Integrity and checks the student's own existing record. Each attempt requests a new random server challenge (blink, turn left, turn right or smile), runs the timed native sequence, and submits a fresh MobileFaceNet template with an integrity token. Only server acceptance shows Present. Students and coordinators follow the same self-only verification flow.

The authenticated configuration endpoint returns the student's database ID, public Cloud project number, model identifier and expected Android package. It never returns service-account keys or stored face templates. The authenticated own-attendance endpoint checks roster, current section, approval and bound device; it also recovers a server commit after a network timeout. Capture failures require an explicit Retry, preventing an automatic loop from consuming the eight-attempt allowance.

## Camera and timing

- CameraX uses the front camera, ML Kit accurate face detection/classification/tracking and the exact MobileFaceNet asset and normalization used during enrollment. Preview is local; model input is upright and unmirrored. Enrollment and attendance share the lighting/focus quality gate.
- A stable neutral baseline precedes the requested action and return to neutral. Blink requires both eyes open, then closed, then open; head turns require the requested direction and return; smile requires relaxed, smiling, then relaxed probabilities. A constant still image cannot complete a sequence. Missing frames, extra faces, invalid pose, unknown/changed face tracking and low quality reset the sequence.
- Native capture has a maximum six-second budget, bounded further by the server's eight-second challenge, session expiry and the validated token lifetime. The native timer closes the camera even when no usable frames arrive. The app uses monotonic receipt/challenge budgets with network time subtracted; the server independently rechecks its own clock, current/previous token and window.
- Three fresh frontal embeddings after successful liveness are averaged and normalized. A local baseline-to-final continuity check rejects a changed face; account identity matching is performed only against the logged-in student's template on the server. No template gallery or client matched flag is used.
- Camera frames, tracking, baseline vectors and final vectors stay in memory. Attendance creates no photo files and sends no preview/photos. The activity closes and clears resources on cancel, backgrounding, expiry, recreation and logout. Screenshots are disabled for the camera. JavaScript vectors are cleared after submission or interruption.
- Returning from the native camera refreshes enrollment without forcibly unmounting the attendance screen; revoked enrollment still removes access, and the server checks again before writing.

These are best-effort 2D active liveness checks, not certified depth-based presentation-attack detection. A responsive replay/deepfake can defeat probability-based liveness; no complete replay-proof or rooted-device-proof guarantee is claimed. Spoof testing and calibration on real phones are required in Stage 7.

## Server verification and integrity

The app uses Google's Standard Play Integrity SDK 1.6.0. It prepares a provider before issuing a short-lived challenge, caches the provider in memory, and refreshes an invalid provider once. It hashes the exact ordered submission JSON with SHA-256/base64url. A shared fixture verifies JavaScript serialization, Kotlin hashing and the backend hash agree, including fractional and scientific-notation embedding values.

The server uses the existing JWT and role middleware, checks own student identity, current section, roster, approved model and bound device, and recomputes cosine similarity against only that student's stored template. It requires a calibrated MOBILE_FACE_THRESHOLD, a fresh unused matching challenge, a valid rotating token, fresh timestamp and decoded integrity verdict with the expected package, certificate, request hash and MEETS_DEVICE_INTEGRITY. It does not accept client similarity/matched flags. Final section, enrollment, roster, challenge and token checks occur again inside the write transaction. A shared lock on the session coordinates the final check with session updates; the existing unique session/student constraint and challenge row lock enforce one accepted submission.

Added API contracts:

- GET /api/attendance/configuration?device_id=... — authenticated approved/bound configuration.
- GET /api/attendance/session/:id/my-attendance?device_id=... — own existing result only.
- Existing POST /api/attendance/session/:id/challenge now requires a BLE token for the ble method and returns valid_for_ms and server_time.
- Existing POST /api/attendance/session/:id/submit receives student_id, device_id, challenge_id, challenge_type, liveness_result=true, embedding_model, 192 numeric embedding values, ble_token, timestamp and integrity_token. Session ID comes from the route. Success is PRESENT with method ble.

## Configuration before live use

Set PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER to the numeric project number linked to this app. Configure PLAY_INTEGRITY_PACKAGE_NAME=com.gvpcew.attendance, PLAY_INTEGRITY_CERT_SHA256 as the accepted base64url SHA-256 signing-certificate digest(s), and PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON with the server-only RSA credentials for the linked project. Enable the Play Integrity API and configure app recognition/testing in Google Play. Use the actual release signing certificate and a calibrated MOBILE_FACE_THRESHOLD. Existing FCM configuration and Stage 1/3/4 migrations are still required. Stage 5 adds no database migration and applies none to production.

The existing PLAY_RECOGNIZED policy remains enforced. An arbitrary debug or unrecognized sideloaded APK is expected to fail; live distribution must satisfy Google's app-recognition rules. There is no debug integrity bypass. No real Cloud project credentials, signing certificate, calibration value or working Render service name were supplied or invented. The requested default HTTPS placeholder and editable login field remain available.

## Validation

- Mobile: 34 Jest tests across 12 suites passed, including automatic launch, already-marked suppression, explicit retries, timeout recovery, interruption handling, strict native capture output, photo exclusion and the shared hash fixture. TypeScript and bundled model checksum/tensor verification passed.
- Backend: 17 mobile tests passed through npm run test:mobile-attendance. The actual Express submit route is exercised for success, own-only writes, consumed challenge, duplicate attendance, changed section (including at the locked recheck), wrong device/model, expired challenge/token/session, mismatched face, altered integrity hash, denied device verdict, false liveness, missing token and client matched flags. PostgreSQL and Google responses are mocked; this is not a live database/attestation test.
- Native: 11 JVM tests passed for template math, poses, timed random liveness and the cross-runtime hash fixture. The camera/enrollment/model/liveness/integrity sources also compiled successfully as an isolated Android library with the real CameraX, ML Kit, LiteRT and Play Integrity SDK dependencies, SDK 36 and Java/Kotlin target 17.
- Full React Native Android integration/APK remains unverified: offline source compilation was blocked by the uncached react-android-0.85.3-debug.aar, and the earlier full build remains blocked by NDK download failure. The isolated check uses exact copies of nine app source files and excludes the RN bridge/services; it is not an APK or device test. No real camera, Google verdict, BLE range, simultaneous sections or classroom timing results are claimed.

## Files changed in this stage

- backend/.env.example
- backend/package.json
- backend/src/routes/mobileAttendance.js
- backend/src/services/mobileIntegrity.js
- backend/tests/mobile-attendance.test.js
- backend/tests/mobile-session-start.test.js
- backend/tests/mobile-submit.test.js
- mobile/attendance/App.tsx
- mobile/attendance/README.md
- mobile/attendance/src/api.ts
- mobile/attendance/src/native.ts
- mobile/attendance/src/types.ts
- mobile/attendance/src/AttendanceHome.tsx
- mobile/attendance/src/faceAttendance.ts
- mobile/attendance/src/useFaceAttendance.ts
- mobile/attendance/android/app/build.gradle
- mobile/attendance/android/app/src/main/AndroidManifest.xml
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusNativeModule.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceEnrollmentActivity.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceAttendanceActivity.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceLivenessPolicy.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceFrameQuality.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusIntegrity.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/AttendanceRequestHash.kt
- mobile/attendance/android/app/src/test/java/com/gvpcew/attendance/FaceLivenessPolicyTest.kt
- mobile/attendance/android/app/src/test/java/com/gvpcew/attendance/AttendanceRequestHashTest.kt
- mobile/attendance/__tests__/AttendanceHome.test.tsx
- mobile/attendance/__tests__/faceAttendance.test.ts
- mobile/attendance/__tests__/useFaceAttendance.test.tsx
- mobile/attendance/__tests__/nativeFace.test.ts
- mobile/attendance/__tests__/fixtures/attendance-hash.json
- docs/mobile-attendance-stage-5.md

Temporary compilation harnesses and build outputs live under ignored .tmp and are excluded from app source.

## Sources and next stage

[Standard Play Integrity requests](https://developer.android.com/google/play/integrity/standard), [SDK/project setup](https://developer.android.com/google/play/integrity/setup), [server verdict checks](https://developer.android.com/google/play/integrity/verdicts), [ML Kit face probabilities and angles](https://developers.google.com/ml-kit/vision/face-detection/face-detection-concepts).

The original request says “show file changes per stage and wait for my approval before the next.” Stage 5 stops here. Stage 6 adds the auto-close job, late/fallback UI, reports and web dashboard status after approval.
