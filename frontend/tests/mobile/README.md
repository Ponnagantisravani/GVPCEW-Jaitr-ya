# Responsive layout checks

Start the frontend dev server with npm.cmd run dev on Windows (npm run dev elsewhere).

Open http://127.0.0.1:5173/tests/mobile/check.html?width=320 and repeat for widths 390, 768, 1024, and 1440. For phone landscape, use check.html?width=844&height=390.

The page renders 19 real role screens with synthetic records. It checks page overflow, drawer opening/closing, focus, restoring scroll, and fixed ID fields. Each screen has its own iframe viewport. API writes and storage writes are disabled. No real account or backend is required. These development-only fixtures are excluded from production build inputs.

Visual previews: view.html?width=390&screen=Digital%20ID or view.html?width=390.
Template picker: view.html?width=320&role=academic_coordinator&modal=1&screen=Academic%20Calendar (also Syllabus).
Authentication: view.html?width=320&auth=1&screen=register; omit screen for sign-in.

These are Chromium layout checks, not physical Android/iOS certification. Native keyboards, camera permissions, PDF viewers, large text, zoom, and Safari should also be checked on real devices.
