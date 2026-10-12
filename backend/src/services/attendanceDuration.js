import {z} from 'zod';
export const attendanceDurationSchema=z.number().int().min(30).max(1800).default(60);
export const parseAttendanceDuration=value=>attendanceDurationSchema.parse(value);
