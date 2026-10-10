import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parseSyllabusPdf } from '../backend/src/services/syllabusPdfParser.js';
import assert from 'node:assert/strict';

async function generateSimulated4YearPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  function drawText(page, text, x, y, size = 12, isBold = false) {
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1)
    });
  }

  // Page 1: Title & Autonomous Cover
  let p = doc.addPage([595, 842]);
  drawText(p, 'GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN', 50, 780, 14, true);
  drawText(p, '(Autonomous)', 240, 750, 12, true);
  drawText(p, 'B.TECH COMPUTER SCIENCE & ENGINEERING — 4 YEAR CURRICULUM', 60, 700, 13, true);

  // Pages 2-5: Scheme of Instruction / Course Structure Tables (contains multiple course codes on single page)
  for (let s = 1; s <= 4; s++) {
    p = doc.addPage([595, 842]);
    drawText(p, 'SCHEME OF INSTRUCTION & EVALUATION', 150, 780, 14, true);
    drawText(p, `I B.TECH — SEMESTER ${s} COURSE STRUCTURE`, 160, 750, 12, true);
    drawText(p, 'S.No  Course Code   Course Title                            L  T  P  Credits Internal External Total', 40, 700, 10, true);
    drawText(p, '1     24BM11RC01    Calculus and Differential Equations     3  0  0  3       30       70       100', 40, 670, 9);
    drawText(p, '2     24BC11RC01    Green Chemistry                         3  0  0  3       30       70       100', 40, 650, 9);
    drawText(p, '3     24HE11RC01    English                                 2  0  0  2       30       70       100', 40, 630, 9);
    drawText(p, '4     24CT11RC01    C Programming & Data Structures         3  0  0  3       30       70       100', 40, 610, 9);
    drawText(p, '5     24ME11ES01    Engineering Graphics                    1  0  4  3       30       70       100', 40, 590, 9);
  }

  // Blank filler pages 6-41 (e.g. academic regulations, grading guidelines)
  for (let pageNum = 6; pageNum <= 41; pageNum++) {
    p = doc.addPage([595, 842]);
    drawText(p, `Academic Regulations & Guidelines - Page ${pageNum}`, 100, 750, 11);
  }

  // Page 42-48: Subject 1 (24BM11RC01) - 7 pages
  // Page 42: Detailed syllabus start
  p = doc.addPage([595, 842]);
  drawText(p, 'BS CALCULUS AND DIFFERENTIAL EQUATIONS', 120, 780, 14, true);
  drawText(p, '(Common to all branches of Engineering)', 180, 755, 11);
  drawText(p, 'Course Code: 24BM11RC01', 50, 720, 12, true);
  drawText(p, 'L-T-P-C: 3-0-0-3', 450, 720, 12, true);
  drawText(p, 'Course Objectives:', 50, 680, 12, true);
  drawText(p, 'To familiarize students with foundational calculus concepts.', 50, 655, 10);
  drawText(p, 'Course Outcomes: At the end of the Course, the student shall be able to:', 50, 620, 11, true);
  drawText(p, 'CO1: Solve first order ordinary differential equations.', 50, 595, 10);
  drawText(p, 'CO2: Apply mean value theorems to real problems.', 50, 575, 10);

  // Page 43: Unit I
  p = doc.addPage([595, 842]);
  drawText(p, 'UNIT-I 09 Lectures', 50, 780, 12, true);
  drawText(p, 'First Order Ordinary Differential Equations and applications.', 50, 750, 10);

  // Page 44: Unit II
  p = doc.addPage([595, 842]);
  drawText(p, 'UNIT-II 09 Lectures', 50, 780, 12, true);
  drawText(p, 'Linear Differential Equations of Higher Order with constant coefficients.', 50, 750, 10);

  // Page 45: Unit III
  p = doc.addPage([595, 842]);
  drawText(p, 'UNIT-III 12 Lectures', 50, 780, 12, true);
  drawText(p, 'Partial Differentiation, total derivatives, and chain rule.', 50, 750, 10);

  // Page 46: Unit IV
  p = doc.addPage([595, 842]);
  drawText(p, 'UNIT-IV 09 Lectures', 50, 780, 12, true);
  drawText(p, 'Multiple Integrals, double and triple integrals in Cartesian coordinates.', 50, 750, 10);

  // Page 47: Unit V
  p = doc.addPage([595, 842]);
  drawText(p, 'UNIT-V 09 Lectures', 50, 780, 12, true);
  drawText(p, 'Vector Calculus, gradient, divergence, curl, and line integrals.', 50, 750, 10);

  // Page 48: Textbooks & References (ends Subject 1)
  p = doc.addPage([595, 842]);
  drawText(p, 'TEXT BOOKS:', 50, 780, 12, true);
  drawText(p, '1. B.S. Grewal, "Higher Engineering Mathematics", Khanna Publishers.', 50, 750, 10);
  drawText(p, 'REFERENCE BOOKS:', 50, 710, 12, true);
  drawText(p, '1. Erwin Kreyszig, "Advanced Engineering Mathematics", John Wiley & Sons.', 50, 680, 10);

  // Page 49-56: Subject 2 (24BC11RC01) - 8 pages
  // Page 49: Detailed syllabus start
  p = doc.addPage([595, 842]);
  drawText(p, 'BS GREEN CHEMISTRY', 180, 780, 14, true);
  drawText(p, 'Course Code: 24BC11RC01', 50, 720, 12, true);
  drawText(p, 'L-T-P-C: 3-0-0-3', 450, 720, 12, true);
  drawText(p, 'Course Objectives:', 50, 680, 12, true);
  drawText(p, 'Understand modern principles of green chemistry and applications.', 50, 655, 10);

  // Pages 50-55: Units I to V
  for (let u = 1; u <= 5; u++) {
    p = doc.addPage([595, 842]);
    drawText(p, `UNIT-${['I', 'II', 'III', 'IV', 'V'][u - 1]} 09 Lectures`, 50, 780, 12, true);
    drawText(p, `Green Chemistry topic content for Unit ${u}.`, 50, 750, 10);
  }

  // Page 56: Textbooks for Chemistry
  p = doc.addPage([595, 842]);
  drawText(p, 'TEXT BOOKS:', 50, 780, 12, true);
  drawText(p, '1. P.C. Jain and Monica Jain, "Engineering Chemistry", Dhanpat Rai.', 50, 750, 10);

  // Page 57-63: Subject 3 (24HE11RC01) - 7 pages
  p = doc.addPage([595, 842]);
  drawText(p, 'HSS ENGLISH', 200, 780, 14, true);
  drawText(p, 'Course Code: 24HE11RC01', 50, 720, 12, true);
  drawText(p, 'L-T-P-C: 2-0-0-2', 450, 720, 12, true);

  for (let u = 1; u <= 5; u++) {
    p = doc.addPage([595, 842]);
    drawText(p, `UNIT-${['I', 'II', 'III', 'IV', 'V'][u - 1]} 06 Lectures`, 50, 780, 12, true);
    drawText(p, `English communication module ${u}.`, 50, 750, 10);
  }

  p = doc.addPage([595, 842]);
  drawText(p, 'TEXT BOOKS:', 50, 780, 12, true);
  drawText(p, '1. Technical Communication, Oxford University Press.', 50, 750, 10);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

async function runTest() {
  console.log('Generating 63-page simulated 4-Year B.Tech Curriculum PDF...');
  const buffer = await generateSimulated4YearPdf();

  console.log(`Generated buffer size: ${buffer.length} bytes.`);
  console.log('Executing parseSyllabusPdf()...\n');

  const results = await parseSyllabusPdf(buffer, { department: 'CSE' });

  console.log('\n--- VERIFYING RESULTS ---');
  assert.equal(results.length, 3, `Expected 3 subjects, got ${results.length}`);

  // Subject 1: 24BM11RC01
  const sub1 = results.find(r => r.courseCode === '24BM11RC01');
  assert.ok(sub1, 'Subject 1 not found');
  console.log(`Subject 1: ${sub1.courseCode} | Start: ${sub1.startPage} | End: ${sub1.endPage} | Total: ${sub1.totalPages}`);
  assert.equal(sub1.startPage, 42, `Expected startPage 42, got ${sub1.startPage}`);
  assert.equal(sub1.endPage, 48, `Expected endPage 48, got ${sub1.endPage}`);
  assert.equal(sub1.totalPages, 7, `Expected totalPages 7, got ${sub1.totalPages}`);
  assert.deepEqual(sub1.pages, [42, 43, 44, 45, 46, 47, 48]);
  assert.ok(sub1.pdf_base64 && sub1.pdf_size_bytes > 0, 'Sliced PDF missing for sub1');

  // Subject 2: 24BC11RC01
  const sub2 = results.find(r => r.courseCode === '24BC11RC01');
  assert.ok(sub2, 'Subject 2 not found');
  console.log(`Subject 2: ${sub2.courseCode} | Start: ${sub2.startPage} | End: ${sub2.endPage} | Total: ${sub2.totalPages}`);
  assert.equal(sub2.startPage, 49, `Expected startPage 49, got ${sub2.startPage}`);
  assert.equal(sub2.endPage, 56, `Expected endPage 56, got ${sub2.endPage}`);
  assert.equal(sub2.totalPages, 8, `Expected totalPages 8, got ${sub2.totalPages}`);
  assert.deepEqual(sub2.pages, [49, 50, 51, 52, 53, 54, 55, 56]);
  assert.ok(sub2.pdf_base64 && sub2.pdf_size_bytes > 0, 'Sliced PDF missing for sub2');

  // Subject 3: 24HE11RC01 (Final Course)
  const sub3 = results.find(r => r.courseCode === '24HE11RC01');
  assert.ok(sub3, 'Subject 3 not found');
  console.log(`Subject 3: ${sub3.courseCode} | Start: ${sub3.startPage} | End: ${sub3.endPage} | Total: ${sub3.totalPages}`);
  assert.equal(sub3.startPage, 57, `Expected startPage 57, got ${sub3.startPage}`);
  assert.equal(sub3.endPage, 63, `Expected endPage 63, got ${sub3.endPage}`);
  assert.equal(sub3.totalPages, 7, `Expected totalPages 7, got ${sub3.totalPages}`);
  assert.deepEqual(sub3.pages, [57, 58, 59, 60, 61, 62, 63]);
  assert.ok(sub3.pdf_base64 && sub3.pdf_size_bytes > 0, 'Sliced PDF missing for sub3');

  // Validate that no fields are NaN, undefined, or defaulted to 1
  for (const s of results) {
    assert.ok(!isNaN(s.startPage) && s.startPage >= 42, `Invalid startPage for ${s.courseCode}`);
    assert.ok(!isNaN(s.endPage) && s.endPage >= s.startPage, `Invalid endPage for ${s.courseCode}`);
    assert.ok(!isNaN(s.totalPages) && s.totalPages === s.endPage - s.startPage + 1, `Invalid totalPages for ${s.courseCode}`);
    assert.ok(s.fileName && s.fileName.startsWith(s.courseCode), `Invalid fileName for ${s.courseCode}`);
  }

  console.log('\n ALL SIMULATION ASSERTIONS PASSED WITH 100% ACCURACY!');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
