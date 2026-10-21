import {attendanceRole} from '../src/attendanceAccess';
test('coordinator attendance takes priority over other assigned campus roles',()=>{expect(attendanceRole(['admin','faculty','student','student_coordinator'])).toBe('student_coordinator');});
test('ordinary students receive only the student attendance page',()=>{expect(attendanceRole(['student'])).toBe('student');expect(attendanceRole(['faculty'])).toBeNull();expect(attendanceRole([])).toBeNull();});
