# Stage 4 — Bluetooth broadcast, scan and rotating tokens

## Implemented behavior

The coordinator's bound phone starts the bounded Android broadcaster service immediately after a successful Start response. A current high-priority FCM data push can start the same service on each assigned helper without opening the app. The service has a connectedDevice foreground notification and a native expiry timer, never runs longer than 60 seconds, and is not sticky across process death. If Android restricts background startup, notification/app recovery retries it while the app is open. The camera is never opened by a push or advertisement.

The foreground service runs a React Native headless task using the requested react-native-ble-advertiser 0.0.17. It reads the encrypted existing login, derives the bound device ID and fetches the current token only from the authorized broadcaster endpoint. It advertises at Android LOW_LATENCY/max requested power, non-connectable, without device name or TxPower data. Tokens rotate using the server's eight-second validity rows. Network failure stops the current advertisement instead of indefinitely reusing a cached token. Each packet has a native timeout; service expiry/sign-out additionally stops native advertisements even if JS is suspended. Changing logout/device/enrollment access causes token fetching to fail closed. Actual radio power/range is hardware-dependent.

Students, coordinators and helpers scan using react-native-ble-plx 3.5.1 while the attendance app is open. Scanning accepts duplicates and weak signals, with no RSSI cutoff. The scanner decodes only the campus packet, checks the caught token against the logged-in student's roster/section/bound device on the backend, and grants an in-memory camera-ready receipt only after success. Current and previous token slots are accepted. Receipt lifetime is conservatively bounded by server validity and request round trip, tracked against a monotonic clock, and capped by session closure. Receipt expiry or app backgrounding relocks the gate and discards it. A new valid-looking packet from another section never replaces a valid receipt or unlocks the camera.

Searching changes at 10 seconds to still searching; at 20 seconds it offers late-attendance recovery guidance while scanning continues. Actual late check-in UI remains Stage 6. A successful Bluetooth gate shows readiness for face verification; the actual random-liveness camera and attendance submit are Stage 5. No attendance is marked by this stage alone. Optional relay mode is disabled.

## Backend and configuration

- GET /api/attendance/session/:id/token now requires device_id in the query, approved enrollment on that bound device, own-section roster access, and coordinator/helper authorization. It returns current token, slot validity, session expiry, server time and valid_for_ms. Ordinary students cannot fetch a fresh token from this endpoint.
- POST /api/attendance/session/:id/token/validate takes device_id and ble_token under existing JWT auth. It checks session openness, own roster, current section, exact approved model, device and current/previous slot. It returns an acceptance lifetime, never a different/fresh token. Stage 5 challenge/submit still revalidate the BLE token and all identity checks; the client receipt is not attendance authorization.
- FCM registration accepts can_advertise, default false, from native hardware support reporting. Native token refresh includes it too. The coordinator must have a capable bound-device registration before starting. The server chooses up to three approved, registered, capable roster phones as helpers.
- Run npm run db:migrate:mobile-ble from backend AFTER the Stage 1 and Stage 3 migrations, then restart the backend. This additive migration was not applied to production in this task. Existing Firebase, threshold, Play Integrity and actual HTTPS address prerequisites remain.
- No classroom seating map exists in the current data model. Helper selection is among capable roster phones, not verified middle/back seating. Physical helper placement and range must be checked in the classroom; no room-position guarantee is claimed.

## Packet and library compatibility

Manufacturer data is company ID 0xffff (private prototype identifier), ASCII GC, protocol version 1, and the 12-byte server token. The 17 manufacturer bytes plus AD framing/flags occupy 22 bytes, below the legacy 31-byte limit. A constant 128-bit UUID is used only as the advertiser's internal instance key; it is omitted from the radio payload. No account ID, section ID, BLE address, face data or coordinates are broadcast or logged by the app.

The advertiser is archived and targets old Gradle/Android APIs. The pinned postinstall script adds namespace/current SDK wiring, correct autolinking, deferred permission-safe adapter access, modern receiver registration, fresh Promise callbacks on every token rotation, optional UUID omission, bounded native advertising timeout, native stop-all cleanup and lifecycle cleanup. Patch assertions reject a package version/source change instead of silently applying an unknown patch. The scanner uses its published new-architecture package. npm run postinstall is repeatable and checks these fixes. The pinned lockfile records both requested libraries.

Bluetooth is a short-lived proximity signal, not a cryptographic distance measurement or protection against all live relays. Matching, random liveness, device binding and Play Integrity remain required server checks in later stages. The app never silently enables the adapter or requests permissions again; settings and clear error/retry states handle denied access.

## Verification

Mobile Jest: nine suites and 23 tests passed, including actual scanner hook tests with weak RSSI, wrong-section denial, background relocking and expiry relocking. TypeScript and model checksum/tensor verification passed. Backend mobile enrollment/attendance/start/FCM/BLE checks: 14 tests passed. Broadcaster hardware selection/registration tests also passed after the capability change. Native autolinking resolves both package imports correctly. Postinstall fixes were rerun successfully.

An isolated Android source compile check was attempted with the actual Kotlin sources and patched advertiser Java, using Android SDK 36 and cached Gradle 9.2.0. It reached the advertiser Java task but stalled during dependency resolution for more than seven minutes and was stopped; no successful native compilation is claimed. Full APK/C++ integration remains unverified due the earlier NDK download failure. No phones, live Firebase project, range results, physical seating verification or four-section real timing results are claimed. All transport/database tests use mocks. Stage 7 retains the requested real-phone/last-bench/classroom/load tests.

## Files changed in this stage

- database/mobile-attendance-ble.sql
- backend/package.json
- backend/scripts/migrate-mobile-ble.js
- backend/src/routes/mobileAttendance.js
- backend/src/routes/mobileEnrollment.js
- backend/tests/mobile-ble.test.js
- backend/tests/mobile-session-start.test.js
- mobile/attendance/package.json
- mobile/attendance/package-lock.json
- mobile/attendance/index.js
- mobile/attendance/react-native.config.js
- mobile/attendance/README.md
- mobile/attendance/scripts/fix-ble-advertiser.mjs
- mobile/attendance/android/app/src/main/AndroidManifest.xml
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusBleService.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusMessagingService.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusNativeModule.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusPush.kt
- mobile/attendance/src/api.ts
- mobile/attendance/src/native.ts
- mobile/attendance/src/types.ts
- mobile/attendance/src/AttendanceHome.tsx
- mobile/attendance/src/bleProtocol.ts
- mobile/attendance/src/bleBroadcast.ts
- mobile/attendance/src/useBleProximity.ts
- mobile/attendance/__tests__/App.test.tsx
- mobile/attendance/__tests__/AttendanceHome.test.tsx
- mobile/attendance/__tests__/bleProtocol.test.ts
- mobile/attendance/__tests__/bleBroadcast.test.ts
- mobile/attendance/__tests__/useBleProximity.test.tsx
- docs/mobile-attendance-stage-4.md

## Sources and next stage

[Advertiser source and archived status](https://github.com/vitorpamplona/react-native-ble-advertiser), [BLE scanner](https://github.com/dotintent/react-native-ble-plx), [scanner APIs](https://dotintent.github.io/react-native-ble-plx/), [Android foreground service startup restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [connectedDevice foreground service type](https://developer.android.com/develop/background-work/services/fgs/service-types#connected-device).

Stop here for user approval before Stage 5: front camera random liveness, matching, Play Integrity and submit.
