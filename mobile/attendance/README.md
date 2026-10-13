# GVPCEW Attendance — React Native Android app

Stage 2 implements existing backend login, mandatory setup, permissions and on-device face enrollment. Session push, BLE and attendance capture are the following approved stages.

## Run

Use Node 22.11 or newer, JDK 17 and Android SDK 36 with Build Tools 36.0.0. The Gradle wrapper pins 9.3.1 and its published SHA-256. React Native is pinned to 0.85.3 with the matching official community template. npm postinstall applies the documented upstream Foojay 1.0.0 fix for Gradle 9, reproducibly.

From this directory:

- npm.cmd ci
- npm.cmd run typecheck
- npm.cmd test -- --runInBand
- npm.cmd run verify:model
- npm.cmd start (keep Metro open for a debug build)
- npm.cmd run android (with a USB-connected, authorized Android phone)

Configure android/local.properties with your SDK location; that machine-specific file is ignored. From android, run .\gradlew.bat :app:assembleDebug :app:testDebugUnitTest. For an APK with embedded JavaScript use :app:assembleRelease; the template uses a development signing key, so configure a dedicated campus release signing key before distribution and Play Integrity setup. No release signing credentials are included here.

## Campus backend address

src/config.ts defaults to https://<your-service-name>.onrender.com/api as requested. This is a placeholder. The login address stays editable, and the app explicitly rejects placeholders until the actual service name is entered. A successful login stores the chosen address with the encrypted session. The native API transport permits HTTPS only and refuses redirects, so passwords and JWTs are not forwarded to another host. Run the Stage 1 backend migration before connecting this app.

Login calls the existing /api/auth/login with client='mobile'. There is no new login server or duplicate account database. The existing /api/mobile/enrollment/status determines the required screen. After each login or restored login, students.face_enrolled is checked before showing any dashboard. A false flag opens mandatory registration; a true flag goes to the dashboard. Attendance still requires the correct model, approved enrollment and bound phone on the server.

## Enrollment

1. Read and accept face enrollment consent, then tap Register face.
2. The front camera collects five samples: front, slightly left, slightly right, front and front. CameraX and bundled ML Kit require one tracked, well-lit face.
3. The shared, pinned MobileFaceNet model creates 192 numeric values per frame. Samples are averaged and L2-normalized on the phone.
4. The app automatically posts the numeric template and model/device/consent metadata to /api/mobile/enrollment/setup. It uploads no photographs, previews or camera frames, and does not change the login password.
5. The backend saves against the authenticated student's row/roll number, binds the phone, sets face_enrolled=true, enrolled_at=clock_timestamp(), and enrollment_status=approved. The app opens the dashboard immediately.
6. Only an admin reset clears face_enrolled and enrolled_at and permits registration again. Existing enrollments are preserved.

For existing mobile databases, run npm.cmd --prefix backend run db:migrate:mobile-blink before restarting the updated backend. Fresh installations receive enrolled_at from the base mobile migration.

## Device and privacy

The device id is a SHA-256 of the Android signing-scoped ANDROID_ID plus the app package. It is stable across ordinary restarts and reinstall with the same signing identity, subject to Android reset/user/signing behavior. Changes require an admin reset. IDs do not provide hardware attestation; Play Integrity is added to attendance in Stage 5.

JWT/account/address state is encrypted with AES-GCM using an Android Keystore key. Android backup is disabled. Camera and account screens block screenshots. No biometric frames, preview, password or face template are saved in the app's preferences. The backend holds the approved numeric template until reset/account deletion; New enrollment creates no preview. Legacy preview cleanup remains available.

Model provenance, exact checksum, tensor shapes and preprocessing are recorded in model-manifest.json. The model comes from the pinned Apache-2.0 upstream repository; its license is in licenses/. Do not substitute a different asset or preprocessing under mobilefacenet-v1. Production matching thresholds still need calibration on representative phones/faces; the app does not invent an attendance threshold.

## Verification limits

Automated tests cover enrollment navigation, password rules, HTTPS/placeholder validation, existing auth reuse, template-only upload and one-time denied permissions. Native JVM tests cover averaging, normalization, invalid dimensions and pose gates. Model verification parses the actual TFLite FlatBuffer and checks its checksum and FLOAT32 tensor sizes.

Physical camera behavior, recognition accuracy, denial recovery and encrypted session persistence must be tested on phones. iOS contains the official scaffold but the enrollment bridge is Android-only. No iOS face enrollment is claimed.

Sources: https://reactnative.dev/docs/set-up-your-environment ; https://developers.google.com/ml-kit/vision/face-detection/android ; https://developers.google.com/ml-kit/vision/face-detection/face-detection-concepts ; https://developers.google.com/edge/litert/android ; https://github.com/gradle/foojay-toolchains/blob/main/CHANGELOG.md .

## Stage 3: notifications and coordinator start

Use an existing Firebase project, add Android package com.gvpcew.attendance, and place its google-services.json at android/app/google-services.json (ignored by Git). Run npm run verify:firebase. The Google services plugin runs when that file exists; enrollment builds remain possible without it, and push displays an explicit missing-configuration message. Firebase Messaging is the only Firebase product dependency; existing campus JWT authentication remains in use.

Configure backend FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON with credentials for that same project. Enable the Firebase Cloud Messaging HTTP v1 API and grant the service account permission to send messages. Keep its private key only in server environment configuration. Run the Stage 3 migration npm run db:migrate:mobile-fcm after Stage 1, then restart the server to start the queue worker. Existing Play Integrity and calibrated threshold prerequisites for session start still apply.

On the approved bound phone, the app registers and refreshes its FCM token. Sign-out unregisters that device before revoking the JWT and clears saved push metadata/notifications even if the server is unreachable. A native FirebaseMessagingService receives data messages while JS is inactive, displays a time-limited attendance notification, and saves only session metadata for foreground recovery. Notification reception does not open the camera. Token rotation also attempts registration natively; foreground synchronization retries failures.

A coordinator sees only their own current published timetable periods returned by the server. Start sends the section/period IDs and bound device, without typing or scanning a code. The server validates current assignment and period, creates the 60-second session, and commits roster, rotating-token rows and push queue atomically. Student controls never include Start. Duplicate/racing starts return the existing-session state instead of creating another session.

Pushes target individual roster devices, without public topics, BLE secrets, templates or photos. Expired/other-account messages are discarded. The app verifies current session access with /attendance/active, shows the server expiry/counts, and polls while open to recover missed alerts. Automatic BLE advertising/scanning and face attendance are the next stages. Until they are implemented, a session can be opened but no attendance is automatically marked.

FCM acceptance is not delivery confirmation. Permissions, device connectivity, force-stop state, battery restrictions and hosting availability affect delivery. Test foreground/background/terminated notification taps, account logout, token rotation, denied notification permission and four-section isolation on real phones before distribution. Full Android build remains unverified due the Stage 2 NDK download failure.

References: [Android Firebase setup](https://firebase.google.com/docs/android/setup), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Android data message reception](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [delivery priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

## Stage 4: BLE proximity

Install dependencies with npm ci; postinstall reapplies the pinned advertiser compatibility fixes. The native override in react-native.config.js corrects the upstream Java package import. The packet uses a private prototype company identifier (0xffff), GC/version marker, and 12 token bytes; no service UUID/name is transmitted. Scanner and advertiser must share this exact encoding.

Run npm run db:migrate:mobile-ble from backend after the Stage 1 and Stage 3 migrations. Reopen each approved app so FCM registration reports advertising capability. Session start requires a capable registered coordinator phone. Up to three capable approved roster phones are selected as helper broadcasters. Physical middle/back seating is not known to the backend and must be checked during the classroom test.

Coordinator Start immediately requests a connected-device foreground service. High-priority FCM can start that service on helpers while the app is inactive, subject to Android background-start restrictions. Open the app and retry broadcasting if restricted. The ongoing service notification makes this activity visible. Both a native service timer and per-advertisement timeout bound radio activity; logout stops it natively. The headless task rotates server-authorized tokens every eight-second slot and stops using a packet on network failure.

Students/coordinators/helpers scan while the attendance screen is open. No RSSI minimum is used. Caught tokens are validated under existing auth/roster/section/device checks. Only a live accepted receipt enables the camera-ready state; expiry, backgrounding and session changes discard it. The front-camera attendance workflow is Stage 5, and actual late recovery is Stage 6. Scanning continues after the 10-second still-searching state and 20-second recovery guidance. The optional relay mode is disabled.

Test with real phones: coordinator/helper/students together, denied permissions, Bluetooth off, app resume, another section's token, rotation, screen-off helper broadcasting, expiry/sign-out cleanup and last-bench reception. BLE/FCM/Android restrictions cannot guarantee physical room position or 60-second completion without these tests. No full APK/native runtime or radio-range claim is made until the Android build and Stage 7 phone tests pass.

## Stage 5: automatic face verification

After the student taps the session notification and a classroom BLE token is automatically caught and server-validated, the front camera opens with one action: blink. ML Kit requires both eyes open, closed, then open on the same tracked face. Fresh frontal embeddings immediately after that blink are compared silently to the logged-in student’s own template using the server-configured threshold. The model is the same MobileFaceNet used at registration. A mismatch displays "Face not recognized, try again" and automatically retries, with at most three challenges in the session window. The server independently recomputes similarity and checks BLE, expiry, roster, binding, integrity and duplicate attendance before confirming. Success closes the camera and shows green "Attendance marked" feedback. Existing attendance and uncertain network commits are recovered from the authenticated own-record endpoint.

Configure the backend's public PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER along with its existing server-only service account, package and signing-certificate settings. No key is bundled in the app. The PLAY_RECOGNIZED policy requires a recognized app/version/certificate; no fake/debug verdict is accepted. Missing configuration fails closed.

Run npm run typecheck, npm test -- --runInBand and npm run verify:model here; run npm run test:mobile-attendance in backend. Native liveness/hash tests are under android/app/src/test. The isolated Android camera/integrity compilation passed; full APK integration and real-phone attestation still need verification. See [Stage 5 changes, timing and configuration](../../docs/mobile-attendance-stage-5.md). Stage 6 is implemented; see the lifecycle and report notes below.

## Stage 6: closure, late attendance and reports

The server closes the main window after 60 seconds and records Absences for unmatched roster students. The app discovers the current BLE, two-minute late or closed window under the existing JWT and bound-device check. Late check-in uses a fresh blink challenge, the same camera/model and Play Integrity, and the server’s own template match. It requires an explicit tap and never asks for a Bluetooth token. Successful late results show Present (Late) and are flagged for teacher review.

Apply npm run db:migrate:mobile-lifecycle in backend after the previous mobile migrations, then restart the backend. The lifecycle worker reconciles expired sessions once per second; submissions enforce server expiry even before the worker writes absence rows. Published timetable periods auto-start after a configurable 15-second grace using an assigned, enrolled coordinator’s capable registered phone. Automatic start is attempted only in the first two minutes of the period.

The existing portal now includes coordinator live counts/unmarked students, private student session history and faculty/academic-coordinator reports. Reports become available after the main window; they remain provisional during late recovery and become final when it ends. Web attendance views provide read-only access to mobile records.

For a sleeping backend, run tools/attendance-keep-warm.mjs from a separate awake computer with the real HTTPS /api address. Keep the backend and database running before and during classes. See [Stage 6 files, API contracts, migration and hosting instructions](../../docs/mobile-attendance-stage-6.md). No production migration, uptime, full APK or real-phone classroom result is claimed. Stage 7 awaits approval as requested.

## Stage 7 validation

See [the database load report and reproducible runner](../../docs/mobile-attendance-stage-7.md) and [physical phone acceptance checklist](../../docs/mobile-attendance-phone-tests.md). Local simulations exercise actual routes and SQL with synthetic face/Google proofs; phone and classroom results remain pending.

## Default class attendance

The coordinator attendance screen uses the server-assigned year and section. Tap Start attendance after choosing a duration; no subject or timetable period is required. The backend checks coordinator assignment, approved enrollment, bound device and Bluetooth capability, then sends notifications to the eligible class roster. Students complete the existing Bluetooth and face checks and see Attendance marked after the server accepts their submission.

Default sessions use an internal Default attendance subject per section so records and history remain separate from subject attendance reports. Only one mobile session may be open per section; another default session may start after it closes. Deploy the updated backend and install the rebuilt APK together. No database migration is required.
