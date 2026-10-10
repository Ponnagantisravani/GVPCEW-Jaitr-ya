# Two-tab webcam preview

From the project folder run `node preview/start.mjs`. Keep that terminal running.

1. Open http://localhost:4173/?role=coordinator and click Open class.
2. Open http://localhost:4173/?role=student in another tab of the same browser.
3. Enter an ID, click Mark attendance, and allow Camera.
4. Click Capture photo & mark. The coordinator receives the photo and ID.

Use localhost URLs, not the HTML file directly. The camera is real, but Bluetooth and attendance are a local demo. Capture is manual; there is no face detection or identity matching. Photos are held in server memory, cleared when a new class opens or the server stops. Duplicate IDs update the existing record within that class. Classes expire after five minutes. The listener is local to this computer; another phone cannot use these URLs.

A student has 40 seconds to capture after starting; permission setup may require a retry. Camera availability and ten-student completion time require physical-device testing. The backend concurrency test is not a webcam throughput test.

Checks: `node --test preview/server.test.mjs` and `node --check preview/app.js`.

## Notification and alarm preview

Refresh either localhost tab, then open Reminders. Test notification requests desktop notification permission and always shows an in-page reminder. Test alarm in 5 seconds enables audio and schedules gentle beeps for up to 15 seconds. Cancel alarm, Stop alarm, closing the panel, or leaving the page stops the alarm. Keep the browser tab open; these tests do not provide background Android alarms or closed-browser delivery.
