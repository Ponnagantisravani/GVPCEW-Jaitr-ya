# Local webcam attendance test

The local browser flow now opens a real webcam, saves a separate face reference and compares captured frames to that reference before recording demo PRESENT or LATE. The face service uses OpenCV YuNet detection and SFace recognition. A heuristic eye detector checks an open/closed/open sequence. This is a local demonstration, not production anti-spoofing or Bluetooth verification; photos/video replay are not reliably excluded. Demo records do not affect official attendance totals or mobile face enrollment.

## Start

PostgreSQL and your normal portal accounts/section assignments must be ready in backend/.env. Keep its DATABASE_URL local and JWT_SECRET private. Installed Python needs OpenCV 4.10 or later and NumPy. This system already has them.

First-time model setup from the project root:

```powershell
python tools/setup-local-face-models.py
```

This downloads the official [OpenCV Zoo models](https://github.com/opencv/opencv_zoo/tree/main/models) to ignored .tmp/local-face-models and verifies their published Git LFS sizes and SHA-256 digests. SFace uses a nominal 0.363 cosine comparison threshold for this demo; it is not a campus-calibrated threshold.

Start two terminals:

```powershell
npm.cmd --prefix backend run dev:local-demo
```

```powershell
npm.cmd --prefix frontend run dev
```

The launcher adds separate demo tables and starts the authenticated loopback Python face service on 5002 and backend on 4000. It generates a service key for this process, leaves saved environment settings unchanged, and skips the Android workers. Stop an existing backend before relaunching. Use LOCAL_DEMO_PYTHON to select a different Python executable if necessary.

## Click through

1. Open http://localhost:5173, sign in and open Attendance. Click **Open camera**, allow the browser permission, and wait for your webcam preview.
2. Before starting a timed session, consent and click **Capture and save local face reference**. Keep one clear face visible. Each participating account needs its own reference; this is saved once. Reference enrollment is self-service for this demo and does not establish institution-approved identity.
3. In the coordinator dashboard open **Attendance Session** and click **Start demo session (60 seconds)**. The requested account 324103210170.sravani@gvpcew.ac.in has coordinator access for III CSE, Section 3, Semester 5. Sign out and log in again if the role is missing.
4. In a separate browser profile/incognito window, sign in as a student in the same section and open **Attendance** or **Mark Attendance**. Click **Open camera**, then **Capture face and blink — check in**. Look straight ahead, blink slowly and reopen your eyes during the four-second capture. Avoid glasses glare and poor lighting. Close the other window's camera if your webcam cannot serve both windows.
5. Captured frames are sent to the backend; the local Python service verifies one visible face, matches it to the account’s local reference and checks the heuristic blink sequence. If accepted, PRESENT appears and coordinator counts update. A failed capture shows a reason and does not record attendance; retry before the deadline.
6. After 60 seconds, unmarked students display ABSENT. During the next 120 seconds they can use the camera for **Capture face and blink — late check-in**, recording LATE. A fresh challenge is required after a main-window attempt expires. The coordinator also completes a separate personal face check.
7. After the late window closes, check-in is unavailable and another demo session may be started. Camera tracks stop on close, successful check-in, terminal expiry and navigation away.

Each challenge is scoped to account/session/reference version, expires within 20 seconds or its attendance phase deadline, and is consumed transactionally. The server repeats section/deadline checks after recognition and prevents duplicates. Plain button-only requests no longer work. Only feature templates are saved; submitted images are processed in memory and are not stored or logged. Local face comparison does not use the incompatible Android MobileFaceNet vectors.

## Validation and limits

The PostgreSQL integration test uses synthetic face-service verdicts to verify missing-reference, mismatched-face, missing-blink, borrowed-challenge, duplicate and authorization rejection paths, plus start/late/expiry behavior and isolated demo records. Genuine model inference is checked separately with an OpenCV sample portrait and an empty frame. These checks do not claim a successful physical webcam/blink test for the user.

Run database tests in a disposable cluster:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-attendance-load.ps1 -PostgresBin 'D:\Program Files\PostgreSQL\18\bin' -LocalDemo
python tools/test-local-face-models.py
```

The previous button-only demonstration is superseded by this webcam flow. Production mode rejects the demo endpoints. Real campus attendance continues to require the Android Bluetooth/face/Integrity workflow.

## Latest verification

The downloaded quantized SFace model passed its official SHA-256 check. Real OpenCV inference produced a normalized 128-value template, a repeated-sample cosine similarity of 0.9999998979 and rejection of an empty image. These use a public sample image, not a student webcam. Backend and frontend regression suites passed 46 and 40 tests; the web build passed. Backend and face-service health endpoints both returned 200. Manual webcam and physical blink acceptance remains to be checked by the user.
