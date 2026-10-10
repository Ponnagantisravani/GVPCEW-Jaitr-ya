# Bluetooth attendance with coordinator approval

Install version 1.2 (`testing-debug.apk`) on both coordinator and student phones.
This guide describes the Android app. The browser preview is a separate demo.

## Setup and use

1. Turn Bluetooth on and pair each student phone with the coordinator once in
   Android Bluetooth settings. Confirm pairing on both phones.
2. Coordinator: open **Coordinator: review attendance**, allow Nearby devices,
   then tap **Open class**. Keep this screen visible.
3. Student: tap **Choose paired coordinator**, allow Camera and Nearby devices,
   and select the correct coordinator phone. Enter the student ID.
4. Tap **Capture & submit for approval**. The app connects to that phone's open
   class, opens the front camera, and captures after a stable face is detected.
5. The photo is sent by Bluetooth. The student sees **Pending coordinator
   approval** only after the coordinator has saved it.
6. The coordinator sees each student's ID, photo, submission time, class and
   status. Review the face, choose **Accept - Mark attendance** and confirm,
   or **Reject**. Only Accept changes the record to **Attendance marked**.
7. Students tap **Check coordinator decision** to retrieve the saved decision.
   Both phones need Bluetooth on and the coordinator screen must remain open.
   Rejection leaves attendance unmarked; the student can capture and submit again.

## Sessions, retries and saved records

**Close submissions** stops new captures/uploads while allowing decisions to be
retrieved. Leaving the coordinator screen pauses Bluetooth reception. Reopen the
screen and tap **Open class** to resume the same saved class. **Start a new class**
creates a separate class; all earlier reviews remain saved. Use Previous/More
reviews to browse the full list, ordered with pending submissions first.

Uploads have a 30-second connection/transfer timeout. If transfer is interrupted,
the student's photo remains available with **Retry sending photo**. Retries use
the same submission ID: a lost acknowledgement cannot create another record or
reset an accepted decision. Discarding the student's retry copy does not delete a
submission already received by the coordinator.

A student ID can have only one pending or accepted submission per class. Rejected
submissions remain in the history and allow another attempt. Decisions and photos
are saved in the coordinator's app-private `coordinator_reviews` directory.
Student receipt metadata and an unsent photo, if any, survive app restarts.
Successful transfer removes the student's temporary photo. Older version 1.1
photos stay on their original phones and are not automatically sent or accepted.

This uses Bluetooth Classic RFCOMM with authenticated paired sockets, following
[Android's Bluetooth connection APIs](https://developer.android.com/develop/connectivity/bluetooth/connect-bluetooth-devices).
The earlier BLE classroom advertisement is no longer the attendance transfer
mechanism. No Wi-Fi, internet, computer or cloud service is required. The
Bluetooth protocol accepts JOIN, SUBMIT and STATUS requests, never approval
commands. Requests and status reads are bound to the sending paired device.
Choose the correct coordinator phone: there is no college login or central roster,
and face detection does not verify identity. The coordinator checks the face/ID.

Photos are resized to at most 640 pixels on their longest side. The receiver
limits photo size and dimensions, processes at most three transfers concurrently,
and closes stalled sockets. Extra/busy connections may need Retry. Ten phones
can take photos independently, but simultaneous Bluetooth transfer support and
completion times depend on the phones and are not guaranteed. Storage is bounded
to 500 review records; nothing is silently deleted. Uninstalling clears app data.

## Verification

Run `./gradlew :testing:assembleDebug :testing:testDebugUnitTest :testing:lintDebug`
(use `gradlew.bat` on Windows).

APK: `testing/build/outputs/apk/debug/testing-debug.apk`.

Unit tests cover pending/accepted/rejected transitions, durable decisions,
retries, ten concurrent logical student submissions, duplicate IDs, class changes,
wrong-device status requests, forbidden remote approval, oversized payloads and
truncated photo transfers. They do not measure physical Bluetooth or camera use.

Use two physical phones to verify:

- Pair, open class, submit an ID and face, and see that exact photo on coordinator.
- Before acceptance, confirm no marked attendance appears on either phone.
- Accept and check the student decision; repeat with Reject and a fresh capture.
- Close/reopen both apps and confirm the photo, decision and class are retained.
- Interrupt a transfer, retry, and confirm one record and the original decision.
- Close submissions or start another class during capture; old uploads must fail.
- Rotate during permission prompts, capture, transfer and review; keep decisions.
- Deny Camera/Nearby devices or turn Bluetooth off; show an error without marking.
- Try reading another phone's receipt from a different paired phone; refuse it.
- Repeat with ten physical student phones, recording retry counts and timings.
