import * as XLSX from 'xlsx';

/**
 * Normalizes text content by trimming whitespace and collapsing multiple spaces.
 */
function normalizeCell(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

/**
 * Extracts shared header rows (Department, Semester/Year, Title) appearing
 * before the first detected section's Class Teacher row.
 */
function extractSharedHeader(rows, firstSectionStartRow) {
  const headerLines = [];
  const limit = Math.min(firstSectionStartRow, rows.length);

  const isAnnouncementFootnote = (txt) =>
    /academic\s+session\s+starts|w\.?e\.?f|with\s+effect\s+from|classwork\s+commences|note\s*:/i.test(txt);

  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    // Join non-empty cell strings across the row, deduplicating identical cells from merged columns
    const nonEmpties = row.map(normalizeCell).filter(Boolean);
    if (nonEmpties.length > 0) {
      const dedupedCells = [];
      for (const val of nonEmpties) {
        if (!dedupedCells.includes(val)) {
          dedupedCells.push(val);
        }
      }
      const combined = dedupedCells.join(' ').trim();
      if (/^Class\s*Teacher\s*:/i.test(combined)) break;
      if (/Room\s*:/i.test(combined)) break;

      headerLines.push({
        rowIndex: r,
        rawText: combined,
        cells: dedupedCells
      });
    }
  }

  // Identify specific header elements if possible
  let department = '';
  let sessionSemester = '';
  let overallTitle = '';

  for (const h of headerLines) {
    const text = h.rawText;
    if (isAnnouncementFootnote(text)) continue;

    if (/DEPARTMENT\s+OF|DEPT\s+OF/i.test(text)) {
      department = text;
    } else if (/TIME\s*TABLE/i.test(text)) {
      overallTitle = text;
    } else if (/ACADEMIC\s+YEAR|SEMESTER|\b(?:I|II|III|IV)\s*B\.?TECH|\bB\.?TECH/i.test(text)) {
      if (!sessionSemester) {
        sessionSemester = text;
      }
    }
  }

  // Fallback defaults if not explicitly categorized
  if (!overallTitle) {
    const candidateTitles = headerLines.filter(h => !isAnnouncementFootnote(h.rawText) && !/DEPARTMENT\s+OF/i.test(h.rawText));
    if (candidateTitles.length > 0) {
      overallTitle = candidateTitles[candidateTitles.length - 1].rawText;
    } else {
      overallTitle = sessionSemester ? `TIME TABLE FOR ${sessionSemester}` : 'Class Time Table';
    }
  }
  if (!department && headerLines.length > 0) {
    const candidateDept = headerLines.find(h => !isAnnouncementFootnote(h.rawText));
    if (candidateDept) department = candidateDept.rawText;
  }

  return {
    rawLines: headerLines.map(h => h.rawText),
    department,
    sessionSemester,
    overallTitle
  };
}

/**
 * Checks whether a row cell in column A (or first non-empty cell) matches the "<Section Name> Room:<room>" pattern.
 */
function getRoomHeaderMatch(row) {
  if (!row || !row.length) return null;
  // Look at column 0 first, but also check column 1 in case of empty first col
  for (let c = 0; c < Math.min(3, row.length); c++) {
    const cell = normalizeCell(row[c]);
    if (/Room\s*:/i.test(cell)) {
      const match = cell.match(/^(.*?)\s*Room\s*:\s*(.*)$/i);
      if (match) {
        return {
          colIndex: c,
          rawCell: cell,
          sectionName: match[1].trim(),
          roomNumber: match[2].trim()
        };
      }
      // Alternate fallback
      const parts = cell.split(/Room\s*:/i);
      return {
        colIndex: c,
        rawCell: cell,
        sectionName: (parts[0] || '').trim(),
        roomNumber: (parts[1] || '').trim()
      };
    }
  }
  return null;
}

/**
 * Scans down the sheet row by row to detect all section block boundaries automatically.
 * 
 * STEP 2 & STEP 3:
 * A section block consists of:
 *   a) "Class Teacher:<name>" row (immediately above section header)
 *   b) Section header row containing "<Section Name> Room:<room>" and period time slots
 *   c) Exactly 6 day rows (MON, TUE, WED, THU, FRI, SAT)
 *   d) A legend/footer row directly after Saturday
 */
export function detectSectionBlocks(rows, rawMerges = []) {
  if (!rows || !rows.length) return { sharedHeader: { rawLines: [] }, sections: [] };

  // Find all row indices where section header "<Section Name> Room:<room>" appears
  const sectionHeaderIndices = [];
  for (let r = 0; r < rows.length; r++) {
    const match = getRoomHeaderMatch(rows[r]);
    if (match) {
      sectionHeaderIndices.push({ rowIndex: r, ...match });
    }
  }

  if (sectionHeaderIndices.length === 0) {
    return { sharedHeader: extractSharedHeader(rows, rows.length), sections: [] };
  }

  // STEP 1: Shared header info before the first section's start row
  const firstHeaderRow = sectionHeaderIndices[0].rowIndex;
  const firstTeacherRow = Math.max(0, firstHeaderRow - 1);
  const sharedHeader = extractSharedHeader(rows, firstTeacherRow);

  const sections = [];

  for (let i = 0; i < sectionHeaderIndices.length; i++) {
    const current = sectionHeaderIndices[i];
    const headerRowIdx = current.rowIndex;
    const teacherRowIdx = Math.max(0, headerRowIdx - 1);
    const teacherRow = rows[teacherRowIdx] || [];

    // Extract Class Teacher name
    let classTeacher = '';
    const teacherRowText = teacherRow.map(normalizeCell).filter(Boolean).join(' ');
    const teacherMatch = teacherRowText.match(/Class\s*Teacher\s*:\s*([^,;\n\r]+)/i);
    if (teacherMatch) {
      classTeacher = teacherMatch[1].trim();
    } else if (/Class\s*Teacher/i.test(teacherRowText)) {
      classTeacher = teacherRowText.replace(/.*Class\s*Teacher\s*:\s*/i, '').trim();
    } else {
      // Look if teacher name is on same row or adjacent
      for (const cell of teacherRow) {
        const cText = normalizeCell(cell);
        if (/Class\s*Teacher/i.test(cText)) {
          classTeacher = cText.replace(/Class\s*Teacher\s*:\s*/i, '').trim();
          break;
        }
      }
    }

    // Header row with periods
    const headerRow = rows[headerRowIdx] || [];
    const sectionName = current.sectionName || `Section ${i + 1}`;
    const roomNumber = current.roomNumber || '';

    // Exactly 6 day rows directly below
    const dayRows = [];
    const dayRowIndices = [];
    const expectedDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    for (let d = 1; d <= 6; d++) {
      const dayIdx = headerRowIdx + d;
      if (dayIdx < rows.length) {
        dayRowIndices.push(dayIdx);
        dayRows.push({
          rowIndex: dayIdx,
          cells: rows[dayIdx] || []
        });
      }
    }

    // Legend row directly after Saturday (headerRowIdx + 7)
    const legendRowIdx = headerRowIdx + 7;
    let legendText = '';
    let legendCells = [];
    if (legendRowIdx < rows.length) {
      const lRow = rows[legendRowIdx] || [];
      legendCells = lRow;
      legendText = lRow.map(normalizeCell).filter(Boolean).join(' ');
    }

    // STEP 6: Ignore all columns beyond the last populated timetable column
    // Determine max populated column index across day rows and header
    let maxDayColIndex = 1;
    for (const dRow of dayRows) {
      for (let c = 1; c < dRow.cells.length; c++) {
        if (normalizeCell(dRow.cells[c])) {
          maxDayColIndex = Math.max(maxDayColIndex, c);
        }
      }
    }

    let maxHeaderTimeCol = 1;
    for (let c = 1; c < headerRow.length; c++) {
      const cellText = normalizeCell(headerRow[c]);
      if (cellText && (/\d+[:.]\d+|\d+\s*[-–]\s*\d+|AM|PM|PERIOD|LUNCH|BREAK/i.test(cellText) || c <= maxDayColIndex)) {
        maxHeaderTimeCol = Math.max(maxHeaderTimeCol, c);
      }
    }

    const maxColIndex = Math.max(maxDayColIndex, maxHeaderTimeCol);

    // Slice header row period columns (columns 1 to maxColIndex)
    const timeSlots = [];
    for (let c = 1; c <= maxColIndex; c++) {
      timeSlots.push(normalizeCell(headerRow[c]) || `Period ${c}`);
    }

    // Slice day rows
    const cleanedDayRows = dayRows.map((dRow, dIdx) => {
      const fullRow = dRow.cells;
      const dayLabel = normalizeCell(fullRow[0]) || expectedDays[dIdx] || `DAY ${dIdx + 1}`;
      const periodCells = [];
      for (let c = 1; c <= maxColIndex; c++) {
        periodCells.push(normalizeCell(fullRow[c]));
      }
      return {
        day: dayLabel,
        rowIndex: dRow.rowIndex,
        periods: periodCells
      };
    });

    // STEP 5: Preserve merged cells within the block relative to new sheet row offset
    // Block range in source sheet: [teacherRowIdx, legendRowIdx]
    // Filter raw merges that intersect this block and stay within [0, maxColIndex]
    const blockStartRow = teacherRowIdx;
    const blockEndRow = legendRowIdx;
    const sectionMerges = [];

    for (const m of rawMerges) {
      // Check if merge is inside block row range and within maxColIndex
      if (m.s.r >= blockStartRow && m.e.r <= blockEndRow) {
        if (m.s.c <= maxColIndex) {
          sectionMerges.push({
            sourceMerge: m,
            startRowInBlock: m.s.r - blockStartRow,
            endRowInBlock: m.e.r - blockStartRow,
            startCol: m.s.c,
            endCol: Math.min(m.e.c, maxColIndex)
          });
        }
      }
    }

    sections.push({
      sectionIndex: i + 1,
      sectionName,
      roomNumber,
      classTeacher,
      headerRowIndex: headerRowIdx,
      teacherRowIndex: teacherRowIdx,
      legendRowIndex: legendRowIdx,
      maxColIndex,
      timeSlots,
      dayRows: cleanedDayRows,
      legendText,
      legendCells,
      merges: sectionMerges
    });
  }

  return {
    sharedHeader,
    sections
  };
}

/**
 * Formats faculty names (e.g. Dr.D.Indu -> Dr. D. Indu, Mrs.K.Suneetha -> Mrs. K. Suneetha).
 */
export function formatFacultyName(name) {
  if (!name) return '';
  return name.replace(/\.([A-Za-z])/g, '. $1').replace(/\s+/g, ' ').trim();
}

/**
 * Maps subject codes to names from the parsed legend text (e.g., "CN:Dr.D.Indu DWDM:Mrs.Y.Sowmya").
 */
export function parseLegendMap(legendText) {
  const map = {};
  if (!legendText) return map;

  // Handles both space-separated pairs "CODE:Teacher" and comma/newline separated
  const regex = /([A-Za-z0-9\-_/]+)\s*:\s*([^:\n\r]+?)(?=(?:\s+[A-Za-z0-9\-_/]+\s*:)|$)/g;
  let match;
  while ((match = regex.exec(legendText)) !== null) {
    const code = match[1].trim();
    const teacher = match[2].trim().replace(/[,\s]+$/, '');
    if (code && teacher) {
      map[code.toUpperCase()] = teacher;
    }
  }

  return map;
}

/**
 * Builds an XLSX Worksheet for a single section conforming to STEP 7.
 * 
 * Format:
 * - Shared header rows (Department, Session/Semester, Overall Title)
 * - Section Name & Room Number
 * - Class Teacher Line
 * - Time Slot Header Row (Bold with background fill)
 * - 6 Day Rows (Bold Day labels, highlighted LUNCH cells, wrapped text)
 * - Faculty Legend Row
 * - Re-creates merges with adjusted row offsets
 * - Auto-sized column widths
 */
export function createSectionWorksheet(section, sharedHeader) {
  const wsData = [];
  const merges = [];

  // 1. Shared Header Lines
  const headerLines = sharedHeader?.rawLines?.length > 0
    ? sharedHeader.rawLines
    : [
        sharedHeader?.department || 'GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN',
        sharedHeader?.sessionSemester || 'ACADEMIC YEAR 2026-2027',
        sharedHeader?.overallTitle || 'CLASS TIME TABLE'
      ];

  headerLines.forEach(line => {
    wsData.push([line]);
  });

  // Empty separator
  wsData.push([]);

  // 2. Class Teacher & Section Info
  const teacherRowIdx = wsData.length;
  wsData.push([`Class Teacher: ${section.classTeacher || 'Not Assigned'}`]);

  const sectionHeaderRowIdx = wsData.length;
  const sectionTitleCell = `${section.sectionName} Room:${section.roomNumber}`;
  const headerCols = [sectionTitleCell, ...section.timeSlots];
  wsData.push(headerCols);

  // 3. 6 Day Rows
  const dayStartRowIdx = wsData.length;
  section.dayRows.forEach((dRow) => {
    wsData.push([dRow.day, ...dRow.periods]);
  });

  // 4. Legend Row
  const legendRowIdx = wsData.length;
  wsData.push([`Faculty & Subject Legend: ${section.legendText || 'N/A'}`]);

  // Convert array of arrays to sheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // STEP 5: Preserve and translate merges relative to new row positions
  for (const m of section.merges || []) {
    const targetStartRow = teacherRowIdx + m.startRowInBlock;
    const targetEndRow = teacherRowIdx + m.endRowInBlock;
    if (targetStartRow < wsData.length && targetEndRow < wsData.length) {
      merges.push({
        s: { r: targetStartRow, c: m.startCol },
        e: { r: targetEndRow, c: m.endCol }
      });
    }
  }

  // Merge shared headers across all columns
  const totalCols = Math.max(headerCols.length, 8);
  for (let r = 0; r < headerLines.length; r++) {
    merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
  }
  // Merge Class Teacher across columns
  merges.push({ s: { r: teacherRowIdx, c: 0 }, e: { r: teacherRowIdx, c: totalCols - 1 } });
  // Merge Legend across columns
  merges.push({ s: { r: legendRowIdx, c: 0 }, e: { r: legendRowIdx, c: totalCols - 1 } });

  ws['!merges'] = merges;

  // STEP 7: Auto-size columns & cell styling metadata
  const colWidths = [];
  for (let c = 0; c < totalCols; c++) {
    let maxLen = c === 0 ? 16 : 14;
    for (let r = 0; r < wsData.length; r++) {
      // Don't count full-spanning header rows for individual column widths
      if (r < headerLines.length || r === teacherRowIdx || r === legendRowIdx) continue;
      const cellVal = wsData[r]?.[c];
      if (cellVal) {
        maxLen = Math.max(maxLen, String(cellVal).length);
      }
    }
    colWidths.push({ wch: Math.min(maxLen + 4, 32) });
  }
  ws['!cols'] = colWidths;

  return ws;
}

/**
 * Creates an individual Excel Workbook for a single section.
 */
export function createSectionWorkbook(section, sharedHeader) {
  const wb = XLSX.utils.book_new();
  const safeSheetName = (section.sectionName || `Section_${section.sectionIndex}`)
    .replace(/[\\/?*:[\]]/g, '_')
    .slice(0, 31);
  const ws = createSectionWorksheet(section, sharedHeader);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  return wb;
}

/**
 * Creates a combined Excel Workbook containing all split sections as separate sheets.
 */
export function createCombinedWorkbook(sections, sharedHeader) {
  const wb = XLSX.utils.book_new();
  sections.forEach((sec, idx) => {
    const safeSheetName = (sec.sectionName || `Section_${idx + 1}`)
      .replace(/[\\/?*:[\]]/g, '_')
      .slice(0, 31);
    const ws = createSectionWorksheet(sec, sharedHeader);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  });
  return wb;
}

/**
 * Downloads an XLSX workbook in the browser.
 */
export function downloadWorkbook(wb, filename = 'timetable.xlsx') {
  XLSX.writeFile(wb, filename);
}

/**
 * Parses raw Excel file buffer, ArrayBuffer, or base64 and detects all section blocks.
 */
export function detectAndSplitTimetableExcel(fileData, options = {}) {
  let workbook;
  if (typeof fileData === 'string' && fileData.startsWith('data:')) {
    const base64 = fileData.split(',')[1];
    workbook = XLSX.read(base64, { type: 'base64', cellStyles: true });
  } else if (typeof fileData === 'string') {
    workbook = XLSX.read(fileData, { type: 'string', cellStyles: true });
  } else if (fileData instanceof ArrayBuffer || ArrayBuffer.isView(fileData)) {
    workbook = XLSX.read(fileData, { type: 'array', cellStyles: true });
  } else if (fileData && fileData.Sheets) {
    workbook = fileData;
  } else {
    throw new Error('Unsupported file format or invalid data passed to timetable splitter.');
  }

  const sheetName = options.sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in uploaded workbook.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const rawMerges = sheet['!merges'] || [];

  const splitResult = detectSectionBlocks(rawRows, rawMerges);

  return {
    ...splitResult,
    sheetName,
    totalSectionsDetected: splitResult.sections.length,
    workbook
  };
}

/**
 * Maps a split section into the dashboard internal timetable data format.
 */
export function convertSplitSectionToTimetableGrid(section, sharedHeader = {}) {
  const legendMap = parseLegendMap(section.legendText);
  // Check if each period column is a break by checking either its time or if day cells in that column are LUNCH/BREAK
  let periodCounter = 1;
  const periods = (section.timeSlots || []).map((time, idx) => {
    let isBreak = /LUNCH|BREAK/i.test(time) || /12:00\s*[-–]\s*12:50|12:00\s*[-–]\s*01:00/i.test(time);
    if (!isBreak) {
      const breakVotes = (section.dayRows || []).filter(r => /LUNCH|BREAK/i.test(r.periods?.[idx] || '')).length;
      if (breakVotes >= 2) isBreak = true;
    }

    const id = isBreak ? 'lunch' : `p${periodCounter}`;
    const label = isBreak ? 'LUNCH BREAK' : `Period ${periodCounter}`;
    if (!isBreak) periodCounter++;

    return {
      id,
      time,
      label,
      isBreak
    };
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayNameMapping = {
    'MON': 'Monday', 'MONDAY': 'Monday',
    'TUE': 'Tuesday', 'TUESDAY': 'Tuesday',
    'WED': 'Wednesday', 'WEDNESDAY': 'Wednesday',
    'THU': 'Thursday', 'THURSDAY': 'Thursday',
    'FRI': 'Friday', 'FRIDAY': 'Friday',
    'SAT': 'Saturday', 'SATURDAY': 'Saturday'
  };

  const grid = {};
  days.forEach(d => { grid[d] = {}; });

  section.dayRows.forEach(dRow => {
    const rawDay = (dRow.day || '').toUpperCase().trim();
    const fullDay = dayNameMapping[rawDay] || dRow.day;

    if (!grid[fullDay]) grid[fullDay] = {};

    dRow.periods.forEach((cellVal, pIdx) => {
      const periodObj = periods[pIdx] || { id: `p${pIdx + 1}`, isBreak: false };
      const periodId = periodObj.id;
      const cleanVal = normalizeCell(cellVal);

      if (!cleanVal || /LUNCH|BREAK/i.test(cleanVal)) {
        grid[fullDay][periodId] = {
          subject: cleanVal || (periodObj.isBreak ? 'LUNCH BREAK' : ''),
          code: '',
          faculty: '',
          room: section.roomNumber || '',
          type: periodObj.isBreak ? 'break' : 'theory'
        };
      } else {
        // Extract subject code, faculty initials, or lab
        let subject = cleanVal;
        let faculty = '';
        let code = '';
        let type = 'theory';

        if (/LAB/i.test(cleanVal)) type = 'lab';
        else if (/LIB|LIBRARY/i.test(cleanVal)) type = 'library';
        else if (/COUNSEL/i.test(cleanVal)) type = 'remedial';
        else if (/HONOR|HPC|SM/i.test(cleanVal)) type = 'elective';

        // Check if format is "SUB:FACULTY"
        if (cleanVal.includes(':')) {
          const parts = cleanVal.split(':');
          code = parts[0].trim();
          const teacherInitialOrName = parts[1].trim();
          faculty = formatFacultyName(legendMap[code.toUpperCase()] || legendMap[teacherInitialOrName.toUpperCase()] || teacherInitialOrName);
          subject = parts[0].trim();
        } else {
          code = cleanVal;
          if (legendMap[cleanVal.toUpperCase()]) {
            faculty = formatFacultyName(legendMap[cleanVal.toUpperCase()]);
          }
        }

        grid[fullDay][periodId] = {
          subject,
          code,
          faculty,
          room: section.roomNumber || '',
          type
        };
      }
    });
  });

  const cleanOverallTitle = (sharedHeader.overallTitle && !/academic\s+session\s+starts/i.test(sharedHeader.overallTitle) && sharedHeader.overallTitle.length < 120)
    ? sharedHeader.overallTitle.trim()
    : 'Time Table';
  const cleanSessionSem = (sharedHeader.sessionSemester && !/academic\s+session\s+starts/i.test(sharedHeader.sessionSemester) && sharedHeader.sessionSemester.length < 80)
    ? sharedHeader.sessionSemester.trim()
    : '2025–2026';

  return {
    id: section.sectionName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    title: `${cleanOverallTitle} — ${section.sectionName}`,
    academicYear: cleanSessionSem,
    classroom: `Room ${section.roomNumber}`,
    incharge: section.classTeacher,
    status: 'Published',
    days,
    periods,
    grid,
    legendMap,
    rawLegend: section.legendText
  };
}
