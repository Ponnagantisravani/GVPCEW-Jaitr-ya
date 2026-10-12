export const rolePaths = {
  student: '/student.html', student_coordinator: '/student-coordinator.html',
  faculty: '/faculty.html', academic_coordinator: '/academic-coordinator.html', admin: '/admin.html'
};

export function assignedRoles(user) {
  // Older API versions return a single role. An explicit empty roles list
  // still means access has not been assigned.
  const roles = user?.roles === undefined ? [user?.role] : user.roles;
  return Array.isArray(roles) ? roles.filter(role => Object.hasOwn(rolePaths, role)) : [];
}

export function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem('gvpcew_session') || 'null');
    if (!session || typeof session.token !== 'string' || !session.token || !session.user ||
        (session.user.roles !== undefined && !Array.isArray(session.user.roles))) return null;
    const roles = assignedRoles(session.user);
    return roles.length ? {...session, user: {...session.user, roles}} : null;
  } catch { return null; }
}

export function preferredRole(user, requested) {
  const roles=assignedRoles(user);
  return roles.includes(requested)?requested:roles.includes(user?.role)?user.role:roles[0];
}
export function roleForPath(path) {
  return Object.keys(rolePaths).find(role=>rolePaths[role]===path) || ({'/student':'student','/faculty':'faculty','/admin':'admin','/student-coordinator':'student_coordinator','/academic-coordinator':'academic_coordinator','/student-dashboard':'student','/faculty-dashboard':'faculty','/admin-dashboard':'admin','/student/coordinator':'student_coordinator','/academic-coordinator/dashboard':'academic_coordinator'})[path];
}
export function accountStorageKey(key) { return key+':'+(readSession()?.user?.id||'signed-out'); }

export function rememberAttendanceLink() {
  const code = new URLSearchParams(window.location.search).get('attendanceCode');
  if (window.location.pathname === rolePaths.student && /^[A-Z0-9]{10}$/i.test(code || '')) {
    sessionStorage.setItem('gvpcew_attendance_code', code.toUpperCase());
  }
}

export function destinationForRole(role) {
  const code = sessionStorage.getItem('gvpcew_attendance_code');
  if (role === 'student' && /^[A-Z0-9]{10}$/.test(code || '')) {
    sessionStorage.removeItem('gvpcew_attendance_code');
    return rolePaths.student + '?attendanceCode=' + encodeURIComponent(code);
  }
  return rolePaths[role] || '/index.html';
}
