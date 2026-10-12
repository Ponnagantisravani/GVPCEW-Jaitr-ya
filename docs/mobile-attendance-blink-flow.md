# Mobile enrollment and blink attendance

After login (including restoring an encrypted login), the app reads students.face_enrolled before exposing the dashboard. False opens mandatory registration; true opens the dashboard. Registration captures five front-camera frames across front/slightly-left/slightly-right poses, uses the same pinned MobileFaceNet implementation as attendance, averages and normalizes the embeddings, and uploads no images. The server chooses the student/roll from the authenticated account, stores the numeric template, binds the device, sets enrolled_at and face_enrolled, and completes registration immediately. Admin reset clears the template, binding, face_enrolled and enrolled_at. No password change or approval step is required for new registration.

Tapping a session notification records that session as opened. Bluetooth is caught and validated automatically. Only when both are available does the front camera open. The only action is blink: both eyes open → closed → open on one tracked face. Three fresh frontal embeddings immediately after that sequence are compared to the account's own template on the phone. Matching uses the server-configured calibrated threshold. No attendance button, QR code, typing, turn or smile challenge is used.

A mismatch displays “Face not recognized, try again” and automatically retries while the main 60-second window remains open, at most three times. The server caps issued challenges at three per student/session/method, so refresh/restart cannot reset the budget. A submitted mismatched face consumes its challenge. A successful server response closes capture and displays green “Attendance marked”.

The server independently recomputes cosine similarity and validates challenge/liveness declaration, BLE token, server deadlines, own roster and section, enrolled device, request-bound Play Integrity and uniqueness. It rechecks enrollment and session state under transaction locks before inserting; a unique student/session record prevents duplicate accepted attendance. Existing late recovery and reporting remain available, using blink capture too.

## Activate the update

For an existing mobile database, from the project root:

    npm.cmd --prefix backend run db:migrate:mobile-blink

Restart the backend and rebuild/reinstall the Android app. Apply the prior mobile migrations first on a fresh database. Existing face flags and templates are preserved. The HTTPS address remains editable at login; replace the requested Render placeholder with the real deployed address. Firebase notification configuration, Play Integrity and a calibrated MOBILE_FACE_THRESHOLD remain required.

## Verification

Full backend suite: 47 tests passed. Full mobile suite: 46 tests passed. TypeScript and the pinned model verification passed. Native JVM tests: 11 passed, including open/closed/open ordering, tracking changes, eye probability failures and expiry. Nine current camera/model/integrity Kotlin source files compiled in the isolated Android camera target. This compile does not include the React Native bridge/notification integration.

The migration was prepared but not applied to the campus database. No full APK or physical phone test is claimed: the existing Android installation still lacks complete NDK/React Android dependencies. Test notification taps, real blink recognition, mismatched faces and Bluetooth proximity on Android before classroom use. The browser demo remains unchanged.
