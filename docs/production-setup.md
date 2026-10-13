# Campus production setup

## Prepared locally

The full-campus APK and backend share all five assigned-role dashboards. The Docker image builds the frontend and backend together. The Render template includes health checks and production migrations. Release builds now require the campus release key rather than using Android's debug key.

The private signing files are in `.release/`, excluded from Git and Docker. Securely back up this directory. Never send its passwords or private key in chat. The public certificate fingerprint is recorded in `campus-release-certificate.json`. When using Play App Signing, configure the actual Play app-signing certificate on the backend; the local upload certificate can differ.

## Account setup still required

1. Connect the signed-in Render browser. Review the paid hosting plan before provisioning. Create a PostgreSQL database and the Docker web service from this project's repository; configure DATABASE_URL and allowed HTTPS origin. Run production migrations, populate real approved accounts, and verify `/api/health` before setting the APK address.
2. Create/select the user's Firebase project. Register Android package `com.gvpcew.attendance`. Download its public Android configuration to `mobile/attendance/android/app/google-services.json`. Enable FCM HTTP v1. Store the authorized backend service-account JSON only in Render secrets, using FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON.
3. Link the app and cloud project in Play Console, enable Play Integrity, and authorize its backend service account. Set PLAY_INTEGRITY_PACKAGE_NAME, PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER, PLAY_INTEGRITY_CERT_SHA256 and PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON in Render. The backend accepts colon-separated or plain SHA-256 hex fingerprints and Google's base64url form. Set MOBILE_FACE_THRESHOLD using real validation, not an invented accuracy claim.
4. Configure the real public HTTPS API address, then build a release APK/AAB with the local release signing key. Use Play's internal testing distribution for the initial test. The existing verifier requires PLAY_RECOGNIZED; an arbitrary unregistered WhatsApp APK can fail that check.

## Real-phone test (not yet run)

Connect an unlocked Android phone with USB debugging and authorize the computer. At least two nearby phones are needed to test advertising and scanning; student, coordinator and faculty accounts are needed for the complete report flow.

Verify notification permission and delivery, approved one-time face enrollment, binding to the enrolled phone, coordinator start, rotating Bluetooth detection, native blink challenge, saved student record, faculty report reflection, coordinator end, duplicate rejection, and expiry. Repeat across college Wi-Fi, mobile data and hotspot. Then run the 70-phone classroom test and measure actual verification latency and missed detections. Local simulations do not replace these tests.

Current blockers: no connected hosting browser, no supplied Firebase/Play project, and no Android devices visible to adb. No paid hosting resources have been provisioned.

Official references: https://render.com/docs/blueprint-spec ; https://firebase.google.com/docs/cloud-messaging/send/v1-api ; https://developer.android.com/studio/publish/app-signing ; https://developer.android.com/google/play/integrity/verdicts
