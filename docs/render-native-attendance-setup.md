# Native attendance with Render and Neon

The Android app defaults to https://gvpcew-jaitr-ya.onrender.com/api.
Native enrollment uses the bundled MobileFaceNet model and numeric template uploads;
it does not call the website's /auth/analyze-face route or require FACE_API_URL.
The website face enrollment flow still requires its separate face service.

## Before student testing

1. Deploy this backend version and run `npm run db:migrate:production` against the intended Neon database. Do not use db:init on production.
2. Provision an administrator and approve/assign student and coordinator roles. Website signup creates an account without assigned portal roles; such accounts cannot log into the native app until approved. Native enrollment is a separate gate after approved login.
3. Install the test APK on a real Android phone. Sign in with an approved account, accept consent, and complete native enrollment. No computer needs to stay running.
4. Configure Firebase Android package `com.gvpcew.attendance`, put google-services.json in mobile/attendance/android/app, and rebuild. Configure FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON only on the backend.
5. Configure Google Play Integrity, the recognized application/signing certificate, and backend PLAY_INTEGRITY_* settings. The current implementation requires PLAY_RECOGNIZED; a directly shared APK alone does not establish that status. Missing integrity configuration blocks attendance.
6. Calibrate MOBILE_FACE_THRESHOLD on representative phones and students. Do not invent a threshold or use the development fake face detector.
7. Assign section rosters and published coordinator timetable periods. Test enrollment, blink challenge, BLE proximity, submission, expiry, duplicate attempts, and account/device isolation on real phones.
8. Run a controlled 70-student test against the actual hosted services before class distribution. Prior local load results do not certify Render/Neon capacity or hosting uptime.

## Verified during this update

- TypeScript check passed.
- Bundled face model checksum and tensor contract passed.
- Android app JavaScript tests: 49 passed.
- Backend mobile attendance tests: 31 passed; these are automated tests, not physical recognition or hosted load tests.
- Firebase Android configuration was supplied and verified for project `gvpcew-47505`, Cloud project number `874430200553`, package `com.gvpcew.attendance`. Google Play account ownership and remote backend secret values have not been checked.

Release signing material is local in .release; keep it private and backed up.
