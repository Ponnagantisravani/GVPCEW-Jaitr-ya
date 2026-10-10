import fs from 'fs';
import { extractPdfPages, detectDocumentType, parseCourseStructure, parseStructuredSyllabusContent } from './src/services/syllabusPdfParser.js';

// Test mock 4-year scheme text
const mockSchemeText = `
GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN (Autonomous)
SCHEME OF INSTRUCTION & EXAMINATION (R-24)
B.TECH. - COMPUTER SCIENCE AND ENGINEERING

I Year - I Semester
Course Code Category Course Title L P Internal External Total Credits
24BM11RC01 BS Calculus and Differential Equations 3 0 30 70 100 3
24BC11RC01 BS Green Chemistry 3 0 30 70 100 3
24HE11RC01 HSS English 3 0 30 70 100 3
24CT11RC01 ES Fundamentals of Computers 3 0 30 70 100 3
24CT11RC02 ES Problem Solving using C 3 0 30 70 100 3

II Year - I Semester
24CT11RC11 PC Computer Organization 3 0 30 70 100 3
24CT11RC09 PC Data Structures 3 0 30 70 100 3

III Year - I Semester
24CT11RC22 PC Computer Networks 3 0 30 70 100 3
OE-1 OE Open Elective - 1 3 0 30 70 100 3
`;

const mockPages = [
  { pageNum: 1, pageIndex: 0, text: mockSchemeText, rawLines: mockSchemeText.split('\n').map(l => l.trim()).filter(Boolean) }
];

const docType = detectDocumentType(mockPages);
console.log('Detected Document Type:', docType);

const courseIndex = parseCourseStructure(mockPages);
console.log('Course Structure Index count:', courseIndex.length);
console.log(JSON.stringify(courseIndex, null, 2));
