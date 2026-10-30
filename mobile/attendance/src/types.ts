export type CampusUser = {id: string; fullName: string; email: string; role: string; roles: string[]};
export type Session = {token: string; user: CampusUser; apiBase: string; activeRole?: string};
export type EnrollmentStatus = {student_id: string; face_enrolled: boolean; enrolled_at?: string | null; roll_number?: string; embedding_model: string; enrollment_status: 'required' | 'pending' | 'approved' | 'rejected'; setup_required: boolean; approved: boolean; bound_device_id: string | null};
export type EnrollmentCapture = {embedding_model: 'mobilefacenet-v1'; model_sha256: string; embedding: number[]; sample_count: number};
export type PermissionState = {missing: string[]; notificationsAllowed: boolean};

export type AttendanceSession = {id: string; section_id: string; period: string; started_at: string; expires_at: string; status: 'open' | 'closed'; broadcast?: boolean; late_expires_at?: string; monotonic_expires_at?: number; monotonic_late_expires_at?: number};
export type StartPeriod = {default_attendance?: boolean; default_period?: boolean; year_number?: number; department_name?: string; timetable_id: string; section_id: string; section_name: string; subject_name: string; start_time: string; end_time: string; session_id: string | null; expires_at: string | null; subject_id?:string; period?:number; subject_kind?:'theory'|'lab'; batch_id?:string};
export type SubjectStartOption={subject_id:string;name:string;kind:'theory'|'lab';faculty_name?:string;period_count?:number};
export type SubjectStartSlot={id:string;subject_id:string;code:string;name:string;period:number;start_time:string;end_time:string;manual_period?:boolean};
export type SubjectStartBatch={id:string;name:string;student_count:number};
export type SubjectStartOptions={section:{id:string;section_name:string;year_number:number};subjects:SubjectStartOption[];slots:SubjectStartSlot[];batches:SubjectStartBatch[];demo:boolean};
export type AttendanceStatus = {id: string; status: 'open' | 'closed'; expires_at: string; total: number; present: number; late: number; present_students?: {student_id:string;roll_number:string;full_name:string;status:'PRESENT'|'LATE'}[]};
export type PushEvent = {type: 'attendance_session'; session_id: string; section_id: string; user_id: string; expires_at: string; broadcast: 'true' | 'false'; opened?: 'true'};

export type BleToken = {token: string; valid_from: string; valid_to: string; expires_at: string; server_time: string; valid_for_ms: number};
export type BleReceipt = {sessionId: string; token: string; acceptedUntil: number};
export type BroadcastStatus = {session_id: string | null; state: 'stopped' | 'starting' | 'broadcasting' | 'failed'; message: string};

export type ChallengeType='blink';
export type AttendanceConfiguration={student_id:string;embedding_model:'mobilefacenet-v1';own_template:number[];similarity_threshold:number;package_name:string;cloud_project_number:string};
export type AttendanceChallenge={id:string;challenge_type:ChallengeType;expires_at:string;valid_for_ms:number};
export type AttendanceCapture={embedding_model:'mobilefacenet-v1';model_sha256:string;embedding:number[];sample_count:3;liveness_result:true;challenge_type:ChallengeType};
export type AttendanceSubmission={student_id:string;device_id:string;challenge_id:string;challenge_type:ChallengeType;liveness_result:true;embedding_model:'mobilefacenet-v1';embedding:number[];ble_token?:string;timestamp:string;integrity_token:string};
export type AttendanceRecord={status:'PRESENT'|'LATE'|'ABSENT';method:'ble'|'fallback'|null;is_late:boolean;similarity?:number};

export type AttendanceMethod='ble'|'fallback';
export type AttendanceCurrent={session:AttendanceSession|null;phase:'ble'|'fallback'|'closed'|null;own_record:AttendanceRecord|null;server_time:string;valid_for_ms:number};
