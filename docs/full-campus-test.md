# Full campus Android test

The app opens the existing student, student coordinator, faculty, academic coordinator and administrator portals for roles assigned to the signed-in account. Native Bluetooth scanning, broadcasting, blink verification and face enrollment remain in the same app.

## Server address

The Campus HTTPS address is the public backend address ending in `/api`. It is not the college website or email address. No public backend has been deployed yet. Do not invent an address. Render must serve both the backend and the built frontend; the backend Dockerfile prepares both.

## Attendance test

1. Configure the deployed HTTPS backend and Firebase/Play Integrity integration before installing on the class phones.
2. Assign the correct account roles, academic section, subject, faculty email and published timetable. Enroll and approve each student's phone and face.
3. In the student coordinator dashboard, select the subject and period, set the duration, and start attendance. Open the native Bluetooth attendance screen to broadcast.
4. Students open their student dashboard and select Bluetooth attendance verification. Nearby detection and the native face challenge submit verified attendance to the shared backend.
5. Faculty open Attendance, select the same subject, date and period, and refresh the report. Students can review their attendance in their own dashboard; the coordinator can view and end the same session.

The APK is development signed. Local simulations use synthetic Google verdicts and face templates; they do not establish physical Bluetooth range or the capacity of an undeployed cloud server. Public hosting, real Firebase/Play configuration and physical phone testing remain required before distributing it to 70 students.
