import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { verifyDatabaseConnection } from "./config/db.js";

import {startPushWorker} from './services/mobilePushQueue.js';
const app = createApp();

async function start() {
  try {
    await verifyDatabaseConnection();

    app.listen(env.port, "0.0.0.0", () => {
      console.log(`Backend listening on port ${env.port}`);
      startPushWorker();
    });
  } catch (error) {
    console.error("Failed to start backend.");
    console.error(error);
    process.exit(1);
  }
}

start();