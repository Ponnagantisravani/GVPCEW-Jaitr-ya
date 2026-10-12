# Attendance camera entry

Student Attendance has a Start Face Verification button. In the Android app, this unlocks the same automatic verification path as a notification tap; camera capture waits for a valid classroom BLE receipt. Existing own-face comparison, blink, device, session and server checks remain in place.

In the enabled local browser demo, the button opens a front-camera dialog, captures a four-second blink sequence automatically, displays matching, and shows success only after the server confirms face_verified, blink_observed and PRESENT/LATE. Closing, navigating away or losing eligibility stops camera tracks and cancels pending requests. Three capture attempts are allowed per session in the mounted demo view. The production Android/server attempt limit remains authoritative.

A local session alert appears across student and student coordinator dashboard screens. Tapping it opens the same camera dialog. Optional browser notifications work while the dashboard is open; permission is requested only by the Enable attendance notifications button. They are not background push for a closed browser.

The local demo uses its separate saved face reference and webcam heuristic detector; it does not test Bluetooth or production anti-spoofing. First-time local reference capture still requires consent.

Validation: frontend tests and production build passed; Android TypeScript passed and AttendanceHome tests covered both entry paths. Isolated headless Chrome UI checks used a continuous mock camera and mocked server decisions to verify entry, automatic capture, success, mismatch rejection, stream cleanup and 390px layout. Physical webcam identity recognition and Android hardware behavior were not validated by these UI mocks.
