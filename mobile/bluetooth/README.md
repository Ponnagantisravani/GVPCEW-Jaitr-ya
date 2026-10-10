# BLE Attendance Prototype

## Portal automatic attendance integration

The `testing` module contains the Bluetooth relay and camera quality flow. The
portal-side integration is deliberately fail-closed: a coordinator must start
a `face_bluetooth` attendance session, the student must complete the short
random movement challenge, and the configured verifier must confirm both the
enrolled identity and liveness before the server writes attendance. A session
code alone cannot mark a face-Bluetooth session. Configure
`ATTENDANCE_VERIFIER_URL` and `ATTENDANCE_VERIFIER_KEY` on the backend, run the
`database/bluetooth-attendance.sql` migration, and use HTTPS for the portal API.

The verifier response must include `identityVerified`, `livenessVerified`, the
challenge and student IDs, the evidence digest, and a bounded
`verifierVersion`. The server also limits attempts, binds captures to the
student and paired device, expires challenges, and returns an idempotent receipt
for interrupted Bluetooth replies.

The separate **GVPCEW Testing** app is in the `:testing` module. See
[Quick attendance](testing/QUICK_ATTENDANCE.md) for its simplified student and
coordinator flow, Bluetooth photo transfer, approval records, and device tests. See
[its setup and physical-device test guide](testing/README.md) for notification,
alarm, reminder switches, diagnostics, and Bluetooth testing.

A small Kotlin/XML Android app to test whether one physical Android phone can
detect a Student ID advertised by another. No Bluetooth Classic pairing, GATT
connection, backend, database, login, authentication, Firebase, or Internet permission.
This is a standalone experiment, not the full GVPCEW app.

## Requirements

- Two physical Android phones running Android 8.0 (API 26) or later, with BLE.
- The Student phone must support BLE peripheral advertising. Some phones support
  scanning but not advertising; the app checks and displays an explanation.
- Bluetooth enabled on both phones. Location enabled on the Coordinator phone.
- Keep both apps visible. Active sessions keep the screen awake; Home, locking,
  switching apps, or rotation stops the session. Press Start again after returning.
- For building: Android Studio supporting AGP 8.9.2 or newer, an SDK installation
  with Android SDK Platform 35, Build-Tools 35.0.0, and Platform-Tools.
- JDK 17 or 21. Gradle 8.11.1 is supplied through the wrapper; do not install Gradle
  separately. The first build needs Internet access to download build dependencies.

## Phone compatibility

The APK supports Android 8.0 (API 26) and newer devices with a camera and
Bluetooth Classic. Android 12 and newer require the Nearby devices permission;
older Android versions also require Location permission for discovery. Some
phones can scan but cannot advertise or host an RFCOMM server, so the app checks
capabilities before a class is opened and shows a retry or coordinator-device
message instead of recording incomplete attendance.

iPhones cannot install this Android APK. iPhone support requires a separate iOS
client using Apple's Core Bluetooth APIs and a shared HTTPS attendance flow. A
student without a compatible Bluetooth phone must use the portal's supervised
attendance fallback; proximity alone never records attendance.

## Project structure

```text
bluetooth/
├── .gitattributes
├── .gitignore
├── README.md
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradlew
├── gradlew.bat
├── gradle/wrapper/
│   ├── gradle-wrapper.jar
│   ├── gradle-wrapper.properties
│   ├── distribution.sha256
│   └── wrapper.sha256
└── app/
    ├── build.gradle.kts
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/example/bleattendance/
        │   ├── BleProtocol.kt
        │   └── MainActivity.kt
        └── res/
            ├── layout/activity_main.xml
            └── values/strings.xml
```

`local.properties`, build outputs, and the debug signing key are generated locally.
No missing service implementation or external BLE library is required.

## Open and build in Android Studio

1. Open Android Studio → **Open** → select this `bluetooth` folder (the folder
   containing `settings.gradle.kts`, not the `app` subfolder).
2. In **Tools → SDK Manager**, install **Android SDK Platform 35**. In **SDK Tools**,
   enable **Show Package Details**, then install **Android SDK Build-Tools 35.0.0**
   and **Android SDK Platform-Tools**. Accept the SDK licenses.
3. Under **Settings → Build, Execution, Deployment → Build Tools → Gradle**, select
   an installed JDK 17 or 21 as the **Gradle JDK**. Use the project Gradle wrapper.
4. Let Gradle sync finish. Android Studio normally creates `local.properties`
   pointing to the installed SDK. If prompted, set the SDK path shown in SDK Manager.
5. Open the Android Studio terminal at the project root. On Windows PowerShell run:

   ```powershell
   .\gradlew.bat :app:assembleDebug :app:lintDebug
   ```

   On macOS/Linux run:

   ```sh
   chmod +x gradlew
   ./gradlew :app:assembleDebug :app:lintDebug
   ```

6. The installable debug APK is `app/build/outputs/apk/debug/app-debug.apk`.
   Lint results are in `app/build/reports/lint-results-debug.html`.

If the terminal cannot find Java, set `JAVA_HOME` to your installed JDK directory
(not its `bin` subfolder), and add its `bin` folder to `PATH`. Android Studio's
Gradle JDK setting and the terminal's Java setting are separate.

## Open and build in VS Code

VS Code edits the project; the Android SDK, JDK, and Gradle wrapper build it.
The simplest setup is to install the SDK using Android Studio's SDK Manager first.

1. VS Code → **File → Open Folder** → select `bluetooth`.
2. Create `local.properties` in the project root, using the actual SDK path shown
   in SDK Manager. On this Windows account the usual path is:

   ```properties
   sdk.dir=C:/Users/SRAVANI/AppData/Local/Android/Sdk
   ```

3. In the VS Code PowerShell terminal, set Java if necessary. This machine's
   currently detected JDK is:

   ```powershell
   $env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot'
   $env:Path = "$env:JAVA_HOME\bin;$env:Path"
   java -version
   .\gradlew.bat :app:assembleDebug :app:lintDebug
   ```

   Substitute your own JDK directory on another machine. macOS/Linux users set
   `JAVA_HOME` to their JDK, set `sdk.dir` to their SDK, and run the Unix commands above.
4. Use the same APK path and installation steps below. No VS Code extension is
   required to build from the terminal.

## Install on both phones

### USB / adb (repeat for both phones)

1. On each phone, enable Developer options by tapping **Build number** seven times
   in Settings → About phone (some manufacturers put it under Software information).
   Enable **USB debugging** in Developer options.
2. Connect both phones by USB and accept each phone's USB debugging authorization.
3. In PowerShell, point to Platform-Tools and list devices:

   ```powershell
   $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
   & $adb devices -l
   ```

   If your SDK lives elsewhere, change `$adb` accordingly. Each phone must show
   `device`, not `unauthorized` or `offline`.
4. Replace `STUDENT_SERIAL` and `COORDINATOR_SERIAL` with the serials from that list:

   ```powershell
   & $adb -s STUDENT_SERIAL install -r .\app\build\outputs\apk\debug\app-debug.apk
   & $adb -s COORDINATOR_SERIAL install -r .\app\build\outputs\apk\debug\app-debug.apk
   ```

5. Open **BLE Attendance Prototype** from each phone's app launcher. USB can now
   be unplugged; the test requires no computer or network.

Alternatively, copy `app-debug.apk` to each phone, open it in the phone's file
manager, allow that file manager to install unknown apps if prompted, and tap Install.
If an existing APK was signed with a different computer's debug key, uninstall
the previous prototype and reinstall (this app has no stored attendance data).

## Run the two-phone test

1. Place the phones approximately 1–2 metres apart. Turn on Bluetooth on both.
   Enable Location in the Coordinator phone's Settings.
2. **Student phone:** choose **Student Mode**, enter `23CSE001`, and tap
   **Start Attendance**. On Android 12+, allow **Nearby devices**. Wait for
   `Advertising Student ID: 23CSE001`. A starting message alone does not confirm success.
3. **Coordinator phone:** choose **Coordinator Mode** and tap **Start Scan**.
   Allow **Nearby devices** on Android 12+. Allow **Location while using the app**;
   choose **Precise** when offered. The app requests Location because detecting
   attendance implies nearby presence. It never requests GPS coordinates.
4. Keep both apps open. `23CSE001` should appear in the detected students list
   within the 60-second scan, normally within a few seconds. Seeing it means
   the Coordinator received that Student ID over BLE.
5. Leave advertising running and observe repeated broadcasts: the list must still
   contain only one `23CSE001` row.
6. Press **Stop** on the Coordinator. Results remain visible. Press **Start Scan**
   to clear the previous list and start a fresh 60-second scan.
7. For a negative check, stop the Student first, wait a few seconds for queued
   radio results to drain, then start a fresh Coordinator scan. The old ID should
   not reappear. Old entries do not disappear from a scan's historical list.
8. Restart Student advertising as `23CSE002`; confirm that ID appears in a new scan.
   Swap phone roles and repeat if both phones support advertising.

## Additional checks and troubleshooting

| Check / symptom | Expected behavior or action |
| --- | --- |
| Empty ID, spaces inside ID, non-ASCII characters, more than 10 characters | Student displays validation error before advertising. |
| Lowercase ID | Normalized to uppercase; surrounding whitespace trimmed. |
| Two phones advertise the same ID | One row by ID; this is not a unique-person guarantee. |
| Permission denied | Explanatory status; retry Start or enable permissions under Settings → Apps → BLE Attendance Prototype → Permissions. |
| Approximate location only | Grant precise Location to the Coordinator. |
| Bluetooth switched off mid-session | Session stops; enable Bluetooth and press Start. |
| Advertising unsupported | Swap roles or use another Student phone; scanning support alone is insufficient. |
| Student never leaves “Starting advertisement” | Toggle Bluetooth and retry; try another phone if the OS does not complete its advertising callback. |
| No IDs found | Confirm Student says “Advertising”, both apps stay visible, permissions and Location are on, and phones are close; try swapping roles. |
| Scan failed / repeated rapid Start-Stop | Wait at least 30 seconds before retrying. Android can throttle repeated scan starts. |
| App backgrounded / phone rotated / screen locked | BLE stops; return and press Start again. |
| Scan reaches 60 seconds | Stops automatically and retains results; Start Scan begins an empty new list. |

## How the BLE code works

`BleProtocol.kt` defines the shared custom service-data UUID
`a31f7201-8e9b-4b35-93f0-67ed21c409aa` and the ID encoder/validator.
An ID contains 1–10 ASCII letters, digits, `_`, or `-` after uppercase normalization.

`MainActivity.startAdvertising()` broadcasts the ASCII ID under that 128-bit UUID
using `AdvertiseData.addServiceData()`. The primary legacy advertisement contains
everything needed: 2 AD header bytes + 16 UUID bytes + up to 10 ID bytes, with 3
bytes reserved for flags, at most 31 bytes. Device name, TX power data, and a
separate service UUID list are intentionally omitted to fit the packet. There
is no GATT characteristic to connect to: service data itself carries the identifier.

`startScanning()` filters with `ScanFilter.setServiceData()` using that same UUID,
reads `ScanRecord.getServiceData()`, validates the bytes, and adds each ID to a
`LinkedHashSet`. It updates the simple list only for newly detected IDs and rejects
callbacks from old sessions. Do not change this filter to `setServiceUuid()`:
that matches a separate advertised UUID list, which this packet does not contain.

The app requests runtime permissions per mode, checks adapter state, reports
asynchronous advertising/scanning failures, and releases BLE callbacks on Stop
or when leaving the foreground. Legacy Bluetooth permissions are capped at API 30.
`BLUETOOTH_CONNECT` permits adapter checks on Android 12+; it does not mean pairing.
No background service or background Location permission is needed.

This verifies radio detection only. IDs are broadcast in plaintext and are
self-declared; anyone running the prototype can copy an ID. Detection does not
authenticate a student or prove classroom presence. The list means “seen during
this scan”, not “still nearby”. Radio range and reliability depend on the phones
and environment; this prototype makes no distance measurement.

## Verification status

All three XML files passed parsing checks. The official Gradle wrapper JAR's
SHA-256 matches Gradle's published checksum, and the Gradle distribution checksum
is pinned in `gradle-wrapper.properties`.

The source and XML are supplied for a physical-device experiment. This workspace
has Java but no detected Android SDK or connected test phones. APK compilation,
Android lint, and over-the-air detection must be verified using the steps above;
they are not claimed to have passed here.

## Android references

- [BLE permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)
- [BLE advertising API and packet limit](https://developer.android.com/reference/android/bluetooth/le/BluetoothLeAdvertiser)
- [Finding BLE devices and bounded scanning](https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices)
- [Scan filter service-data matching](https://developer.android.com/reference/android/bluetooth/le/ScanFilter.Builder)
- [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes)
