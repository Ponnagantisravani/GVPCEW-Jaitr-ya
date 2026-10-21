export const studentRole=(role:string)=>role==='student'||role==='student_coordinator';
export function attendanceRole(roles:string[]):'student'|'student_coordinator'|null {
  if(roles.includes('student_coordinator'))return 'student_coordinator';
  return roles.includes('student')?'student':null;
}
