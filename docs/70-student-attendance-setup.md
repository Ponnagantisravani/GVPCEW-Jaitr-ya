The backend passed the local 70-user login/dashboard test and the real-route
attendance simulation. Bluetooth sends a nearby session token; each phone still
uses HTTPS to log in, validate the token, and save attendance. College Wi-Fi,
mobile data and hotspots can all work once the backend is publicly hosted.

The existing build/GVPCEW-login-fixed.apk is the Capacitor portal app. The native
Bluetooth scanner, broadcaster and face capture are in mobile/attendance. Do not
distribute the portal APK as the Bluetooth attendance APK.

build/GVPCEW-bluetooth-test.apk is now built with embedded JavaScript, the native
Bluetooth scanner/broadcaster and the face model (about 118 MB). Its APK entry
checksums and native contents were verified. It uses the development signing key
and has no Firebase project or public backend configured. It is an initial test
artifact, not the class-distribution build. Rebuild after the setup below.

To make the native attendance app operational:

1. Create/connect a hosting account and a PostgreSQL database. Dockerfile.backend
   and render.yaml prepare the Node API and complete production migrations. The
   template selects a paid 1-CPU/2-GB service; review the plan before applying it.
   Nothing has been deployed or purchased. Resource details are documented at
   https://render.com/docs/blueprint-spec . Local timings do not certify that plan.
2. Set the database connection in the hosting dashboard and provision the students,
   class assignments, coordinator roles and timetable. A new empty hosted database
   does not automatically contain the local students or their passwords.
3. Create a Firebase Android project for com.gvpcew.attendance. Download its
   google-services.json to mobile/attendance/android/app/. Put FCM server credentials
   only in hosting secrets. Do not paste service-account keys into chat or the APK.
4. Configure Google Play Integrity, the released package/version and signing
   certificate, and the server's project/service-account settings. The app enforces
   this configuration; missing setup is not bypassed for a test.
5. Configure a calibrated MOBILE_FACE_THRESHOLD, approved model-compatible face
   enrollment and each student's bound phone. The bundled model verifier passes.
6. Replace the placeholder in mobile/attendance/src/config.ts with the public HTTPS
   /api address. The native login also lets the user edit this address.
7. Build :app:assembleRelease from mobile/attendance/android using the configured
   campus signing key. An embedded JavaScript bundle is needed for distribution;
   a Metro-dependent debug APK is insufficient. Test with a few physical phones
   before the 70-phone classroom test.

On Windows, set JAVA_HOME to the installed Java 21 directory and GVPCEW_CXX_DIR
to a short temporary path (for example, %TEMP%\gvpcew-attendance-cxx-70) before
running Gradle. This project includes fixes for Windows C++ object-path length
and clang++ short-name driver selection. The NDK 27.1.12297006 and CMake 3.22.1
are installed in the project's .tmp/attendance-android-sdk cache.

Reproduce the local tests from the project root:

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-attendance-load.ps1 -PostgresBin 'D:\Program Files\PostgreSQL\18\bin' -Port 55433 -Portal
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-attendance-load.ps1 -PostgresBin 'D:\Program Files\PostgreSQL\18\bin' -Port 55434

The helper creates only fresh disposable databases and stops them after the run.
The portal test uses batches of 70 simultaneous requests; the separate 350-socket
burst had connection refusals on local Windows. The attendance simulation uses
synthetic radio/face/integrity data. It validates concurrency, authorization,
duplicates and deadlines, but does not establish real BLE range, Google latency,
FCM delivery or physical-phone performance.
