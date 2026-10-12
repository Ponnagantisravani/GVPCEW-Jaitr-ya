For testing entirely in your desktop browser, follow [the local browser demo steps](local-attendance-demo.md).

# Local attendance walkthrough

## Start the portal and API

Start PostgreSQL. In backend/.env set your existing local DATABASE_URL, DATABASE_SSL_MODE=disable for local PostgreSQL, a unique JWT_SECRET, PORT=4000 and the required service settings from .env.example. Keep credentials private. Do not run db:init against your existing database.

From the repository root, open two PowerShell terminals:

```powershell
npm.cmd --prefix backend run dev
```

```powershell
npm.cmd --prefix frontend run dev
```

Open http://localhost:5173. The development frontend proxies /api to the local API. Apply the production and four mobile migrations to your intended test database if they have not already been applied; see README.md and mobile/attendance/README.md for setup requirements. Use approved accounts with the correct section and coordinator assignment. Use separate browser profiles or an incognito window for the student account because portal login state uses local storage.

## Current working flow

1. In the web portal, sign in as the student coordinator and open Attendance. The mobile attendance panel monitors sessions, countdown, marked totals and unmarked/absent students.
2. On the coordinator's enrolled, approved Android phone, sign in to the campus attendance app and start the current eligible class session. The bound phone broadcasts rotating Bluetooth tokens. The coordinator must also complete their own face verification.
3. On an enrolled student's Android phone, open the attendance session, receive a valid nearby Bluetooth token, complete the random face liveness action, and submit. The backend verifies the challenge, identity, device, embedding, integrity proof, section and deadline before storing PRESENT.
4. In a separate browser profile, sign in as that student and open Attendance. My mobile attendance displays the saved result; Refresh history updates it immediately (otherwise polling refreshes it).
5. Watch coordinator totals update. At 60 seconds, the backend closes the main session and materializes ABSENT for eligible unmarked students. The Android app offers an explicit two-minute late check-in with fresh face verification; successful recovery is LATE and flagged for teacher review.

## Browser-only testing limitation

The current web coordinator panel has no mobile-session Start button, and the student web panel is attendance history. Bluetooth broadcasting and face check-in are implemented in Android. Logging in to the two web dashboards alone does not exercise real mobile attendance. A browser demonstration would need a separately labelled demo flow; its results cannot establish real Bluetooth or face verification.

The Android APK build and physical test setup remain pending. The saved Render URL is a placeholder: replace it with an actual HTTPS API URL reachable from the phones and configure Firebase, Play Integrity and a calibrated model threshold as documented in the mobile README. localhost on a phone refers to that phone, not the computer.
