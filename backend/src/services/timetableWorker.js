import {parentPort,workerData} from 'node:worker_threads';
import {generateTimetable} from './timetableSolver.js';
parentPort.postMessage(generateTimetable(workerData.input,workerData.settings));
