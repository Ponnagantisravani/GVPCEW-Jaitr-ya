# Stage 7: Android phones, range and classroom test record

All physical tests below are **Pending**. No APK installation, real Firebase delivery, Google attestation, face calibration, Bluetooth range or classroom timing result has been recorded. Automated and simulated results belong in their own Stage 7 report; they do not fill these tables.

Run these checks with authorized test accounts and participants. Record failures as well as successful runs. The goal is that every participating, eligible student completes the main attendance flow within the server's 60-second window. A late result is useful recovery, but does not count as meeting that main-window goal.

## Prepare before testing

1. Build the complete Android release APK with embedded JavaScript and the campus release signing key. Record its commit, version, package, APK SHA-256 and signing-certificate digest. Full APK/runtime verification is still required; the isolated camera/integrity compilation is not a substitute.
2. Use an actual HTTPS backend ending in `/api`, not the editable `https://<your-service-name>.onrender.com/api` placeholder. Apply the existing portal/mobile migrations through `mobile-lifecycle` to the intended test database, restart the backend, and confirm the lifecycle and FCM workers run. Keep the backend awake throughout the test. A health ping alone does not verify database or Google readiness.
3. Configure the Android Firebase app and `google-services.json`, and the matching server `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON`. Check that approved bound phones register their current FCM token and advertising capability. Keep service-account credentials on the server; do not include tokens or keys in this record.
4. Configure Standard Play Integrity with the actual Cloud project number, package and accepted release-certificate digest: `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER`, `PLAY_INTEGRITY_PACKAGE_NAME`, `PLAY_INTEGRITY_CERT_SHA256` and server-only `PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON`. Enable/link the project and distribute through an app-recognized test/release path appropriate to the configured policy. The backend enforces `PLAY_RECOGNIZED`; an arbitrary debug or unrecognized sideloaded APK is expected to fail. Obtain a genuine successful verdict on a supported physical phone before measuring the attendance flow. Do not bypass integrity for the phone results.
5. Calibrate `MOBILE_FACE_THRESHOLD` using the bundled `mobilefacenet-v1` model and representative enrolled participants/phones. Record the calibrated value and calibration reference. Do not invent a threshold just to make a test pass.
6. Each participant signs in with their own admin-managed account, changes the initial password, consents, enrolls on their own test phone and receives administrator approval. Confirm `mobilefacenet-v1`, approved enrollment and one bound device. Never share an account between phones to increase the apparent participant count. Use administrator reset/re-enrollment if a device must change.
7. Assign the student coordinator and published class/lab timetable to the correct section and current Asia/Kolkata period. Keep enough distinct current timetable periods/test sessions for repeats; the same section/period/day cannot be started twice. Arrange repeats through the existing academic administration workflow, not by editing accepted attendance rows.
8. Grant camera, notifications and the required Bluetooth permissions. On Android 12+, verify Scan, Advertise and Connect; on earlier supported Android versions, verify the required location permission/service. Enable Bluetooth, allow internet access and note any manufacturer battery/background restrictions. Also include denied-permission checks later in this protocol.
9. Open the coordinator and potential helper apps so their advertising capability is registered. Observe which capable approved roster phones are actually selected as helpers. Place those selected helpers in the middle and back before the range/classroom run. **The backend has no seating map:** automatic selection does not prove physical distribution. If only one helper is available, record that limitation; it does not verify the requested two-to-three-helper arrangement.
10. Prepare coordinator, student, assigned teacher and authorized HOD/academic-coordinator web accounts. Reports must be read-only for mobile records. Use aliases/roll numbers in the test record; do not collect face photographs, embeddings, device identifiers, bearer tokens or attestation payloads.

| Test setup field | Observed value |
| --- | --- |
| Date, observer and test room | Pending |
| App commit/version/package/APK SHA-256 | Pending |
| Release signing certificate / recognition verified | Pending |
| Backend version and actual API host | Pending |
| Migration and worker readiness checked | Pending |
| Firebase delivery / genuine Play Integrity readiness | Pending |
| Model checksum and calibrated threshold reference | Pending |
| Published timetable, section and eligible roster size | Pending |
| Phone aliases, models, Android versions | Pending |
| Internet type and battery/background settings | Pending |
| Selected helper aliases and actual seats | Pending |

## Measure against the server window

Use the returned `started_at`, `expires_at`, `late_expires_at` and server status as authoritative. A phone/browser clock or stopwatch is supplementary. For each successful participant, compare the accepted record's `created_at` with server `started_at`; record the observer's time to visible confirmation separately.

| Window | Expected behavior |
| --- | --- |
| Start through before 60 seconds | A caught, server-valid current/previous BLE token unlocks front-camera verification. Random challenge, owner-template match and genuine integrity are required. Success is `PRESENT`, method `ble`. |
| Main expiry through before late expiry: 60–180 seconds | BLE advertising/scanning ends. An absent/missing student explicitly taps the late face check. Fresh random liveness, matching and integrity run without a BLE token. Success is `LATE`, method `fallback`, displayed as Present (Late), with review required. |
| At/after late expiry: 180 seconds | No late capture/submission is accepted. The report is final; missing students remain `ABSENT`. |

Closure absence rows normally materialize on the next available worker tick. Main and late submissions must obey the server deadlines even if worker execution is delayed. Report early/late boundary failures; do not classify a delayed UI message as accepted attendance without checking the server record.

## Test A: three to four real Android phones

Use these roles where available:

| Phone | Own account / section | Purpose |
| --- | --- | --- |
| A | Assigned coordinator, section A | Start and broadcast; still verify own attendance. |
| B | Approved eligible student/helper, section A | Receive push, broadcast if selected, verify own attendance. |
| C | Approved ordinary student, section A | Student notification, scan, camera and submission flow. |
| D, if available | Approved student/coordinator, another section | Cross-section rejection and push isolation. |

With only three phones, perform the section-isolation cases in a separate properly enrolled/assigned setup and mark the missing simultaneous coverage. A phone must hear another authorized phone's advertisement; a coordinator's fetched broadcast token must not unlock its own camera.

1. Put phones A–C a few metres apart with internet and Bluetooth enabled. A starts the current published period in the mobile app. Record server start/expiry and selected helpers. Verify B/C receive the scoped notification or discover the session when they open the app. Record push receipt latency rather than treating FCM acceptance as delivery.
2. Keep B backgrounded for one run. Confirm its actual selected-helper foreground-service notification and broadcasting, or record Android's restriction and the app's recovery path. Open B if restricted, retry while the session is open, and record the delay. Repeat a separate run with the app process absent but not force-stopped. A force-stopped/offline phone may miss automatic delivery; record the outcome explicitly.
3. C taps the notification. Confirm the front camera stays locked until a caught token has been validated. Complete the displayed neutral/action/neutral challenge and check server-confirmed Present. A and B also perform their own checks. Confirm the recorded challenge types match their attempts; a coordinator/helper is not automatically marked by broadcasting.
4. Check the coordinator web view: countdown, marked/actual roster total and unmarked names update. Ordinary student's history shows only their own result. Teacher/HOD report requests before main expiry are unavailable, then succeed after closure only for authorized classes.
5. Retry/reopen after accepted attendance, double-tap an available action, and restore internet after an uncertain submission response. There must be exactly one accepted record per student/session and no repeated automatic capture of an already accepted student.
6. In separate runs, deny camera, notifications and Bluetooth permissions; turn Bluetooth off; background/cancel during capture; and interrupt internet during scanning/submission. Verify clear retry/settings guidance, camera cleanup, no unauthenticated/self-selected marking, no stale receipt reuse and no premature Present confirmation. Restore settings before the next normal run.
7. Leave C unmarked through main expiry. Check ABSENT in own history/report, main BLE activity stopping, and an explicit late action. Complete fresh liveness during the 120-second recovery window. Confirm Present (Late), `fallback`, non-null similarity and review flag; classmates' accepted records must be unchanged. Repeat with an attempt starting too near/after late expiry: server acceptance must fail and final ABSENT must remain.
8. On D, confirm no section-A roster push/check-in eligibility. While physically near A/B broadcasts, D must not unlock/submit for A's session. Do not change D's account/section or use its password on another phone to manufacture this case.
9. Log out A/B or allow main expiry. Confirm their foreground-service notification and advertisements stop. An expired token must not keep a student's camera eligible. Repeat after app resume; stale saved notifications must not resurrect an expired session.
10. Run an additional current published period without a manual Start. Observe the configured timetable grace, eligible coordinator selection, one auto-started session and scoped pushes. If no approved advertising-capable coordinator phone is eligible, record no-start plus the readiness reason; no fabricated session/broadcaster is acceptable. A concurrent manual Start must not create a duplicate.

| Case | Run / phone | Start-to-push | Start-to-BLE validation | Start-to-server acceptance | Result / evidence |
| --- | --- | --- | --- | --- | --- |
| Main normal flow, including coordinator | Pending | — | — | — | Pending |
| Selected helper background/process-absent behavior | Pending | — | — | — | Pending |
| Duplicate and uncertain-network recovery | Pending | — | — | — | Pending |
| Permission denial / Bluetooth off / interruption | Pending | — | — | — | Pending |
| Late fallback in allowed window | Pending | — | — | — | Pending |
| Main/late deadline rejection | Pending | — | — | — | Pending |
| Other-section push/proximity rejection | Pending | — | — | — | Pending |
| Expiry and logout radio/camera cleanup | Pending | — | — | — | Pending |
| Timetable auto-start / concurrent Start | Pending | — | — | — | Pending |

Acceptance: all normal eligible phones have one server-accepted BLE Present within 60 seconds, the coordinator is independently verified, the negative cases are rejected, and late recovery is accepted only in its own window with a review flag. Record notification/background failures separately even when foreground polling recovers the session. A three-phone run cannot claim two-to-three-helper distribution or four-section physical concurrency.

## Test B: last bench and classroom range

Use the actual classroom, internet connection and intended seating. Record approximate distances, walls/obstructions, occupancy and phone orientation. Put the coordinator at the normal front seat, actually selected helpers in the middle/back, and an ordinary student at the farthest intended last bench. Use a fresh eligible session for each repeat.

1. Run with the normal helper arrangement and the last-bench phone resting naturally on the desk. Measure Start-to-valid-BLE and Start-to-server-Present. Weak signals should remain eligible; no RSSI threshold is imposed by this app.
2. Repeat with the last-bench phone held as during normal face capture, different supported phone models, and normal room occupancy. Do not strengthen the result by moving the phone closer during the timed attempt; record any necessary movement as a failed placement plus a recovery attempt.
3. In separate controlled runs, make a selected helper unavailable or disable its Bluetooth before start. Record whether remaining broadcasters maintain last-bench reception and whether missing-helper conditions reduce coverage. Restore the normal arrangement for acceptance runs.
4. For an intentionally unreachable phone, confirm the 10-second still-searching state and the 20-second late-recovery guidance while the camera remains locked. Main scanning may continue until expiry. After closure, test the explicit late path; this recovery does not pass the main-window range criterion.

| Run | Room / occupancy / distance | Broadcasters and actual seats | Last-bench phone / orientation | BLE validation time | Main acceptance time | Search/recovery behavior | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Normal distribution 1 | Pending | Pending | Pending | — | — | Pending | Pending |
| Normal distribution 2 | Pending | Pending | Pending | — | — | Pending | Pending |
| Alternate phone / occupied room | Pending | Pending | Pending | — | — | Pending | Pending |
| Helper unavailable | Pending | Pending | Pending | — | — | Pending | Pending |
| Intentional unreachable case | Pending | Pending | Pending | — | — | Pending | Pending |

Acceptance: each normal last-bench repeat obtains a server-valid token and completes main attendance within 60 seconds without moving closer. Record exact delays; reception within 10 seconds is a useful target, while any later reception must still leave enough time for liveness, integrity and submission. Denied/no-signal cases keep the camera locked and show the documented search/recovery states. Coverage is a measured room/phone result, not a guarantee for other rooms or hardware.

## Test C: eight to ten participants, Start to final list

Prepare eight to ten distinct approved bound accounts in one section, including the coordinator and two-to-three capable selected helpers when available. Distinguish participant count from the session's complete approved roster total; other roster students may intentionally remain absent. Give participants only normal login/setup instructions, then measure the automatic attendance flow.

1. Seat the selected helpers in the middle/back and at least one ordinary participant at the last bench. Start an observer stopwatch on coordinator Start; also record authoritative server start/expiry.
2. Participants open the notification/app and complete their own requested random challenge. Record each push, BLE validation, camera entry, retry reason, server acceptance and displayed confirmation time. Do not manually mark or edit records to meet the target.
3. At main expiry, capture the coordinator counts and authorized read-only report using aliases. Compare the present count with accepted records, roster total and absences. Record Start-to-visible closed list and worker/report refresh delay; main attendance success must be supported by record timestamps before expiry.
4. In a separate run, deliberately leave one or two participants absent during the main window, then complete one valid fallback and leave one absent. Check the provisional report updates during late recovery, late review flags, and final Present/Present (Late)/Absent partition after 180 seconds.
5. Repeat the normal run on another permitted current timetable period. Keep retries, unreachable phones and late recoveries in the results; do not remove them from the denominator.

| Participant alias | Phone / seat / helper | Push receipt (s) | BLE validation (s) | Challenge / retries | Accepted (s from server Start) | UI confirmation (s) | Main / late / absent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coordinator | Pending | — | — | Pending | — | — | Pending |
| Participant 2 | Pending | — | — | Pending | — | — | Pending |
| Participant 3 | Pending | — | — | Pending | — | — | Pending |
| Participant 4 | Pending | — | — | Pending | — | — | Pending |
| Participant 5 | Pending | — | — | Pending | — | — | Pending |
| Participant 6 | Pending | — | — | Pending | — | — | Pending |
| Participant 7 | Pending | — | — | Pending | — | — | Pending |
| Participant 8 | Pending | — | — | Pending | — | — | Pending |
| Participant 9, if used | Pending | — | — | Pending | — | — | Pending |
| Participant 10, if used | Pending | — | — | Pending | — | — | Pending |

| Classroom metric | Normal run 1 | Normal run 2 | Deliberate late/absent run |
| --- | --- | --- | --- |
| Eligible participating students / complete roster | Pending | Pending | Pending |
| Main accepted / late / absent participants | Pending | Pending | Pending |
| Slowest main acceptance time | Pending | Pending | Pending |
| Start to visible main-closed list | Pending | Pending | Pending |
| Start to final late-window report | Pending | Pending | Pending |
| Duplicate records / mismatched counts | Pending | Pending | Pending |
| Last-bench outcome / observed failures | Pending | Pending | Pending |
| Acceptance decision | Pending | Pending | Pending |

Acceptance: every normal participating student is accepted once as BLE Present before the 60-second server deadline; all unmarked roster members are Absent after closure; web/mobile counts and identities agree; late recovery is distinct, review flagged and bounded to 120 seconds after closure; final report counts sum to the roster. Report the separate time to visible closed list and final late-window report. Passing eight-to-ten participants does not establish 70-student capacity.

## Test D: section isolation and four-section concurrency

The automated 70-per-section load simulation and the physical radio test are separate evidence. For physical four-section self-attendance, arrange enough phones to provide each section an authorized broadcast source another phone can hear. Four coordinator phones alone do not validate each coordinator's own BLE proximity; at least a coordinator and another capable approved phone per section are needed for that coverage. Two sections with two phones each test two-section concurrency only.

1. Prepare four independent published-current-period sessions, approved rosters, assigned coordinators and capable helpers. Run all four Start actions within the same few seconds. Record each unique session, section, server deadline and actual helper set.
2. Where practical, place phones from two sections within mutual radio range so they encounter foreign packets as well as their own. Confirm they validate/submit only for their own section; no foreign camera unlock, roster push, record or broadcaster token access is accepted.
3. Let one section's main window close while another is still open. Check independent countdowns, closure, BLE cleanup and report status. A late check-in in one section must not change another section's counts or prolong its window.
4. Check authorized coordinator views, student history and assigned teacher/HOD access for each section. Coordinators see only their assigned sections' unmarked identities, students only their own history, and teachers/HOD only their authorized closed reports.
5. Compare all per-section rosters and records with the test setup. Record whether the configured backend remained awake, push delays, submission response errors and any cross-section mismatch. Use the load simulator's report separately for the requested 4 × 70 submission measurement; real PostgreSQL contention/Google quotas require their own observed result.

| Section | Session / actual roster | Start / main expiry / late expiry | Actual broadcaster seats | Main / late / absent | Foreign token/push/report result | Observed timing / errors | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| B | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| C | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| D | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Acceptance: sessions and windows remain independent, all accepted records belong to their original own-section rosters, foreign pushes/proximity/submission/report access fail as required, and all normal physical participants finish within their own 60-second window. Record insufficient phones as Pending rather than extending a two-section result to four sections.

## Additional face and device checks

Before broad classroom use, test the enrolled owner's normal lighting/pose, another consenting participant attempting the account owner's check, a static printed/screen face and a prerecorded sequence in an authorized test. Static or wrong-face attempts must not produce Present. Record challenge types and rejection outcomes without retaining face images. The active 2D challenge is best-effort liveness: a responsive replay/deepfake may defeat it, so these checks do not establish certified presentation-attack resistance.

Check wrong-bound-device access, enrollment revocation/reset and an unsupported/denied integrity verdict in separate authorized cases. Each must fail closed without producing Present. After admin review, verify enrollment previews are no longer available; attendance requests should contain numeric embeddings and integrity/challenge fields, with no photos. Do not put raw biometric/attestation payloads in logs or this report.

| Check | Setup / expected rejection | Observed result | Decision |
| --- | --- | --- | --- |
| Genuine owner, representative lighting/phones | Complete normal random challenge and calibrated match | Pending | Pending |
| Different consenting face / static image / prerecorded sequence | Reject wrong match or failed sequence | Pending | Pending |
| Wrong bound phone / revoked enrollment | Deny eligibility/submission | Pending | Pending |
| Genuine denied integrity verdict | Reject submission, no bypass | Pending | Pending |
| Attendance payload / preview deletion | No attendance photos; reviewed preview removed | Pending | Pending |

## Close the record

For each failed criterion, attach a concise issue with app/backend versions, run/phone alias, section, server window and sanitized error. Record the corrective change, then repeat the affected normal and negative cases. Keep original failed results. Fill the decision only after observing the required evidence; leave unmet physical, configuration and capacity checks Pending. See [Stage 5 verification limitations](mobile-attendance-stage-5.md) and [Stage 6 lifecycle/report contracts](mobile-attendance-stage-6.md) for implementation details.
