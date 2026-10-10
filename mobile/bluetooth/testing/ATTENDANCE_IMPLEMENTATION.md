# Attendance implementation and verification

## Inspection before changes

The repository contains two Android modules using Kotlin and platform views:

- `:app`: the original, foreground-only BLE experiment. The student broadcasts
  a ten-byte ID; a coordinator scans and deduplicates it for up to 60 seconds.
- `:testing`: an Activity-built testing dashboard, a copy of that BLE experiment,
  notification channels, an AlarmManager scheduler, an alarm playback service,
  and SharedPreferences for reminder switches, logs, local approvals and simulated IDs.

The old camera code only launched another camera app with ACTION_IMAGE_CAPTURE
and displayed its thumbnail. There was no in-app preview, front-camera guarantee,
face detector, recognition model, face enrollment, liveness check, or camera
analysis pipeline to tune. No API client, backend URL, authenticated account,
student profile, server attendance history, or server duplicate prevention exists.
Consequently there was no existing backend functionality to remove or repair.

## Changes

`DashboardActivity` is the new launcher. `AttendanceUi` provides consistent
Material buttons, cards, type, system-bar/keyboard insets and scrollable layouts.
The dashboard uses the entered student ID only. It does not invent a student
name, percentage, history or today's attendance status. Existing tools are still
available through Device checks & reminder tests; their storage is unchanged.

`AttendanceActivity` presents ID entry, bounded classroom search, and an automatic
camera check. `StudentId` centralizes validation while preserving the existing
BLE packet limit. IDs survive navigation and recreation. A classroom observation
expires after two minutes before the final step. Cancellation, settings links,
permission denial, disabled radios, timeout and retry have explicit UI states.

`FaceCameraActivity`, `FaceCameraSession`, `FaceGuideView`, and `FaceQualityPolicy`
replace the thumbnail intent with CameraX 1.4.2 and bundled ML Kit 16.1.7:

- Front camera only, with lifecycle binding and permission/initialization errors.
- PreviewView and MlKitAnalyzer use view-referenced coordinates for the face oval,
  including rotation, crop and front-camera mirroring. The analyzer forwards
  CameraX's transform rather than guessing a scale from screen dimensions.
- FAST detection, landmarks and tracking, no contour-only single-face mode.
- One face must fit the oval, occupy an acceptable size, face forward, expose
  the expected landmarks, and remain acceptable for 1.2 seconds. Losing the face,
  changing tracking ID or a long gap resets that hold. This is not liveness.
- A sampled central Y-plane average gives approximate lighting guidance. This
  is a heuristic and is not calibrated exposure measurement or skin classification.
- KEEP_ONLY_LATEST analysis and a 160 ms interval bound processing. Skipped frames
  are closed immediately. MlKitAnalyzer closes accepted ImageProxy objects after
  asynchronous processing, including detector errors. No frame-to-bitmap loop.
- Camera closes on pause and completion; detector and executor are released.
  A twelve-second no-feedback watchdog offers recovery instead of infinite loading.
- Frames remain in memory. The app does not save photographs, face embeddings or
  upload images. Detection does not identify or authenticate a student.

`ClassroomBleSession` adds a separate classroom access test, using service-data
UUID `a31f7202-8e9b-4b35-93f0-67ed21c409aa`. `CoordinatorActivity` broadcasts an ID
from the existing local approved list. A student's scanner requires the exact ID.
The advertisement contains no device name or extra UUID list, keeping it within
legacy BLE's 31-byte limit. Searches stop after 20 seconds, advertising startup
times out after 10 seconds, and coordinator sessions stop after five minutes.
Callbacks from stopped sessions are ignored. Leaving the activity closes radios.

This is an unauthenticated BLE advertisement, not a GATT connection, signed
approval, distance proof, or access-control boundary. A copied signal can be
replayed. There is no connection-success claim because there is no connection.
The original UUID, BLE experiment, notification/alarm services and test records
are preserved. Local simulated records are never shown as college attendance.

`AttendanceRepository` defines the submission boundary. Its only concrete
implementation is `UnconfiguredAttendanceRepository`, which always returns
NotRecorded, even after face detection and BLE discovery. No frontend action
creates a real attendance record. The final screen explains what remains
unavailable and returns to the dashboard. A working backend and recognition
adapter are prerequisites for a genuine success screen, profile/history display,
server authorization, enrollment, duplicate prevention and production deployment.

## Build

Use JDK 17/21, SDK Platform 35 and the checked-in wrapper. From the repository root:

```powershell
.\gradlew.bat :testing:assembleDebug :testing:testDebugUnitTest :testing:lintDebug :app:assembleDebug --console=plain
```

APK: `testing/build/outputs/apk/debug/testing-debug.apk`.
Unit results: `testing/build/reports/tests/testDebugUnitTest/index.html`.
Lint: `testing/build/reports/lint-results-debug.html`.
Dependencies require network access for the first build. The face model is
bundled, so the installed detector does not require a first-use model download.

## Two-phone acceptance test

1. Install the same testing APK on two Android 8+ phones:
   `adb -s SERIAL install -r testing/build/outputs/apk/debug/testing-debug.apk`.
   Launch `adb -s SERIAL shell am start -n com.gvpcew.testing/.DashboardActivity`.
2. On phone A, open Coordinator workspace > Manage student access. Add an ID such
   as `23CSE001`. Return to Coordinator workspace, enter that ID, allow Nearby
   devices when requested and open the classroom session. Wait for Session open.
   Keep this screen foregrounded. If advertising is unsupported, swap phone roles.
3. On phone B, tap Mark Attendance, enter the same ID, and Continue. Allow Nearby
   devices and precise Location; turn on Bluetooth and Location. Stay near A.
   A matching classroom signal should open B's front camera automatically.
4. Allow Camera. Test no face, two people, too far/close, off-centre, partial face,
   turned head and dim/strong lighting. Each should guide the student without
   accepting the attempt. Use an evenly lit, centred face for the steady hold.
5. The expected final result is **Attendance not recorded**, with Face detected.
   No backend is configured. Do not treat this as a successful attendance test.
6. Return to the dashboard. No percentage, new history or marked status should be
   fabricated. Repeating the flow must still create no attendance record.
7. Stop A's session and search again on B: it must time out with a retry action.
   Try a different ID on B, deny permissions, switch Bluetooth off mid-scan,
   disable Location, press Home, lock, rotate, cancel the camera and reopen it.
   Check large font sizes, small screens and TalkBack feedback as well.
8. Test Check camera directly for camera behavior without requiring BLE.
9. The original student-advertises/coordinator-scans test remains accessible from
   Original Bluetooth discovery test. Its UUID is separate from the new flow.
10. Repeat the notification/alarm acceptance matrix in README.md after upgrading.

## Verification boundaries

Unit tests cover face-quality geometry, scale independence, multiple faces,
distance, pose, lighting, missing landmarks, continuous hold resets, student ID
validation, exact BLE payload matching and the fail-closed attendance boundary.
These do not validate ML inference accuracy or physical radios. Record device
models, Android versions and outcomes when performing the acceptance test.

No connected phone or configured emulator was available during implementation.
Camera initialization, detector accuracy, BLE interoperability, accessibility
and layout appearance on an Android device require the physical checks above.
Backend success/duplicate tests cannot be performed until the real API exists.

## Official implementation references

- [CameraX ML Kit Analyzer](https://developer.android.com/media/camera/camerax/mlkitanalyzer)
- [ML Kit face detection for Android](https://developers.google.com/ml-kit/vision/face-detection/android)
- [CameraX releases](https://developer.android.com/jetpack/androidx/releases/camera)

CameraX 1.4.2 is pinned to retain the existing compileSdk 35 toolchain; this change
does not upgrade unrelated project tooling to the newest release.

## Build result (6 September 2026)

The final Gradle command completed successfully for both APKs, the testing module's
unit tests, and Android lint. All 16 tests passed: 11 face-quality tests, 3
attendance-boundary tests and 2 existing reminder-policy tests. Lint completed
with no errors; warnings remain. APK Signature Scheme v2 verification passed.
The packaged launcher is DashboardActivity; version 1.1 supports Android 8+.
These are build and unit-test results, not a physical-device certification.

## File inventory

New Kotlin files under `testing/src/main/java/com/gvpcew/testing/`:
`DashboardActivity`, `AttendanceUi`, `AttendanceActivity`, `StudentId`,
`AttendanceRepository`, `FaceCameraActivity`, `FaceCameraSession`, `FaceGuideView`,
`FaceQualityPolicy`, `CoordinatorActivity`, `ClassroomBleSession`, `ClassroomSignal`.

Updated Kotlin files: `MainActivity` (tool routing and camera replacement),
`BleProtocol` (shared ID validation with the same wire format), and
`NotificationService` (notification opens the new dashboard).

Configuration: `testing/build.gradle.kts`, root `gradle.properties`,
`testing/src/main/AndroidManifest.xml`, `testing/src/main/res/values/styles.xml`.
Tests added: `FaceQualityPolicyTest.kt`, `AttendanceBoundaryTest.kt`.
Documentation: `testing/README.md` and this guide.
The original `app/` source files were not changed.
