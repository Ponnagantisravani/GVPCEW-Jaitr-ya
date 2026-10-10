# Stage 2 review: React Native login and enrollment

The new Android-first app lives in mobile/attendance, separate from the existing Kotlin BLE prototype. It reuses the same campus backend and existing JWT login. Setup is forced from the server's enrollment status and device binding before the account becomes ready.

Completed: password change and confirmation, consent, once-only Android permission requests with denial recovery, native front camera, five guided ML Kit samples, pinned MobileFaceNet inference and averaged template upload, one small admin preview, pending/rejected/approved/device mismatch screens, AES-GCM/Android Keystore session storage, own-device identifier, foreground status revalidation and sign-out.

The default API address is the user-requested https://<your-service-name>.onrender.com/api. It stays editable at login. The placeholder must be replaced with the actual existing Render service name before a login can succeed; this is validated before credentials are sent. No real deployed backend URL was supplied.

## Backend changes in this stage

- backend/src/routes/mobileEnrollment.js: setup additionally requires model_sha256 matching the exact bundled asset, preventing ordinary clients from silently selecting another model under the same identifier. This is metadata validation, not proof that an untrusted client ran the model. Google app/device attestation remains attendance-stage work.
- backend/tests/mobile-enrollment.test.js: mocked-database HTTP contract test for existing web/mobile login, model/consent/ownership/password/device rejection and one-time enrollment.

No production database changes, service credentials or deployment were performed.

## Added app files

- mobile/attendance/.bundle/config
- mobile/attendance/.eslintrc.js
- mobile/attendance/.gitignore
- mobile/attendance/.prettierrc.js
- mobile/attendance/.watchmanconfig
- mobile/attendance/android/app/build.gradle
- mobile/attendance/android/app/debug.keystore
- mobile/attendance/android/app/proguard-rules.pro
- mobile/attendance/android/app/src/main/AndroidManifest.xml
- mobile/attendance/android/app/src/main/assets/mobilefacenet-v1.tflite
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusNativeModule.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/CampusNativePackage.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceEnrollmentActivity.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceEnrollmentPolicy.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/FaceTemplateMath.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/MainActivity.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/MainApplication.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/MobileFaceNet.kt
- mobile/attendance/android/app/src/main/java/com/gvpcew/attendance/SecureCampusStorage.kt
- mobile/attendance/android/app/src/main/res/drawable/rn_edit_text_material.xml
- mobile/attendance/android/app/src/main/res/mipmap-hdpi/ic_launcher.png
- mobile/attendance/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
- mobile/attendance/android/app/src/main/res/mipmap-mdpi/ic_launcher.png
- mobile/attendance/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
- mobile/attendance/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
- mobile/attendance/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
- mobile/attendance/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
- mobile/attendance/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
- mobile/attendance/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
- mobile/attendance/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
- mobile/attendance/android/app/src/main/res/values/strings.xml
- mobile/attendance/android/app/src/main/res/values/styles.xml
- mobile/attendance/android/app/src/test/java/com/gvpcew/attendance/FaceTemplateMathTest.kt
- mobile/attendance/android/build.gradle
- mobile/attendance/android/gradle/wrapper/gradle-wrapper.jar
- mobile/attendance/android/gradle/wrapper/gradle-wrapper.properties
- mobile/attendance/android/gradle.properties
- mobile/attendance/android/gradlew
- mobile/attendance/android/gradlew.bat
- mobile/attendance/android/settings.gradle
- mobile/attendance/app.json
- mobile/attendance/App.tsx
- mobile/attendance/babel.config.js
- mobile/attendance/Gemfile
- mobile/attendance/index.js
- mobile/attendance/ios/CampusAttendance/AppDelegate.swift
- mobile/attendance/ios/CampusAttendance/Images.xcassets/AppIcon.appiconset/Contents.json
- mobile/attendance/ios/CampusAttendance/Images.xcassets/Contents.json
- mobile/attendance/ios/CampusAttendance/Info.plist
- mobile/attendance/ios/CampusAttendance/LaunchScreen.storyboard
- mobile/attendance/ios/CampusAttendance/PrivacyInfo.xcprivacy
- mobile/attendance/ios/CampusAttendance.xcodeproj/project.pbxproj
- mobile/attendance/ios/CampusAttendance.xcodeproj/xcshareddata/xcschemes/CampusAttendance.xcscheme
- mobile/attendance/ios/Podfile
- mobile/attendance/ios/_xcode.env
- mobile/attendance/jest.config.js
- mobile/attendance/licenses/MobileFaceNet-source-LICENSE
- mobile/attendance/metro.config.js
- mobile/attendance/model-manifest.json
- mobile/attendance/package-lock.json
- mobile/attendance/package.json
- mobile/attendance/README.md
- mobile/attendance/scripts/fix-gradle-toolchain.mjs
- mobile/attendance/scripts/verify-model.mjs
- mobile/attendance/src/api.ts
- mobile/attendance/src/config.ts
- mobile/attendance/src/enrollmentPolicy.ts
- mobile/attendance/src/native.ts
- mobile/attendance/src/permissions.ts
- mobile/attendance/src/types.ts
- mobile/attendance/tsconfig.json
- mobile/attendance/__tests__/api.test.ts
- mobile/attendance/__tests__/App.test.tsx
- mobile/attendance/__tests__/enrollmentPolicy.test.ts
- mobile/attendance/__tests__/permissions.test.ts

## Model contract

The bundled asset SHA-256 is be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854. Its actual FlatBuffer has FLOAT32 [1,112,112,3] input and FLOAT32 [1,192] output. model-manifest.json pins source commit, tensor shapes, channel normalization, eye alignment and normalization/averaging. Runtime checks reject model checksum or tensor mismatch. Native and JavaScript pins are verified by the model script.

[Model source](https://github.com/hugocornellier/face_detection_tflite/blob/9e74dfc317647af0ea2ecd8d815092d65f9641a5/assets/models/mobilefacenet.tflite), [upstream license](https://github.com/hugocornellier/face_detection_tflite/blob/9e74dfc317647af0ea2ecd8d815092d65f9641a5/LICENSE), [ML Kit pose/classification limits](https://developers.google.com/ml-kit/vision/face-detection/face-detection-concepts).

## Build compatibility

React Native 0.85.3's Gradle plugin contains an outdated Foojay resolver which fails with Gradle 9 when provisioning JDK 17. scripts/fix-gradle-toolchain.mjs applies the upstream 1.0.0 replacement after each install and asserts the expected React Native version. This avoids an unrecorded node_modules-only fix. [Upstream compatibility fix](https://github.com/gradle/foojay-toolchains/blob/main/CHANGELOG.md).

## Validation performed

- Mobile Jest: four suites, nine tests passed.
- TypeScript: tsc --noEmit passed.
- Model: checksum, FlatBuffer FLOAT32 tensor shapes and native/JS pins verified.
- Backend mobile enrollment and attendance: nine tests passed.
- Native Kotlin template math/pose gates: five JUnit tests passed in an isolated JVM Gradle build using the actual app sources (temporary harness at .tmp/attendance-native-math). This does not verify Android APIs or the camera bridge.
- Full Android compile/unit-test task did not reach app compilation: Google's NDK 27.1.12297006 download failed with a host-aborted socket connection. A separate download was reachable but too slow and was stopped. No APK or successful Android-native build is claimed. React Native Gradle plugins compiled using cached Gradle 9.2.0 and the recorded Foojay patch.
- No production migration, deployment, phone-camera test or identity-accuracy calibration was performed.

## Deferred scope

FCM delivery/coordinator start is Stage 3. Actual BLE broadcasting/scanning and token rotation are Stage 4. Attendance liveness and matching reuse the enrollment model/preprocessing in Stage 5. Scheduled closure, retention worker and web dashboards are Stage 6. Real-phone/classroom/load tests are Stage 7. Enrollment's quality and consistency gates are not a claim of spoof-resistant liveness or measured identity accuracy.

Physical phones still need enrollment, denied permissions, cancellation/backgrounding, admin approval, restart/restore and wrong-device tests. The production similarity threshold remains unset until calibration. The iOS project is scaffold only.

Stop after this stage and obtain the user's approval before Stage 3, as required by the original request.
