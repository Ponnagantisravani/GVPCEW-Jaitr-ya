# Coordinator attendance time limit

In Student Coordinator → Attendance Session, enter Time limit (seconds) before Start demo session. 300 means five minutes. Allowed range: 30–1800 whole seconds; default: 60. The selected value is fixed when the session starts. Server timestamps control expiry and the student countdown; the existing two-minute late window follows that expiry.

Android coordinator start also submits the selected duration. The server generates eight-second Bluetooth token slots covering the full selected window, and notification TTL uses the remaining session time. Existing authorization, roster, face, blink, device and duplicate checks are preserved. Automatic timetable sessions retain their existing default duration.
