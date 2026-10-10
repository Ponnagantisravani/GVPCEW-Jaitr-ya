import { Router } from '../utils/router.js';
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";
import { enrollmentRouter } from "./enrollment.js";
import { datasetRouter } from "./dataset.js";
import { studentRouter } from './student.js';
import {coordinatorRouter} from './coordinator.js';
import { portalRouter } from './portal.js';
import { attendanceSessionRouter } from './attendanceSessions.js';
import { timetableRouter } from './timetable.js';
import { facultyLeaveRequestsRouter } from './facultyLeaveRequests.js';
import { syllabusRouter } from './syllabus.js';

export const router = Router();
import { timetableGeneratorRouter } from './timetableGenerator.js';

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/enrollment", enrollmentRouter);
router.use("/dataset", datasetRouter);
router.use('/students', studentRouter);
router.use('/coordinator',coordinatorRouter);
router.use('/', portalRouter);
router.use('/timetable', timetableGeneratorRouter);
router.use('/attendance-sessions', attendanceSessionRouter);
router.use('/timetables', timetableRouter);
router.use('/faculty/leave-requests', facultyLeaveRequestsRouter);
router.use('/syllabi', syllabusRouter);

import { academicDocumentsRouter } from './academicDocuments.js';
router.use('/academic-documents',academicDocumentsRouter);

import { facultyRouter } from './faculty.js';
import {attendanceUploadsRouter} from './attendanceUploads.js';
import { managementRouter } from './management.js';
import { notificationsRouter } from './notifications.js';
router.use('/faculty',facultyRouter);
router.use('/faculty/attendance-uploads',attendanceUploadsRouter);
router.use('/management',managementRouter);
router.use('/notifications',notificationsRouter);

import { faceAnalysisRouter } from './faceAnalysis.js';
router.use('/auth',faceAnalysisRouter);

import {bluetoothAttendanceRouter} from './bluetoothAttendance.js';
router.use('/bluetooth-attendance',bluetoothAttendanceRouter);
import {accessResponsibilitiesRouter} from './accessResponsibilities.js';
router.use('/admin/access-responsibilities',accessResponsibilitiesRouter);
import {facultyAssignmentsRouter} from './facultyAssignments.js';
router.use('/faculty-assignments',facultyAssignmentsRouter);

import {mobileAttendanceRouter} from './mobileAttendance.js';
import {mobileEnrollmentRouter,mobileDevicesRouter} from './mobileEnrollment.js';
router.use('/attendance',mobileAttendanceRouter);
router.use('/mobile/enrollment',mobileEnrollmentRouter);
router.use('/devices',mobileDevicesRouter);
