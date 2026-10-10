import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

  // Cover Page
  let p = doc.addPage([595, 842]);
  drawText(p, 'GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN', 50, 780, 14, true);
  drawText(p, '(Autonomous)', 240, 750, 12, true);

  // Scheme of instruction pages
  for (let s = 1; s <= 2; s++) {
    p = doc.addPage([595, 842]);
    drawText(p, 'SCHEME OF INSTRUCTION & EVALUATION', 150, 780, 14, true);
    drawText(p, '1  24BM11RC01  Calculus and Differential Equations  3 0 0 3  30 70 100', 40, 670, 9);
    drawText(p, '2  24BC11RC01  Green Chemistry                      3 0 0 3  30 70 100', 40, 650, 9);
  }

  // Filler pages 4 to 41
  for (let pageNum = 4; pageNum <= 41; pageNum++) {
    p = doc.addPage([595, 842]);
    drawText(p, `Academic Guidelines Page ${pageNum}`, 100, 750, 11);
  }

  // Course 1: 24BM11RC01 (Pages 42 to 48 = 7 pages)
  p = doc.addPage([595, 842]);
  drawText(p, 'BS CALCULUS AND DIFFERENTIAL EQUATIONS', 120, 780, 14, true);
  drawText(p, 'Course Code: 24BM11RC01', 50, 720, 12, true);
  drawText(p, 'L-T-P-C: 3-0-0-3', 450, 720, 12, true);
  drawText(p, 'Course Objectives:', 50, 680, 12, true);

  for (let u = 1; u <= 5; u++) {
    p = doc.addPage([595, 842]);
    drawText(p, `UNIT-${['I', 'II', 'III', 'IV', 'V'][u - 1]} 09 Lectures`, 50, 780, 12, true);
  }
  p = doc.addPage([595, 842]);
  drawText(p, 'TEXT BOOKS:', 50, 780, 12, true);

  // Course 2: 24BC11RC01 (Pages 49 to 55 = 7 pages)
  p = doc.addPage([595, 842]);
  drawText(p, 'BS GREEN CHEMISTRY', 180, 780, 14, true);
  drawText(p, 'Course Code: 24BC11RC01', 50, 720, 12, true);
  drawText(p, 'L-T-P-C: 3-0-0-3', 450, 720, 12, true);

  for (let u = 1; u <= 5; u++) {
    p = doc.addPage([595, 842]);
    drawText(p, `UNIT-${['I', 'II', 'III', 'IV', 'V'][u - 1]} 09 Lectures`, 50, 780, 12, true);
  }
  p = doc.addPage([595, 842]);
  drawText(p, 'TEXT BOOKS:', 50, 780, 12, true);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

async function testHttpDetect() {
  console.log('Testing HTTP /api/health...');
  const healthRes = await fetch('http://localhost:4000/api/health');
  assert.equal(healthRes.status, 200);
  console.log('Health check OK!');

  console.log('Generating base64 PDF payload...');
  const base64Pdf = await generateSimulated4YearPdf();

  // Test login or token if needed, or call with direct authorization or mock token
  // Let's create a coordinator token
  import('jsonwebtoken').then(async ({ default: jwt }) => {
    const token = jwt.sign({ sub: 'test-admin', role: 'admin' }, process.env.JWT_SECRET || 'gvpcew_secret_key_2026_production_v2_secure_token');

    console.log('Calling POST http://localhost:4000/api/syllabi/detect ...');
    const detectRes = await fetch('http://localhost:4000/api/syllabi/detect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        pdf: base64Pdf,
        department: 'CSE'
      })
    });

    console.log('HTTP Status:', detectRes.status);
    const data = await detectRes.json();
    console.log('HTTP Response Subjects Count:', data.subjects?.length);

    for (const sub of data.subjects || []) {
      console.log(`Course: ${sub.courseCode} | Start: ${sub.startPage} | End: ${sub.endPage} | Total: ${sub.totalPages} | Pages: [${sub.pages?.join(',')}]`);
      assert.ok(typeof sub.startPage === 'number' && sub.startPage >= 42, `Invalid startPage: ${sub.startPage}`);
      assert.ok(typeof sub.endPage === 'number' && sub.endPage >= sub.startPage, `Invalid endPage: ${sub.endPage}`);
      assert.ok(typeof sub.totalPages === 'number' && sub.totalPages === sub.endPage - sub.startPage + 1, `Invalid totalPages: ${sub.totalPages}`);
    }

    console.log('\n HTTP DETECT ENDPOINT VERIFIED SUCCESSFULLY WITH REAL PAGE NUMBERS!');
  });
}

testHttpDetect().catch(console.error);
