import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  detectSectionBlocks,
  parseLegendMap,
  createSectionWorksheet,
  createSectionWorkbook,
  createCombinedWorkbook,
  detectAndSplitTimetableExcel,
  convertSplitSectionToTimetableGrid
} from '../src/utils/timetableSplitter.js';

// Helper to construct a simulated vertically stacked multi-section raw array of arrays
function createSimulatedStackedExcelRows() {
  return [
    // Top Shared Headers (STEP 1)
    ['GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN'],
    ['DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING'],
    ['ACADEMIC YEAR 2026-2027 · B.TECH III YEAR I SEMESTER'],
    ['TIME TABLE FOR III BTECH I SEMESTER'],
    [],
    // SECTION 1 (STEP 2, STEP 3, STEP 4)
    ['Class Teacher: Mrs. K. Suneetha'],
    ['III CSE-1 Room:215', '08:40 - 09:30', '09:30 - 10:20', '10:20 - 11:10', '11:10 - 12:00', '12:00 - 12:50', '12:50 - 01:40', '01:40 - 02:30', '02:30 - 03:20', '', 'EXTRA_JUNK_COL'],
    ['MON', 'CD:KS', 'DWDM:YS', 'IRS:MD', 'DEVOPS:VLR', 'LUNCH', 'DEVOPS:VLR', 'DEVOPS:VLR', 'HPC:SSH', '', ''],
    ['TUE', 'CN:DI', 'DWDM:YS', 'AI:MA', 'IRS:MD', 'LUNCH', 'CD:KS', 'CDT:KS', 'SM:MBS', '', ''],
    ['WED', 'AI:MA', 'DTE:NS', 'CN:DI', 'CNLAB:DI', 'LUNCH', 'CNLAB:DI', 'CNLAB:DI', 'HPC:SSH', '', ''],
    ['THU', 'IRS:MD', 'CD:KS', 'DTE:NS', 'CN:DI', 'LUNCH', 'LIB:DI', 'DWDMT:YS', 'SM:MBS', '', ''],
    ['FRI', 'DMLAB:YS', 'DMLAB:YS', 'DMLAB:YS', 'DWDM:YS', 'LUNCH', 'AI:MA', 'DTE:NS', 'SM:MBS', '', ''],
    ['SAT', 'CD:KS', 'DWDM:YS', 'AI:MA', 'CN:DI', 'LUNCH', 'IRS:MD', 'COUNSELLING:DI', 'HPC:SSH', '', ''],
    ['CN:Dr.D.Indu DWDM:Mrs.Y.Sowmya CD:Mrs.K.Suneetha IRS:Mrs.M.Deepthi AI:Mrs.M.Aswini DTE:Dr.N.Sharmili DEVOPS:Dr.V.Lakshmana Rao HPC:Dr.S.S.H SM:Dr.M.B.S CDT:Mrs.K.Suneetha DWDMT:Mrs.Y.Sowmya CNLAB:Dr.D.Indu DMLAB:Mrs.Y.Sowmya LIB:Dr.D.Indu COUNSELLING:Dr.D.Indu'],
    [],
    // SECTION 2
    ['Class Teacher: Dr. P. Muralidhara Rao'],
    ['III CSE-2 Room:216', '08:40 - 09:30', '09:30 - 10:20', '10:20 - 11:10', '11:10 - 12:00', '12:00 - 12:50', '12:50 - 01:40', '01:40 - 02:30', '02:30 - 03:20'],
    ['MON', 'CN:PMR', 'CD:KS', 'IRS:MD', 'CN:PMR', 'LUNCH', 'CD:KS', 'AI:KL', 'HPC:SSH'],
    ['TUE', 'DWDM:RA', 'CD:KS', 'CN:PMR', 'IRS:MD', 'LUNCH', 'AI:KL', 'LIB:PMR', 'SM:MBS'],
    ['WED', 'CNLAB:PMR', 'CNLAB:PMR', 'CNLAB:PMR', 'DWDM:RA', 'LUNCH', 'AI:KL', 'DTE:MA', 'HPC:SSH'],
    ['THU', 'IRS:MD', 'DWDMT:RA', 'AI:KL', 'DTE:MA', 'LUNCH', 'CDT:KS', 'COUNSELLING:RA', 'SM:MBS'],
    ['FRI', 'CN:PMR', 'DWDM:RA', 'CD:KS', 'DMLAB:RA', 'LUNCH', 'DMLAB:RA', 'DMLAB:RA', 'SM:MBS'],
    ['SAT', 'DEVOPS:PSLS', 'DEVOPS:PSLS', 'DEVOPS:PSLS', 'DWDMT:RA', 'LUNCH', 'IRS:MD', 'DTE:MA', 'HPC:SSH'],
    ['CN:Dr.P.Muralidhara Rao CD:Mrs.K.Suneetha DWDM:Mrs.R.Archana IRS:Mrs.M.Deepthi AI:Mrs.K.Lakshmi DTE:Mrs.M.Aswini DEVOPS:Mrs.P.S.L.Sravani HPC:Dr.S.S.H SM:Dr.M.B.S CNLAB:Dr.P.Muralidhara Rao DMLAB:Mrs.R.Archana CDT:Mrs.K.Suneetha DWDMT:Mrs.R.Archana LIB:Dr.P.Muralidhara Rao COUNSELLING:Mrs.R.Archana'],
    [],
    // SECTION 3
    ['Class Teacher: Dr. G. Sankara Rao'],
    ['III CSE-3 Room:221', '08:40 - 09:30', '09:30 - 10:20', '10:20 - 11:10', '11:10 - 12:00', '12:00 - 12:50', '12:50 - 01:40', '01:40 - 02:30', '02:30 - 03:20'],
    ['MON', 'AI:MA', 'CD:GSR', 'IRS:KSR', 'DMLAB:YS', 'LUNCH', 'DMLAB:YS', 'DMLAB:YS', 'HPC:SSH'],
    ['TUE', 'AI:MA', 'DTE:KR', 'CN:DI', 'IRS:KSR', 'LUNCH', 'LIB:DI', 'DWDM:YS', 'SM:MBS'],
    ['WED', 'DWDM:YS', 'CD:GSR', 'AI:MA', 'CDT:GSR', 'LUNCH', 'COUNSELLING:YS', 'DWDM:YS', 'HPC:SSH'],
    ['THU', 'IRS:KSR', 'DEVOPS:VLR', 'DEVOPS:VLR', 'DEVOPS:VLR', 'LUNCH', 'DTE:KR', 'CN:DI', 'SM:MBS'],
    ['FRI', 'CN:DI', 'AI:MA', 'CD:GSR', 'CNLAB:DI', 'LUNCH', 'CNLAB:DI', 'CNLAB:DI', 'SM:MBS'],
    ['SAT', 'CD:GSR', 'DTE:KR', 'CN:DI', 'DWDM:YS', 'LUNCH', 'IRS:KSR', 'DWDMT:YS', 'HPC:SSH'],
    ['CD:Dr.G.Sankara Rao DWDM:Mrs.Y.Sowmya AI:Mrs.M.Aswini CN:Dr.D.Indu IRS:Mrs.K.Sirisha DTE:Dr.K.Rohini DEVOPS:Dr.V.Lakshmana Rao HPC:Dr.S.S.H SM:Dr.M.B.S CNLAB:Dr.D.Indu DMLAB:Mrs.Y.Sowmya CDT:Dr.G.Sankara Rao DWDMT:Mrs.Y.Sowmya LIB:Dr.D.Indu COUNSELLING:Mrs.Y.Sowmya'],
    [],
    // SECTION 4
    ['Class Teacher: Dr. N. Sharmili'],
    ['III CSE-4 Room:115', '08:40 - 09:30', '09:30 - 10:20', '10:20 - 11:10', '11:10 - 12:00', '12:00 - 12:50', '12:50 - 01:40', '01:40 - 02:30', '02:30 - 03:20'],
    ['MON', 'DTE:DS', 'AI:KL', 'IRS:KSR', 'CNLAB:GSR', 'LUNCH', 'CNLAB:GSR', 'CNLAB:GSR', 'HPC:SSH'],
    ['TUE', 'AI:KL', 'CD:NS', 'DTE:DS', 'IRS:KSR', 'LUNCH', 'LIB:GSR', 'CN:GSR', 'SM:MBS'],
    ['WED', 'DMLAB:VGA', 'DMLAB:VGA', 'DMLAB:VGA', 'DWDM:VGA', 'LUNCH', 'CD:NS', 'COUNSELLING:KL', 'HPC:SSH'],
    ['THU', 'IRS:KSR', 'CN:GSR', 'DWDM:VGA', 'DEVOPS:PSLS', 'LUNCH', 'DEVOPS:PSLS', 'DEVOPS:PSLS', 'SM:MBS'],
    ['FRI', 'CD:NS', 'CN:GSR', 'DWDM:VGA', 'CDT:NS', 'LUNCH', 'CN:GSR', 'DWDMT:VGA', 'SM:MBS'],
    ['SAT', 'DTE:DS', 'DWDM:VGA', 'AI:KL', 'AI:KL', 'LUNCH', 'IRS:KSR', 'CD:NS', 'HPC:SSH'],
    ['CD:Dr.N.Sharmili DWDM:Mrs.V.Gowtami Annapurna AI:Mrs.K.Lakshmi CN:Dr.G.Sankara Rao IRS:Mrs.K.Sirisha DTE:Mrs.D.Sarvani DEVOPS:Mrs.P.S.L.Sravani HPC:Dr.S.S.H SM:Dr.M.B.S CNLAB:Dr.G.Sankara Rao DMLAB:Mrs.V.Gowtami Annapurna CDT:Dr.N.Sharmili DWDMT:Mrs.V.Gowtami Annapurna LIB:Dr.G.Sankara Rao COUNSELLING:Mrs.K.Lakshmi']
  ];
}

test('STEP 1: identifies shared header information at the top of the sheet', () => {
  const rows = createSimulatedStackedExcelRows();
  const result = detectSectionBlocks(rows);

  assert.ok(result.sharedHeader, 'Shared header must exist');
  assert.equal(result.sharedHeader.rawLines.length, 4);
  assert.match(result.sharedHeader.department, /COMPUTER SCIENCE/i);
  assert.match(result.sharedHeader.overallTitle, /TIME TABLE FOR III BTECH/i);
});

test('STEP 2 & 3: dynamically detects all section block boundaries and counts', () => {
  const rows = createSimulatedStackedExcelRows();
  const result = detectSectionBlocks(rows);

  assert.equal(result.sections.length, 4, 'Should detect exactly 4 section blocks');

  // Verify section names and rooms
  assert.equal(result.sections[0].sectionName, 'III CSE-1');
  assert.equal(result.sections[0].roomNumber, '215');
  assert.equal(result.sections[0].classTeacher, 'Mrs. K. Suneetha');

  assert.equal(result.sections[1].sectionName, 'III CSE-2');
  assert.equal(result.sections[1].roomNumber, '216');
  assert.equal(result.sections[1].classTeacher, 'Dr. P. Muralidhara Rao');

  assert.equal(result.sections[2].sectionName, 'III CSE-3');
  assert.equal(result.sections[2].roomNumber, '221');
  assert.equal(result.sections[2].classTeacher, 'Dr. G. Sankara Rao');

  assert.equal(result.sections[3].sectionName, 'III CSE-4');
  assert.equal(result.sections[3].roomNumber, '115');
  assert.equal(result.sections[3].classTeacher, 'Dr. N. Sharmili');
});

test('STEP 4: extracts 6 day rows, period time slots, and legend row for each section', () => {
  const rows = createSimulatedStackedExcelRows();
  const result = detectSectionBlocks(rows);

  const sec1 = result.sections[0];
  assert.equal(sec1.dayRows.length, 6, 'Must contain exactly 6 day rows');
  assert.deepEqual(sec1.dayRows.map(d => d.day), ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
  assert.equal(sec1.timeSlots.length, 8, 'Should extract 8 period slots');
  assert.equal(sec1.timeSlots[0], '08:40 - 09:30');
  assert.equal(sec1.timeSlots[4], '12:00 - 12:50');

  // Check legend mapping
  const legendMap = parseLegendMap(sec1.legendText);
  assert.equal(legendMap['CN'], 'Dr.D.Indu');
  assert.equal(legendMap['DWDM'], 'Mrs.Y.Sowmya');
  assert.equal(legendMap['CD'], 'Mrs.K.Suneetha');
});

test('STEP 5: preserves merged cells within block with relative row offsets', () => {
  const rows = createSimulatedStackedExcelRows();
  // Simulate a 3-period lab merge in Section 1 (WED CNLAB spanning columns 4, 5, 6, which is row 9)
  // teacherRow is row 5, header is row 6, WED is row 9.
  const rawMerges = [
    { s: { r: 9, c: 4 }, e: { r: 9, c: 6 } }
  ];

  const result = detectSectionBlocks(rows, rawMerges);
  assert.equal(result.sections[0].merges.length, 1);
  const m = result.sections[0].merges[0];
  assert.equal(m.startCol, 4);
  assert.equal(m.endCol, 6);
  assert.equal(m.startRowInBlock, 4); // row 9 - teacherRow (5) = 4

  // Verify Worksheet generation incorporates the merge with adjusted row
  const ws = createSectionWorksheet(result.sections[0], result.sharedHeader);
  assert.ok(ws['!merges'], 'Worksheet must have !merges');
  const foundLabMerge = ws['!merges'].find(merge => merge.s.c === 4 && merge.e.c === 6);
  assert.ok(foundLabMerge, 'Translated lab merge must be present in target worksheet');
});

test('STEP 6: ignores columns beyond the last populated period column', () => {
  const rows = createSimulatedStackedExcelRows();
  // Column index 10 has "EXTRA_JUNK_COL" in source row 6, but timetable periods end at column 8.
  const result = detectSectionBlocks(rows);
  const sec1 = result.sections[0];
  assert.equal(sec1.maxColIndex, 8);
  assert.equal(sec1.timeSlots.length, 8);
  assert.ok(!sec1.timeSlots.includes('EXTRA_JUNK_COL'), 'Junk column should be excluded');
});

test('STEP 7: generates separate formatted workbooks and sheets per section', () => {
  const rows = createSimulatedStackedExcelRows();
  const result = detectSectionBlocks(rows);

  // Single section workbook
  const wb1 = createSectionWorkbook(result.sections[0], result.sharedHeader);
  assert.equal(wb1.SheetNames.length, 1);
  assert.equal(wb1.SheetNames[0], 'III CSE-1');

  // Combined multi-sheet workbook
  const combinedWb = createCombinedWorkbook(result.sections, result.sharedHeader);
  assert.equal(combinedWb.SheetNames.length, 4);
  assert.deepEqual(combinedWb.SheetNames, ['III CSE-1', 'III CSE-2', 'III CSE-3', 'III CSE-4']);
});

test('detectAndSplitTimetableExcel works on raw binary XLSX workbook', () => {
  const rows = createSimulatedStackedExcelRows();
  const sourceWb = XLSX.utils.book_new();
  const sourceWs = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(sourceWb, sourceWs, 'MasterTimetable');

  const xlsxBuffer = XLSX.write(sourceWb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = detectAndSplitTimetableExcel(xlsxBuffer);

  assert.equal(parsed.totalSectionsDetected, 4);
  assert.equal(parsed.sections[0].roomNumber, '215');
  assert.equal(parsed.sections[3].roomNumber, '115');
});

test('convertSplitSectionToTimetableGrid converts split section into dashboard grid', () => {
  const rows = createSimulatedStackedExcelRows();
  const result = detectSectionBlocks(rows);

  const gridData = convertSplitSectionToTimetableGrid(result.sections[0], result.sharedHeader);
  assert.equal(gridData.classroom, 'Room 215');
  assert.equal(gridData.incharge, 'Mrs. K. Suneetha');
  assert.equal(gridData.days.length, 6);
  assert.ok(gridData.grid.Monday);
  assert.equal(gridData.grid.Monday.p1.faculty, 'Mrs. K. Suneetha');
  assert.equal(gridData.grid.Wednesday.p4.type, 'lab');
  assert.equal(gridData.grid.Monday.lunch.type, 'break');
});

test('extractSharedHeader ignores repeated merged Academic Session footnotes and does not duplicate text', () => {
  const repeatedRow = Array(20).fill('Academic Session starts from 7-7-2025 (AUTONOMOUS)');
  const rows = [
    ['GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN'],
    ['DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING'],
    ['ACADEMIC YEAR 2025-2026 · B.TECH II YEAR II SEMESTER'],
    ['TIME TABLE FOR II BTECH II SEMESTER'],
    repeatedRow,
    ['Class Teacher: Dr. K. Sravani'],
    ['II CSE-1 Room:301', '08:40 - 09:30', '09:30 - 10:20'],
    ['MON', 'DBMS:RK', 'DAA:ML'],
    ['TUE', 'DAA:ML', 'DBMS:RK'],
    ['WED', 'FLAT:AS', 'PS:VP'],
    ['THU', 'PS:VP', 'DBMS:RK'],
    ['FRI', 'DAA:ML', 'FLAT:AS'],
    ['SAT', 'ME:TR', 'PE:SB'],
    ['DBMS:Prof. R. Kiran DAA:Dr. M. Lakshmi']
  ];

  const result = detectSectionBlocks(rows);
  assert.equal(result.sharedHeader.overallTitle, 'TIME TABLE FOR II BTECH II SEMESTER');
  assert.match(result.sharedHeader.sessionSemester, /ACADEMIC YEAR 2025-2026/);
  assert.ok(!result.sharedHeader.overallTitle.includes('Academic Session starts from'));
  assert.ok(!result.sharedHeader.sessionSemester.includes('Academic Session starts from'));

  const gridData = convertSplitSectionToTimetableGrid(result.sections[0], result.sharedHeader);
  assert.equal(gridData.title, 'TIME TABLE FOR II BTECH II SEMESTER — II CSE-1');
  assert.ok(!gridData.title.includes('Academic Session starts from'));
});
