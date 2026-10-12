# Stage 7: database load validation and phone test protocol

The local software scenarios pass against PostgreSQL 18.6 using the actual Express routes, authorization checks and nine database migrations. Results are recorded in [mobile-attendance-load-results.json](mobile-attendance-load-results.json). Physical phone, Bluetooth range and classroom acceptance tests remain pending; use [the phone test checklist](mobile-attendance-phone-tests.md).

## Changes

- backend/scripts/simulate-mobile-attendance.mjs: disposable database fixtures, concurrent submissions, duplicate races, authorization/proof rejection checks, timetable starts, real 60-second closure and late recovery.
- tools/run-attendance-load.ps1: creates and stops an isolated loopback PostgreSQL cluster under workspace .tmp; preserves logs and leaves existing services alone.
- backend/package.json: test:mobile-load entry point.
- backend/src/services/mobileAttendanceLifecycle.js: explicit integer casts for rotating-token slots, fixing a PostgreSQL parameter type conflict discovered by the integration run; auto-start grace restricted to 5–60 seconds.
- backend/tests/mobile-lifecycle.test.js and backend/.env.example: invalid grace configuration regression coverage and documented range.
- docs/mobile-attendance-phone-tests.md: 3–4 phone, range, 8–10 student and four-section acceptance checklist with all physical outcomes pending.
- docs/mobile-attendance-stage-7.md, docs/mobile-attendance-load-results.json, README.md, mobile/attendance/README.md and Stage 6 documentation: reproducible commands, measured evidence and remaining checks.

## Reproduce

From the repository root in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-attendance-load.ps1 -PostgresBin 'D:\Program Files\PostgreSQL\18\bin'
```

Adjust PostgresBin to an installed PostgreSQL binary directory. The helper uses a free loopback port (default 55432), a new attendance_load_test database, and the synthetic attendance_simulator role. The Node script refuses remote URLs, other database names and nonempty databases. It does not reset existing data. Cluster logs remain under .tmp and the server stops after the run. For a manually created empty local test database, run npm.cmd run test:mobile-load from backend with ATTENDANCE_TEST_DATABASE_URL set. --accelerate-close is an optional smoke test; the checked-in results use the real 60-second deadline.

## Measured results

| Scenario | Result |
| --- | --- |
| 70 simultaneous students | 2,027.3 ms; p95 1,286.8 ms |
| Four sections, 280 students | 2,107.8 ms; p95 1,928.5 ms |
| 140 duplicate submissions | 70 accepted, 70 rejected |
| Invalid evidence / locked rechecks | 15 rejected; no accepted records |
| Timetable-only start, 70 students | One automatic start; 588.1 ms |
| Real main deadline and late recovery | Closure lag 990.4 ms; 56 present, 7 late, 7 absent |

Backend: 46 tests passed. Frontend: 40 tests passed and production build succeeded (existing chunk-size warning). The Stage 6 mobile checks previously passed 41 tests and TypeScript; mobile source was unchanged during this load-validation step. The load report includes the SHA-256 of the exact simulator source.

## Coverage and limits

Six scenarios exercise 70 concurrent students, four independent sections totaling 280 students, 140 duplicate races, 15 rejected attempts including enrollment/section/deadline changes during proof verification, automatic timetable start without coordinator intervention, and worker closure followed by late recovery. Assertions verify roster isolation, one accepted record per student, absent materialization, one closure audit, helper/token/push queue counts, report permissions and attendance method/status consistency.

Google OAuth and Play Integrity verdicts are synthetic inside the standalone test process, with a 120 ms artificial decode delay. Face vectors are unique synthetic normalized templates. These results measure local SQL/HTTP behavior, not camera recognition, real Google latency, push delivery, Bluetooth proximity or production capacity. The terminal late deadline is accelerated in fixtures; the main 60-second closure is real.

## Remaining acceptance work

The Android build attempt stopped at an incomplete NDK 27.1.12297006 installation (missing source.properties). React Android/Hermes artifacts and CMake also require build dependency downloads. No APK or connected Android phones were available for this run. A partial pinned NDK download must be complete and match its official checksum before extraction.

Provide the actual HTTPS API URL (the current editable default is https://<your-service-name>.onrender.com/api), Firebase/Play Integrity configuration, approved enrolled Android devices, and a calibrated recognition threshold before running the physical checklist. Every physical result stays pending until measured. No production migration, deployment or phone installation was performed by the simulation.
