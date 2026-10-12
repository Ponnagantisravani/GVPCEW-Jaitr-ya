import {startSubjectAttendanceWorker} from './services/subjectAttendance.js';
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { verifyDatabaseConnection } from "./config/db.js";

import {startAttendanceLifecycleWorker} from './services/mobileAttendanceLifecycle.js';
import {startPushWorker} from './services/mobilePushQueue.js';
const app = createApp();

async function start() {
  try {
    await verifyDatabaseConnection();

    const demoOnly=process.env.NODE_ENV==='development'&&process.env.LOCAL_ATTENDANCE_DEMO==='true'&&process.env.LOCAL_ATTENDANCE_DEMO_ONLY==='true';
    app.listen(env.port, demoOnly ? '127.0.0.1' : '0.0.0.0', () => {
      console.log(`Backend listening on port ${env.port}`);
      startSubjectAttendanceWorker();
      if (!demoOnly) {startPushWorker();startAttendanceLifecycleWorker();}
    });
  } catch (error) {
    console.error("Failed to start backend.");
    console.error(error);
    process.exit(1);
  }
}

start();
