import { pool } from '../src/config/db.js';
import { notifyPublication } from '../src/services/publicationAccess.js';

const INITIAL_TIMETABLES = {
  cse_sec1: {
    room: 'Room 301',
    incharge: 'Dr. K. Sravani, Associate Professor',
    grid: {
      Monday: {
        p1: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 301', type: 'theory' },
        p2: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 301', type: 'theory' },
        p3: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 301', type: 'theory' },
        p4: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room 301', type: 'theory' },
        p5: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p6: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p7: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' }
      },
      Tuesday: {
        p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 301', type: 'theory' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 301', type: 'theory' },
        p3: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 301', type: 'theory' },
        p4: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 301', type: 'theory' },
        p5: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p6: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p7: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' }
      },
      Wednesday: {
        p1: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 301', type: 'theory' },
        p2: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 301', type: 'theory' },
        p3: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 301', type: 'theory' },
        p4: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 301', type: 'theory' },
        p5: { subject: 'Full Stack Development', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room 301', type: 'elective' },
        p6: { subject: 'Full Stack Development', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room 301', type: 'elective' },
        p7: { subject: 'Library / Sports', code: 'LIB-01', faculty: 'Librarian', room: 'Library', type: 'library' }
      },
      Thursday: {
        p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 301', type: 'theory' },
        p2: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 301', type: 'theory' },
        p3: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 301', type: 'theory' },
        p4: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 301', type: 'theory' },
        p5: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p6: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p7: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' }
      },
      Friday: {
        p1: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 301', type: 'theory' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 301', type: 'theory' },
        p3: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 301', type: 'theory' },
        p4: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 301', type: 'theory' },
        p5: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p6: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p7: { subject: 'Social Media Analytics [Honors]', code: '24CT11HN02', faculty: 'Dr. A. Srinivas', room: 'Room 301', type: 'elective' }
      },
      Saturday: {
        p1: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 301', type: 'theory' },
        p2: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room 301', type: 'theory' },
        p3: { subject: 'DAA Tutorial & Doubt Clearing', code: '24CT11RC18-T', faculty: 'Dr. M. Lakshmi', room: 'Room 301', type: 'tutorial' },
        p4: { subject: 'Sports & Student Club Activities', code: 'ECA-02', faculty: 'Physical Director', room: 'Sports Ground', type: 'library' },
        p5: { subject: 'Technical Seminar & Presentation', code: '24CT11SM01', faculty: 'Dr. K. Sravani', room: 'Seminar Hall 1', type: 'tutorial' },
        p6: { subject: 'Remedial / Placement Training', code: 'CRT-02', faculty: 'Training Officer', room: 'Room 301', type: 'elective' },
        p7: { subject: 'Weekly Faculty Review & Feedback', code: 'REV-02', faculty: 'Dr. K. Sravani', room: 'Room 301', type: 'library' }
      }
    }
  },
  cse_sec2: {
    room: 'Room 302',
    incharge: 'Dr. M. Lakshmi, Professor',
    grid: {
      Monday: {
        p1: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 302', type: 'theory' },
        p2: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 302', type: 'theory' },
        p3: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 302', type: 'theory' },
        p4: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 302', type: 'theory' },
        p5: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p6: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p7: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' }
      },
      Tuesday: {
        p1: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 302', type: 'theory' },
        p2: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 302', type: 'theory' },
        p3: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 302', type: 'theory' },
        p4: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 302', type: 'theory' },
        p5: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p6: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p7: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' }
      },
      Wednesday: {
        p1: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 302', type: 'theory' },
        p2: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 302', type: 'theory' },
        p3: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 302', type: 'theory' },
        p4: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room 302', type: 'theory' },
        p5: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p6: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p7: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' }
      },
      Thursday: {
        p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 302', type: 'theory' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 302', type: 'theory' },
        p3: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 302', type: 'theory' },
        p4: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 302', type: 'theory' },
        p5: { subject: 'Full Stack Development', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room 302', type: 'elective' },
        p6: { subject: 'Full Stack Development', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room 302', type: 'elective' },
        p7: { subject: 'Library / Mentoring', code: 'LIB-01', faculty: 'Librarian', room: 'Library', type: 'library' }
      },
      Friday: {
        p1: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 302', type: 'theory' },
        p2: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 302', type: 'theory' },
        p3: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 302', type: 'theory' },
        p4: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 302', type: 'theory' },
        p5: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p6: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p7: { subject: 'Social Media Analytics', code: '24CT11HN02', faculty: 'Dr. A. Srinivas', room: 'Room 302', type: 'elective' }
      },
      Saturday: {
        p1: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 302', type: 'theory' },
        p2: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room 302', type: 'theory' },
        p3: { subject: 'DAA Tutorial & Doubt Clearing', code: '24CT11RC18-T', faculty: 'Dr. M. Lakshmi', room: 'Room 302', type: 'tutorial' },
        p4: { subject: 'Sports & Student Club Activities', code: 'ECA-02', faculty: 'Physical Director', room: 'Sports Ground', type: 'library' },
        p5: { subject: 'Technical Seminar & Presentation', code: '24CT11SM01', faculty: 'Dr. K. Sravani', room: 'Seminar Hall 1', type: 'tutorial' },
        p6: { subject: 'Placement Training', code: 'CRT-02', faculty: 'Training Officer', room: 'Room 302', type: 'elective' },
        p7: { subject: 'Weekly Review', code: 'REV-02', faculty: 'Dr. M. Lakshmi', room: 'Room 302', type: 'library' }
      }
    }
  },
  cse_sec3: {
    room: 'Room L19',
    incharge: 'Dr. K. Sravani / Dr. M. Lakshmi',
    grid: {
      Monday: {
        p1: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room L19', type: 'theory' },
        p2: { subject: 'Information Retrieved System (IRS)', code: '24CT11OE01', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'elective' },
        p3: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room L19', type: 'theory' },
        p4: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room L19', type: 'theory' },
        p5: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p6: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p7: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' }
      },
      Tuesday: {
        p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room L19', type: 'theory' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room L19', type: 'theory' },
        p3: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room L19', type: 'theory' },
        p4: { subject: 'Information Retrieved System (IRS)', code: '24CT11OE01', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'elective' },
        p5: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p6: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p7: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' }
      },
      Wednesday: {
        p1: { subject: 'Information Retrieved System (IRS)', code: '24CT11OE01', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'elective' },
        p2: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room L19', type: 'theory' },
        p3: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room L19', type: 'theory' },
        p4: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room L19', type: 'theory' },
        p5: { subject: 'Full Stack Development (MERN)', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room L19', type: 'elective' },
        p6: { subject: 'Full Stack Development (MERN)', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room L19', type: 'elective' },
        p7: { subject: 'Library / Sports', code: 'LIB-01', faculty: 'Librarian', room: 'Library', type: 'library' }
      },
      Thursday: {
        p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room L19', type: 'theory' },
        p2: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room L19', type: 'theory' },
        p3: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room L19', type: 'theory' },
        p4: { subject: 'Information Retrieved System (IRS)', code: '24CT11OE01', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'elective' },
        p5: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p6: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p7: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' }
      },
      Friday: {
        p1: { subject: 'Information Retrieved System (IRS)', code: '24CT11OE01', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'elective' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room L19', type: 'theory' },
        p3: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room L19', type: 'theory' },
        p4: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room L19', type: 'theory' },
        p5: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p6: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p7: { subject: 'Social Media Analytics [Honors]', code: '24CT11HN02', faculty: 'Dr. A. Srinivas', room: 'Room L19', type: 'elective' }
      },
      Saturday: {
        p1: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room L19', type: 'theory' },
        p2: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room L19', type: 'theory' },
        p3: { subject: 'IRS Tutorial & Doubt Clearing', code: '24CT11OE01-T', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'tutorial' },
        p4: { subject: 'Sports & Student Club Activities', code: 'ECA-02', faculty: 'Physical Director', room: 'Sports Ground', type: 'library' },
        p5: { subject: 'Technical Seminar & Presentation', code: '24CT11SM01', faculty: 'Dr. K. Sravani', room: 'Seminar Hall 1', type: 'tutorial' },
        p6: { subject: 'Remedial / Placement Training', code: 'CRT-02', faculty: 'Training Officer', room: 'Room L19', type: 'elective' },
        p7: { subject: 'Weekly Faculty Review & Feedback', code: 'REV-02', faculty: 'Dr. K. Sravani', room: 'Room L19', type: 'library' }
      }
    }
  },
  cse_sec4: {
    room: 'Room 304',
    incharge: 'Dr. A. Srinivas, Associate Professor',
    grid: {
      Monday: {
        p1: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 304', type: 'theory' },
        p2: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 304', type: 'theory' },
        p3: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'theory' },
        p4: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 304', type: 'theory' },
        p5: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p6: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' },
        p7: { subject: 'Algorithms Lab', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi', room: 'Lab 2', type: 'lab' }
      },
      Tuesday: {
        p1: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 304', type: 'theory' },
        p2: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'theory' },
        p3: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 304', type: 'theory' },
        p4: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 304', type: 'theory' },
        p5: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p6: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' },
        p7: { subject: 'Database Management Systems Lab', code: '24CT11LC08', faculty: 'Prof. R. Kiran', room: 'Lab 1', type: 'lab' }
      },
      Wednesday: {
        p1: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 304', type: 'theory' },
        p2: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'theory' },
        p3: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 304', type: 'theory' },
        p4: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room 304', type: 'theory' },
        p5: { subject: 'Full Stack Development', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room 304', type: 'elective' },
        p6: { subject: 'Full Stack Development', code: '24CT11SC04', faculty: 'Dr. K. Sravani', room: 'Room 304', type: 'elective' },
        p7: { subject: 'Library / Mentoring', code: 'LIB-01', faculty: 'Librarian', room: 'Library', type: 'library' }
      },
      Thursday: {
        p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'theory' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 304', type: 'theory' },
        p3: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 304', type: 'theory' },
        p4: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 304', type: 'theory' },
        p5: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p6: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
        p7: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' }
      },
      Friday: {
        p1: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room 304', type: 'theory' },
        p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room 304', type: 'theory' },
        p3: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'theory' },
        p4: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room 304', type: 'theory' },
        p5: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p6: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
        p7: { subject: 'Social Media Analytics', code: '24CT11HN02', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'elective' }
      },
      Saturday: {
        p1: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room: 'Room 304', type: 'theory' },
        p2: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room: 'Room 304', type: 'theory' },
        p3: { subject: 'DAA Tutorial & Doubt Clearing', code: '24CT11RC18-T', faculty: 'Dr. M. Lakshmi', room: 'Room 304', type: 'tutorial' },
        p4: { subject: 'Sports & Student Club Activities', code: 'ECA-02', faculty: 'Physical Director', room: 'Sports Ground', type: 'library' },
        p5: { subject: 'Technical Seminar & Presentation', code: '24CT11SM01', faculty: 'Dr. K. Sravani', room: 'Seminar Hall 1', type: 'tutorial' },
        p6: { subject: 'Remedial / Placement Training', code: 'CRT-02', faculty: 'Training Officer', room: 'Room 304', type: 'elective' },
        p7: { subject: 'Weekly Faculty Review & Feedback', code: 'REV-02', faculty: 'Dr. A. Srinivas', room: 'Room 304', type: 'library' }
      }
    }
  }
};

const PERIOD_TIMES = {
  p1: { start: '08:40:00', end: '09:30:00' },
  p2: { start: '09:30:00', end: '10:20:00' },
  p3: { start: '10:20:00', end: '11:10:00' },
  p4: { start: '11:10:00', end: '12:00:00' },
  lunch: null,
  p5: { start: '12:50:00', end: '13:40:00' },
  p6: { start: '13:40:00', end: '14:30:00' },
  p7: { start: '14:30:00', end: '15:20:00' }
};

const DAY_MAP = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0
};

async function main() {
  console.log('--- Publishing Year 2 CSE Timetables to Database ---');
  const client = await pool.connect();

  try {
    await client.query('begin');

    const coordinator = await client.query(
      `select u.id from users u join user_roles ur on ur.user_id=u.id where ur.role='academic_coordinator' limit 1`
    );
    const coordId = coordinator.rows[0]?.id;

    // Load reference data
    const depts = await client.query(`select id, name from departments where name ilike '%computer science%' or name='CSE' limit 1`);
    const cseDeptId = depts.rows[0].id;

    const allFaculty = await client.query(`select f.id, u.full_name, u.email from faculty f join users u on u.id=f.user_id`);
    const allRooms = await client.query(`select id, room_code from classrooms`);
    const allSubjects = await client.query(`select id, code, name from subjects`);

    const sections = await client.query(
      `select id, section_name, academic_year from academic_sections where department_id=$1 and year_number=2 and semester_number=3 order by section_name`,
      [cseDeptId]
    );

    console.log(`Found ${sections.rows.length} sections for Year 2 CSE.`);

    let totalSlotsInserted = 0;
    const affectedSectionIds = [];

    for (const sec of sections.rows) {
      const secKey = `cse_sec${sec.section_name}`;
      const tData = INITIAL_TIMETABLES[secKey];
      if (!tData) {
        console.log(`No timetable definition for ${secKey}, skipping.`);
        continue;
      }

      console.log(`Publishing ${secKey} (Section ${sec.section_name}, ID: ${sec.id})...`);
      affectedSectionIds.push(sec.id);

      // 1. Publish into academic_documents
      const docPayload = {
        id: secKey,
        title: `II B.Tech II Semester (2025–26) — Computer Science & Engineering (Sec ${sec.section_name})`,
        academicYear: '2025–2026',
        classroom: tData.room,
        incharge: tData.incharge,
        status: 'Published',
        updatedAt: '2026-08-17',
        grid: tData.grid
      };

      await client.query(
        `insert into academic_documents(kind, key, draft, published, updated_by, published_at, academic_section_ids, updated_at)
         values('timetable', $1, $2, $2, $3, now(), $4, now())
         on conflict(kind, key) do update set
           draft = excluded.draft,
           published = excluded.published,
           published_at = now(),
           updated_by = excluded.updated_by,
           academic_section_ids = excluded.academic_section_ids,
           updated_at = now()`,
        [secKey, docPayload, coordId, [sec.id]]
      );

      // 2. Clear old timetable slots
      await client.query(`delete from timetable where academic_section_id=$1`, [sec.id]);

      // 3. Insert each slot
      for (const [dayName, daySlots] of Object.entries(tData.grid)) {
        const dayNum = DAY_MAP[dayName.toLowerCase()];
        if (dayNum === undefined) continue;

        for (const [pId, slot] of Object.entries(daySlots)) {
          if (!slot || !slot.subject || slot.type === 'break' || /lunch|break/i.test(slot.subject)) continue;

          const times = PERIOD_TIMES[pId];
          if (!times) continue;

          // Subject match or create
          let subj = allSubjects.rows.find(s =>
            (slot.code && s.code.toLowerCase() === slot.code.trim().toLowerCase()) ||
            s.name.toLowerCase() === slot.subject.trim().toLowerCase()
          );
          if (!subj) {
            const insSubj = await client.query(
              `insert into subjects(code, name, department_id) values($1, $2, $3) returning id, code, name`,
              [slot.code || `24CT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`, slot.subject.trim(), cseDeptId]
            );
            subj = insSubj.rows[0];
            allSubjects.rows.push(subj);
          }

          // Faculty match or pick
          let fac = allFaculty.rows.find(f => {
            if (!slot.faculty) return false;
            const fName = f.full_name.toLowerCase();
            const sFac = slot.faculty.toLowerCase().replace(/dr\.|mr\.|mrs\.|prof\./g, '').trim();
            return fName.includes(sFac) || sFac.includes(fName.replace(/dr\.|mr\.|mrs\.|prof\./g, '').trim());
          });
          if (!fac) {
            fac = allFaculty.rows[0];
          }

          // Classroom match or create
          const roomCode = (slot.room || tData.room || '301').replace(/room\s*/i, '').trim();
          let rm = allRooms.rows.find(r => r.room_code.toLowerCase() === roomCode.toLowerCase());
          if (!rm) {
            const insRm = await client.query(
              `insert into classrooms(room_code, building_name, room_name, active) values($1, 'Academic Block', 'Room ' || $1, true) returning id, room_code`,
              [roomCode]
            );
            rm = insRm.rows[0];
            allRooms.rows.push(rm);
          }

          await client.query(
            `insert into timetable(
              subject_id, faculty_id, classroom_id, academic_section_id,
              day_of_week, start_time, end_time, academic_year, entry_type,
              status, published_at, published_by, updated_at
            ) values($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', now(), $10, now())`,
            [
              subj.id, fac.id, rm.id, sec.id,
              dayNum, times.start, times.end,
              sec.academic_year || '2025-2026',
              slot.type === 'lab' ? 'lab' : 'class',
              coordId
            ]
          );
          totalSlotsInserted++;
        }
      }
    }

    // 4. Send notifications
    await notifyPublication(
      client,
      affectedSectionIds,
      'Official Class Timetable Published',
      'The official weekly timetable for II B.Tech II Semester has been published and is now live.',
      'academic'
    );

    await client.query('commit');
    console.log(`SUCCESS! Inserted ${totalSlotsInserted} published timetable slots across sections.`);

    // Verification queries
    const countCheck = await pool.query(
      `select x.section_name, count(t.id) slot_count
       from academic_sections x
       join timetable t on t.academic_section_id=x.id
       where x.department_id=$1 and x.year_number=2
       group by x.section_name
       order by x.section_name`,
      [cseDeptId]
    );
    console.log('Published slots per section in DB:');
    console.table(countCheck.rows);

    // Verify student timetable query
    const studentUser = await pool.query(
      `select u.id, u.full_name, s.academic_section_id
       from students s
       join users u on u.id=s.user_id
       where s.academic_section_id=$1 limit 1`,
      [affectedSectionIds[0]]
    );
    if (studentUser.rows.length) {
      const stu = studentUser.rows[0];
      const studentTimetable = await pool.query(
        `select t.id, t.day_of_week, t.start_time, su.name subject, u.full_name faculty
         from timetable t
         join subjects su on su.id=t.subject_id
         join faculty f on f.id=t.faculty_id
         join users u on u.id=f.user_id
         where t.status='published' and t.academic_section_id=$1
         order by t.day_of_week, t.start_time limit 5`,
        [stu.academic_section_id]
      );
      console.log(`Verification for student ${stu.full_name} (${studentTimetable.rows.length} preview rows):`);
      console.table(studentTimetable.rows);
    }

    // Verify faculty timetable query
    const facTimetable = await pool.query(
      `select u.full_name, count(t.id) classes_assigned
       from faculty f
       join users u on u.id=f.user_id
       join timetable t on t.faculty_id=f.id
       where t.status='published'
       group by u.full_name
       order by classes_assigned desc limit 8`
    );
    console.log('Top faculty teaching assignments in published timetable:');
    console.table(facTimetable.rows);

  } catch (err) {
    await client.query('rollback');
    console.error('FAILED to sync timetables:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
