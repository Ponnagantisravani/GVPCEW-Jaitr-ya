# Mobile layout review

Updated shared phone/tablet layouts, safe-area spacing, form sizing, table records, document scrolling, template dialogs, navigation focus and background scroll locking. Student assignment now uses touch-friendly checkboxes.

Verification: 19 representative role screens at widths 320, 390, 768, 1024 and 1440, plus 844 × 390 landscape. Also checked sign-in, registration and calendar/syllabus template dialogs. Headless Microsoft Edge with synthetic data was used because the in-app browser was unavailable. Production build and all six existing frontend tests passed.

Screenshots: student-dashboard.png, digital-id.png, sign-in.png. Test fixture instructions are in frontend/tests/mobile/README.md. These checks do not certify real iOS Safari, device keyboards, camera permissions or native PDF behavior.
