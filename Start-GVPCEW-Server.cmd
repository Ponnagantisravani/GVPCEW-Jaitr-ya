@echo off
cd /d "%~dp0"
echo Starting the GVPCEW campus server. Keep this window open while using the APK.
node backend\src\server.js
pause
