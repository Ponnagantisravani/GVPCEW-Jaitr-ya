# GVPCEW Testing

The launcher offers automatic face attendance, college account and timetable
reminders, manual coordinator photo review, and alarm diagnostics. Follow the
[attendance and reminders setup guide](../../../docs/attendance-readiness.md)
for the portal integration, service configuration and physical acceptance tests.
The [pairing and review guide](QUICK_ATTENDANCE.md) covers the separate manual
photo-review flow. The remaining sections below describe the diagnostic screens.

A separate Kotlin Android application (`com.gvpcew.testing`) in the `:testing`
module. The existing `:app` BLE prototype is still available. Open the repository
root in VS Code; this project has already been created, so no scaffolding command
is needed.

The dashboard contains Bluetooth Attendance, Reminder Test, Notifications,
Alarms, and Permissions & Diagnostics. TEST MODE is always ON.

## Build, install, and launch from VS Code

Install JDK 17 or 21 and the [Android SDK](https://developer.android.com/studio).
In Android Studio's SDK Manager install Android SDK Platform 35, Build-Tools
35.0.0, Android SDK Command-line Tools (latest), and Platform-Tools. Finish the
SDK license prompts. Android Studio is needed only to set up the SDK; editing
and building can happen in VS Code.

Run in the VS Code PowerShell terminal at the repository root. Set the SDK path
to the location displayed by SDK Manager if it differs from the example:

```powershell
code .
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:PATH"
java -version
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" "platforms;android-35" "build-tools;35.0.0" "platform-tools"
.\gradlew.bat :testing:assembleDebug :testing:testDebugUnitTest :testing:lintDebug --console=plain
```

On a physical Android 8+ phone, enable Developer options and USB debugging,
connect USB, and accept the phone's debugging authorization prompt:

```powershell
adb devices -l
.\gradlew.bat :testing:installDebug
adb shell am start -n com.gvpcew.testing/.DashboardActivity
```

With several phones connected, use `adb -s SERIAL install -r
testing/build/outputs/apk/debug/testing-debug.apk` and `adb -s SERIAL shell am
start -n com.gvpcew.testing/.DashboardActivity` for each phone.

APK: `testing/build/outputs/apk/debug/testing-debug.apk`.
Unit results: `testing/build/reports/tests/testDebugUnitTest/index.html`.
Lint results: `testing/build/reports/lint-results-debug.html`.

## Device acceptance tests

First open Reminder Test, request notification permission and allow **Alarms &
reminders** through Check Alarm Permission. Return to the app. Check the
diagnostics screen for current permission/channel status and pending counts.

Repeat the following matrix with the app visible, after pressing Home, and
after locking the phone. Use **Test Reminder After 10 Seconds** for each row.

| Notifications | Alarms | Expected reminder output |
| --- | --- | --- |
| ON | ON | Notification and audible alarm |
| ON | OFF | Notification only |
| OFF | ON | Audible alarm only |
| OFF | OFF | No reminder; log records skipped test |

An audible alarm uses a media-playback foreground service. Android requires
its playback/Stop indicator independently of the reminder notification switch.
The alarm stops after 30 seconds, using Stop Ringing Alarm, its notification's
Stop action, or switching Alarms OFF. Alarm volume and Do Not Disturb remain
under the phone user's control.

Also verify:

1. Immediate notification and alarm buttons with each switch ON and OFF.
2. Ten-second and one-minute tests on each dedicated screen.
3. Select a future date/time and schedule a custom title/message. Past times
   must produce a clear error.
4. Schedule multiple tests and confirm separate notification IDs and pending
   counts. Overlapping audible alarms share one player and restart its timeout.
5. Cancel all tests of a kind before they fire; confirm silence and count zero.
   Combined reminders have their own cancellation button.
6. Switch a feature OFF after scheduling; it must be suppressed at delivery.
   Close/reopen the app and verify settings persist.
7. Deny notification permission or disable its channel in Android Settings.
   Notification tests should log the blockage; alarm-only tests still work.
8. Revoke exact-alarm access and try a delayed test. Expect an explanatory error,
   with no successful scheduling log. Immediate tests do not need this access.
9. Verify the posted notification visually and listen for sound. A log saying
   'posted to Android' does not prove that the user saw a notification.

For system evidence:

```powershell
adb shell dumpsys alarm | Select-String 'com.gvpcew.testing' -Context 2,4
adb shell dumpsys notification | Select-String 'com.gvpcew.testing' -Context 2,4
adb logcat -d -s AndroidRuntime
```

## Bluetooth scope

Open Scan Bluetooth / Detect Students. One phone chooses Student Mode and
advertises its student ID; another chooses Coordinator Mode and scans for up
to 60 seconds. Grant Bluetooth/location permissions and enable Bluetooth and
Location when prompted. Both screens must stay on. Leaving the screen stops
the scan/advertisement. Repeated IDs are deduplicated.

Connect is a documented placeholder for future GATT work. Android Bluetooth
settings are accessible, but there is no app-managed connection protocol.
Mark Test Attendance is explicitly a local simulation with manually entered
IDs, deduplication, and a clear button. It is not verified college attendance.

## Architecture and limits

`MainActivity` builds the test screens and navigation. `ReminderScheduler`
owns all exact scheduling and cancellation; quick and calendar-based tests use
the same `AlarmManager.setExactAndAllowWhileIdle` path. `ReminderReceiver`
delivers without needing the Activity. `NotificationService` owns channels and
posting. `AlarmService` owns foreground audio and Stop handling.
`SettingsStorage` persists switches, pending records, test attendance and a
bounded log. `ReminderPolicy` has unit tests for switch combinations.
`BluetoothActivity` and `BleProtocol` isolate the existing BLE experiment.

Android may throttle closely spaced idle alarms; ten seconds is a requested
deadline, not a timing guarantee. See the official
[alarm scheduling guidance](https://developer.android.com/develop/background-work/services/alarms).
Future alarms are restored after reboot, app update, exact-alarm permission grant,
and opening the launcher. Reopen a force-stopped app to restore future alarms.
Expired reminders are discarded. Pending counts describe locally registered
reminders, not an independent query of Android's alarm queue.

Compilation, Android lint and unit tests passed on 2026-09-13. The physical-device
acceptance matrix remains required; no phones were connected during these checks.
