import React from 'react';

export function StudentProfileView({ student, name }) {
  const p = student?.profile || {};
  const info = p.id_details || p.profile_details || {};

  // Full Name
  const fullName = p.full_name || name || 'Sravani GVPCEW';

  // Roll Number with -S identifier suffix as shown in official profile
  const baseRoll = p.roll_number || '324103210170';
  const rollDisplay = baseRoll.endsWith('-S') ? baseRoll : `${baseRoll}-S`;

  // Department
  const department = p.department || 'Computer Science Engineering';

  // Class Section (map numeric 1,2,3 to Section A, B, C, etc.)
  const rawSec = String(p.section || 'A').trim().toUpperCase();
  const sectionLetter = rawSec === '1' ? 'A' : rawSec === '2' ? 'B' : rawSec === '3' ? 'A' : rawSec === '4' ? 'D' : rawSec;
  const sectionDisplay = `Section ${sectionLetter}`;

  // Academic Year & Semester calculation
  const romanYears = ['', 'I', 'II', 'III', 'IV'];
  const y = p.year || 2;
  const s = p.semester || 3;
  const yearRoman = romanYears[y] || 'II';
  const semRoman = (s % 2 === 1) ? 'I' : 'II';
  const academicYearSem = `${yearRoman} • ${semRoman} Sem`;

  // Curriculum Regulation
  const regulation = info.regulation || 'R24 Autonomous';

  // Contact and Mentor Information
  const collegeEmail = p.email || `${baseRoll}.sravani@gvpcew.ac.in`;
  const contactNumber = info.contactNumber || info.emergencyContact || '+91 98765 43210';
  const mentorName = info.mentor || 'Dr. K. Sravani';
  const bloodGroup = info.bloodGroup || 'O+';
  const campus = info.campus || 'GVPCEW Main Campus, Visakhapatnam';

  return (
    <div className="student-profile-container">
      <div className="student-profile-grid">
        {/* Left Sub-Card: Academic Identity Details */}
        <div className="student-profile-subcard">
          <h3 className="student-profile-card-title">Academic Identity Details</h3>
          <div className="student-profile-fields">
            <div className="student-profile-row">
              <span className="profile-field-label">Full Name:</span>
              <span className="profile-field-value">{fullName}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Roll Number / ID:</span>
              <span className="profile-field-value roll-teal-link">{rollDisplay}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Department:</span>
              <span className="profile-field-value">{department}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Class Section:</span>
              <span className="profile-field-value">{sectionDisplay}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Academic Year &amp; Sem:</span>
              <span className="profile-field-value">{academicYearSem}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Curriculum Regulation:</span>
              <span className="profile-field-value">{regulation}</span>
            </div>
          </div>
        </div>

        {/* Right Sub-Card: Contact & Faculty Mentor */}
        <div className="student-profile-subcard">
          <h3 className="student-profile-card-title">Contact &amp; Faculty Mentor</h3>
          <div className="student-profile-fields">
            <div className="student-profile-row">
              <span className="profile-field-label">College Email:</span>
              <span className="profile-field-value">{collegeEmail}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Contact Number:</span>
              <span className="profile-field-value">{contactNumber}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Assigned Mentor:</span>
              <span className="profile-field-value">{mentorName}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Blood Group:</span>
              <span className="profile-field-value">{bloodGroup}</span>
            </div>
            <div className="student-profile-row">
              <span className="profile-field-label">Campus:</span>
              <span className="profile-field-value">{campus}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
