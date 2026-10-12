The Capacitor APK bundles the frontend, not the Node backend or PostgreSQL database.
Relative /api requests previously reached the APK's local asset server. The login
could then interpret a non-API response as an account without dashboard access.

The corrected debug APK defaults to http://192.168.89.124:4000/api. In the login
screen, expand Campus server connection to change this address when the computer's
Wi-Fi IPv4 address changes. Keep the computer and phone on the same Wi-Fi.
Start-GVPCEW-Server.cmd starts the backend after restarting the computer. Do not
start a second copy if port 4000 is already running.

The account 324103210170.sravani@gvpcew.ac.in is active in the local database and
already has student, student_coordinator, faculty, academic_coordinator and admin
roles. This fix does not reset its password or change its permissions.

Native HTTP requests are enabled through CapacitorHttp. Cleartext HTTP is allowed
only in the debug Android manifest for local Wi-Fi testing. A release APK needs an
HTTPS backend reachable by its users; an APK alone cannot provide the database.

Validated: authentication and session/server configuration tests, frontend build,
and backend health at the local Wi-Fi address. Physical-phone login with the user's
password remains to be checked on the phone.
