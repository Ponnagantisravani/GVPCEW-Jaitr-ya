import pdf from 'pdf-parse/lib/pdf-parse.js';
import { PDFDocument } from 'pdf-lib';

// Matches standard autonomous curriculum course codes:
// - 24BM11RC01, 24EC11EL04, 24CSIIEL02, 24CT11RC02, 24CT11RC11, 24CT11RC09, 24CT11RC22, 22CS3101, 20IT1101, 22BS1101
// - 20A05301T, R201101, CS301PC, MA101BS, HS101AR, IT201, CSE101
const codePattern = /\b(?:[0-9]{2}[A-Z]{2,4}[0-9]{2,4}[A-Z0-9]*|[A-Z]{2,5}[0-9]{3,4}[A-Z0-9]*|[0-9]{2}[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{2}|[0-9]{2}[A-Z]{2}[IVX0-9]{2,4}[A-Z0-9]*|[R|A][0-9]{2}[A-Z0-9_-]{4,10})\b/g;

const clean = value => String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();

const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8 };
const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];

const ignoredCodes = new Set([
  'PAGE01', 'PAGE02', 'TABLE01', 'ISO9001', 'NBA2022', 'AICTE2020',
  'JNTUK2020', 'GVPCEW01', 'GVPCEW', 'R2020', 'R2024', 'R2022', 'TOTAL',
  'ANNEXURE', 'COURSE'
]);

/**
 * Formats a clean, standard syllabus filename:
 * <CourseCode>_<SanitizedTitle>.pdf
 * E.g., 24CSIIEL02_Introduction_to_Artificial_Intelligence.pdf
 */
export function formatSyllabusFilename(courseCode, courseTitle) {
  const code = String(courseCode || 'COURSE').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  
  let title = String(courseTitle || '').trim();
  title = title
    .replace(/^[-–:]\s*/, '')
    .replace(/\s*\(?(?:Common to|Professional Elective|Open Elective|Mandatory Course|Basic Science|Engineering Science)[^\)]*\)?/gi, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = title.split(' ').filter(Boolean).map(w => {
    if (w.length > 1 && w === w.toUpperCase() && !/^[0-9]+$/.test(w)) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    return w;
  });

  const formattedTitle = words.join('_');
  return formattedTitle ? `${code}_${formattedTitle}.pdf` : `${code}_Syllabus.pdf`;
}

/**
 * Stage 0: Extracts text page-by-page from PDF buffer in strict sequential order
 */
export async function extractPdfPages(buffer) {
  const pages = [];
  const options = {
    pagerender: function(pageData) {
      return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then(function(textContent) {
          let lastY, text = '';
          for (let item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          const rawLines = text.split('\n').map(clean).filter(Boolean);
          pages.push({
            pageNum: pageData.pageIndex + 1,
            pageIndex: pageData.pageIndex,
            text,
            rawLines
          });
          return text;
        });
    }
  };

  const parsed = await pdf(buffer, options);

  // Guarantee strict ascending pageIndex order
  pages.sort((a, b) => a.pageIndex - b.pageIndex);

  return {
    totalPages: pages.length,
    pages,
    overallText: parsed.text || pages.map(p => p.text).join('\n\n')
  };
}

/**
 * Identifies if a page is a Course Structure / Scheme of Instruction summary table
 * (contains multiple course codes in rows, without unit content).
 */
export function isStructureTablePage(page) {
  const text = page.text || '';
  const distinctCodes = new Set();
  let m;
  while ((m = codePattern.exec(text)) !== null) {
    const c = m[0].toUpperCase();
    if (!ignoredCodes.has(c)) {
      distinctCodes.add(c);
    }
  }
  codePattern.lastIndex = 0;

  const hasDetailedUnits = /(?:UNIT\s*[-–:]?\s*(?:I|II|III|IV|V|1|2|3|4|5)\b|Course\s*Outcomes?\s*[:\-–]|Course\s*Objectives?\s*[:\-–])/i.test(text);

  // If a page has 3 or more distinct course codes and no detailed unit content, it is a structure table
  if (distinctCodes.size >= 3 && !hasDetailedUnits) {
    return true;
  }

  // Scheme or curriculum structure headers without detailed units
  if (/(?:COURSE\s*STRUCTURE|SCHEME\s*OF\s*INSTRUCTION|CURRICULUM\s*STRUCTURE|SEMESTER\s*SCHEME|INSTRUCTION\s*&\s*EVALUATION)/i.test(text) && !hasDetailedUnits) {
    return true;
  }

  return false;
}

/**
 * Classifies document as MAIN_CURRICULUM or INDIVIDUAL_ELECTIVE
 */
export function detectDocumentType(pages) {
  let schemePageCount = 0;
  let hasElectiveHeader = false;

  for (let i = 0; i < Math.min(pages.length, 12); i++) {
    const txt = pages[i].text;
    if (/(?:COURSE\s*STRUCTURE|SCHEME\s*OF\s*INSTRUCTION|CURRICULUM\s*STRUCTURE|SEMESTER\s*SCHEME)/i.test(txt)) {
      schemePageCount++;
    }
    if (/(?:Open\s*Elective|Professional\s*Elective|ANNEXURE\s*[-–:]?\s*[A-Z0-9IVX]+)/i.test(txt)) {
      hasElectiveHeader = true;
    }
  }

  if (schemePageCount >= 1 || (pages.length > 5 && !hasElectiveHeader)) {
    return 'MAIN_CURRICULUM';
  }
  return 'INDIVIDUAL_ELECTIVE';
}

/**
 * Stage 1: Extracts Course Structure Index from scheme/structure pages for metadata
 */
export function parseCourseStructure(pages, defaults = {}) {
  const courseIndex = [];
  const seenCodes = new Set();
  let lastStructurePageIndex = -1;

  let currentYear = Number(defaults.year) || 1;
  let currentSem = Number(defaults.semester) || 1;
  let currentSemLabel = defaults.semester ? `Semester ${defaults.semester}` : 'I Year - I Semester';

  const maxSearchPages = Math.min(pages.length, 30);

  for (let pIdx = 0; pIdx < maxSearchPages; pIdx++) {
    const page = pages[pIdx];
    const text = page.text;
    const lines = page.rawLines;

    // Stop searching if detailed syllabus section begins
    const isDetailedSyllabusHeading = /(?:Course\s*Code|COURSE\s*CODE)\s*[:\-–]\s*[A-Za-z0-9_-]{3,20}/i.test(text)
      || /(?:Course\s*Outcomes?|Course\s*Objectives?)\s*[:\-–]/i.test(text)
      || /UNIT\s*[-–:]?\s*(?:I|1)\b/i.test(text);

    if (isDetailedSyllabusHeading && !isStructureTablePage(page)) {
      break;
    }

    if (isStructureTablePage(page)) {
      lastStructurePageIndex = Math.max(lastStructurePageIndex, pIdx);
    }

    // Detect Year & Semester headings in course structure table
    const yrSemMatch = /(?:([IVX]+|[1-4])\s*(?:B\.?\s*TECH|YEAR))\s*[-–,\s]+\s*([IVX]+|[1-2])\s*(?:SEMESTER|SEM)/i.exec(text)
      || /(?:SEMESTER|SEM)\s*[-:]?\s*([1-8]|I|II|III|IV|V|VI|VII|VIII)\b/i.exec(text);

    if (yrSemMatch) {
      if (yrSemMatch[2]) {
        const y = romanMap[yrSemMatch[1].toUpperCase()] || Number(yrSemMatch[1]) || currentYear;
        const s = romanMap[yrSemMatch[2].toUpperCase()] || Number(yrSemMatch[2]) || currentSem;
        currentYear = Math.min(Math.max(y, 1), 4);
        currentSem = (currentYear - 1) * 2 + Math.min(Math.max(s, 1), 2);
        currentSemLabel = `${['I', 'II', 'III', 'IV'][currentYear - 1]} Year - ${['I', 'II'][(currentSem - 1) % 2]} Semester (Sem ${currentSem})`;
      } else if (yrSemMatch[1]) {
        const s = romanMap[yrSemMatch[1].toUpperCase()] || Number(yrSemMatch[1]) || currentSem;
        currentSem = s;
        currentYear = Math.ceil(s / 2);
        currentSemLabel = `${['I', 'II', 'III', 'IV'][currentYear - 1]} Year - ${['I', 'II'][(currentSem - 1) % 2]} Semester (Sem ${currentSem})`;
      }
    }

    // Match table rows: Course Code, Category, Title, L, P, Internal, External, Total, Credits
    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const line = lines[lIdx];
      const match = codePattern.exec(line);
      codePattern.lastIndex = 0;

      if (match) {
        const code = match[0].toUpperCase();
        if (ignoredCodes.has(code) || seenCodes.has(code)) continue;

        if (/^(?:Course\s*Code|L\s*T\s*P\s*C|L-T-P-C|Annexure|Autonomous|Approved)/i.test(line)) continue;

        let category = 'PC';
        const catMatch = /\b(BS|ES|HSS|HS|PC|PE|OE|SC|MC|PR|PROJ|PCC|ESC|BSC|HSMC|OEC|PEC)\b/i.exec(line);
        if (catMatch) category = catMatch[1].toUpperCase();

        let title = line
          .replace(code, '')
          .replace(/\b(BS|ES|HSS|HS|PC|PE|OE|SC|MC|PR|PROJ|PCC|ESC|BSC|HSMC|OEC|PEC)\b/gi, '')
          .replace(/\b[0-9]+(?:\.[0-9]+)?\b/g, '')
          .replace(/[-–:]/g, ' ')
          .trim();

        if (/^(?:Course\s*Code|L\s*T\s*P\s*C|L-T-P-C)\b/i.test(title)) continue;

        if ((!title || title.length < 3) && lines[lIdx + 1] && !codePattern.test(lines[lIdx + 1])) {
          title = lines[lIdx + 1]
            .replace(/\b(BS|ES|HSS|HS|PC|PE|OE|SC|MC|PR|PROJ|PCC|ESC|BSC|HSMC|OEC|PEC)\b/gi, '')
            .replace(/\b[0-9]+(?:\.[0-9]+)?\b/g, '')
            .trim();
        }

        const numbers = (line.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);
        let l = '3', p = '0', internal = '30', external = '70', total = '100', credits = '3';
        if (numbers.length >= 4) {
          l = String(numbers[0] ?? 3);
          p = String(numbers[1] ?? 0);
          if (numbers.length >= 6) {
            internal = String(numbers[2] ?? 30);
            external = String(numbers[3] ?? 70);
            total = String(numbers[4] ?? 100);
            credits = String(numbers[5] ?? (Number(l) + Number(p) / 2));
          } else {
            credits = String(numbers[numbers.length - 1] ?? 3);
          }
        }

        if (title && title.length >= 2) {
          seenCodes.add(code);
          courseIndex.push({
            course_code: code,
            course_title: clean(title),
            category,
            year: `${['I', 'II', 'III', 'IV'][currentYear - 1]} Year`,
            year_number: currentYear,
            semester: currentSemLabel,
            semester_number: currentSem,
            l,
            p,
            internal,
            external,
            total,
            credits,
            structure_page: page.pageNum,
            is_placeholder: false
          });
        }
      }

      const electiveSlotMatch = /\b(OE\s*[-–:]?\s*[1-4]|PE\s*[-–:]?\s*[1-6]|Open\s*Elective\s*[-–:]?\s*[1-4]|Professional\s*Elective\s*[-–:]?\s*[1-6])\b/i.exec(line);
      if (electiveSlotMatch && !match) {
        const slot = clean(electiveSlotMatch[1].toUpperCase());
        const cat = slot.startsWith('OE') || slot.includes('OPEN') ? 'OE' : 'PE';
        courseIndex.push({
          course_code: slot.replace(/\s+/g, '-'),
          course_title: slot.startsWith('OE') ? `Open Elective (${slot})` : `Professional Elective (${slot})`,
          category: cat,
          year: `${['I', 'II', 'III', 'IV'][currentYear - 1]} Year`,
          year_number: currentYear,
          semester: currentSemLabel,
          semester_number: currentSem,
          l: '3',
          p: '0',
          internal: '30',
          external: '70',
          total: '100',
          credits: '3',
          structure_page: page.pageNum,
          is_placeholder: true,
          slot
        });
      }
    }
  }

  return {
    courseIndex,
    lastStructurePageIndex
  };
}

export function cleanCourseCode(raw) {
  let code = String(raw || '').trim().toUpperCase();
  code = code.replace(/[-_]?L[-–]?T[-–]?P.*$/i, '');
  
  // Standard 10-char autonomous code (e.g. 24BM11RC01, 24EC11EL04, 24CSIIEL02)
  const tenCharMatch = /^([0-9]{2}[A-Z]{2,4}[0-9]{2}[A-Z]{2}[0-9]{2})/i.exec(code);
  if (tenCharMatch) {
    return tenCharMatch[1].toUpperCase();
  }

  // Standard 8-char code (e.g. 22CS3101, 20IT1101, 22BS1101)
  const eightCharMatch = /^([0-9]{2}[A-Z]{2,4}[0-9]{4})/i.exec(code);
  if (eightCharMatch) {
    return eightCharMatch[1].toUpperCase();
  }

  if (code.endsWith('L') && code.length > 8) {
    code = code.slice(0, -1);
  }
  return code;
}

/**
 * Detects if a detailed syllabus subject starts on this page.
 * Returns null if the page is a structure table or does not contain a course start marker.
 */
export function detectCourseHeadingOnPage(page, courseIndex = [], ignored = ignoredCodes) {
  // If page is a multi-course structure table page, it is NOT the start of a single subject syllabus
  if (isStructureTablePage(page)) {
    return null;
  }

  const text = page.text;
  const rawLines = page.rawLines || [];

  // 1. Check direct regex match for Course Code marker in full text
  const headingRegex = /(?:Course\s*Code|COURSE\s*CODE|Course\s*code|COURSE\s*NO|Course\s*No|Sub(?:ject)?\s*Code)\s*[:\-–]?\s*([A-Za-z0-9_-]{3,25})/gi;
  let match = headingRegex.exec(text);

  let rawCode = '';
  let matchIndex = -1;

  if (match) {
    const candidate = match[1].trim();
    const cm = codePattern.exec(candidate) || codePattern.exec(text.slice(match.index));
    codePattern.lastIndex = 0;
    if (cm) {
      rawCode = cleanCourseCode(cm[0]);
    } else {
      rawCode = cleanCourseCode(candidate);
    }
    matchIndex = match.index;
  } else {
    // 2. Check if "Course Code:" is on one line and the code is on the next line
    for (let i = 0; i < rawLines.length - 1; i++) {
      const line = rawLines[i];
      if (/(?:Course\s*Code|COURSE\s*CODE|Course\s*code|COURSE\s*NO|Course\s*No|Sub(?:ject)?\s*Code)\s*[:\-–]?$/i.test(line)) {
        const nextLine = clean(rawLines[i + 1]);
        const cm = codePattern.exec(nextLine);
        codePattern.lastIndex = 0;
        if (cm) {
          rawCode = cleanCourseCode(cm[0]);
          matchIndex = text.indexOf(line);
          break;
        }
      }
    }
  }

  if (!rawCode || ignored.has(rawCode) || !/[A-Z]/i.test(rawCode) || !/[0-9]/.test(rawCode)) {
    return null;
  }

  // 3. Extract Subject Title from lines preceding or succeeding "Course Code:"
  let prefixText = matchIndex > 0 ? text.slice(0, matchIndex) : '';
  const prefixLines = prefixText.split('\n').map(clean).filter(Boolean);
  let title = '';
  let category = '';
  let annexure = '';

  const annexureMatch = /(ANNEXURE\s*[-–:]?\s*[A-Za-z0-9IVX]+)/i.exec(prefixText) || /(ANNEXURE\s*[-–:]?\s*[A-Za-z0-9IVX]+)/i.exec(text);
  if (annexureMatch) annexure = clean(annexureMatch[1]);

  const catMatch = /\(\s*([A-Za-z\s–-]+(?:Elective|Core|Mandatory|Integrated|Skill|Audit|Humanities|Basic\s*Science|Engineering\s*Science|OE|PE)[A-Za-z0-9\s–-]*)\s*\)/i.exec(prefixText)
    || /\(\s*([A-Za-z\s–-]+(?:Elective|Core|Mandatory|Integrated|Skill|Audit|Humanities|Basic\s*Science|Engineering\s*Science|OE|PE)[A-Za-z0-9\s–-]*)\s*\)/i.exec(text);
  if (catMatch) category = clean(catMatch[1]);

  // Search backwards for title line
  for (let j = prefixLines.length - 1; j >= 0; j--) {
    const l = prefixLines[j];
    if (/^(gayatri\s*vidya|autonomous|approved|permanently|madhurawada|visakhapatnam|annexure|course\s*code|department|b\.?\s*tech|scheme|regulations|curriculum)/i.test(l)) continue;
    if (/^\(?(?:Open\s*Elective|Professional\s*Elective|Common\s*to|Mandatory|Basic\s*Science|Engineering\s*Science|Humanities|Core)[^\)]*\)?$/i.test(l)) continue;
    if (/^[0-9\s\-–:]+$/.test(l)) continue;

    if (l.length >= 3) {
      title = l.replace(/^[-–:]\s*/, '').trim();
      break;
    }
  }

  // If not found in prefix, search lines immediately after "Course Code: ..."
  if (!title || title.length < 3) {
    const afterCodeText = matchIndex >= 0 ? text.slice(matchIndex + 20) : text;
    const afterLines = afterCodeText.split('\n').map(clean).filter(Boolean);
    for (let k = 0; k < Math.min(afterLines.length, 6); k++) {
      const l = afterLines[k];
      if (/^(course\s*)?(code|title|category|l\s*[-:]|p\s*[-:]|credits|hours|marks|l-t-p|c\b)/i.test(l)) continue;
      if (/^[0-9\s\-–:]+$/.test(l)) continue;
      if (l.length >= 3 && !/^(unit\s*[-–:]?|course\s*outcomes?)/i.test(l)) {
        title = l.replace(/^(course\s*name|title|subject\s*name)\s*[:\-–]?/i, '').trim();
        break;
      }
    }
  }

  // Cross-reference with Stage 1 Course Structure index if available
  const normalizedCode = rawCode.replace(/II/g, '11');
  const indexed = courseIndex.find(c => c.course_code === rawCode || c.course_code.replace(/II/g, '11') === normalizedCode);
  if (indexed && indexed.course_title && indexed.course_title.length >= 3) {
    if (!title || title.length < 3 || title.includes('...') || /^(course|subject)/i.test(title)) {
      title = indexed.course_title;
    }
    if (!category) category = indexed.category;
  }

  if (!title || title.length < 2) {
    title = `Subject ${rawCode}`;
  }

  title = title.replace(/\s*\(?(?:Common to|Professional Elective|Open Elective|Mandatory Course).*$/i, '').trim();

  return {
    courseCode: rawCode,
    code: rawCode,
    courseTitle: clean(title),
    title: clean(title),
    category: category || indexed?.category || 'PC',
    annexure,
    pageIndex: page.pageIndex,
    pageNum: page.pageNum
  };
}

/**
 * Stage 3: Section Boundary Detection and Structured Content Extraction
 */
export function parseStructuredSyllabusContent(courseText, courseCode) {
  const annexureMatch = /(ANNEXURE\s*[-–:]?\s*[A-Z0-9IVX]+)/i.exec(courseText);
  const annexure = clean(annexureMatch?.[1] || '');

  const catRegex = /\(\s*([A-Za-z\s–-]+(?:Elective|Core|Mandatory|Integrated|Skill|Audit|Humanities|Basic\s*Science|Engineering\s*Science|OE|PE)[A-Za-z0-9\s–-]*)\s*\)/i;
  const categoryMatch = catRegex.exec(courseText);
  let category = clean(categoryMatch?.[1] || '');

  let course_name = '';
  const codeIdx = courseText.indexOf(courseCode);
  const prefixText = codeIdx > 0 ? courseText.slice(Math.max(0, codeIdx - 600), codeIdx) : courseText.slice(0, 400);
  const prefixLines = prefixText.split('\n').map(clean).filter(Boolean);

  for (let j = prefixLines.length - 1; j >= 0; j--) {
    const line = prefixLines[j];
    if (/^(gayatri\s*vidya|autonomous|approved\s*by|permanently\s*affiliated|madhurawada|annexure|course\s*code|department|b\.?\s*tech)/i.test(line)) continue;
    if (/^\(?[A-Za-z\s–-]+(?:Elective|Core|Course|Mandatory|BS|ES|PC|HSS|OE|PE)\)?$/i.test(line)) continue;
    if (line.length >= 3 && !/^\d+$/.test(line) && !/^\([^\)]+\)$/.test(line)) {
      course_name = line.replace(/^[-–:]\s*/, '').trim();
      break;
    }
  }

  if (!course_name || course_name.length < 3) {
    const afterCodeLines = courseText.slice(codeIdx + courseCode.length).split('\n').map(clean).filter(Boolean);
    const filtered = afterCodeLines.filter(line =>
      !/^(course\s*)?(code|title|category|l\s*[-:]|p\s*[-:]|credits|hours|s\.?no|marks|l-t-p)\b/i.test(line)
      && !/^\d+\s+\d+\s+\d+\s+\d+/.test(line)
      && line.length > 2
      && !/^(page\s*\d+|gayatri\s*vidya|autonomous|department\s*of|annexure)/i.test(line)
    );
    course_name = clean(filtered[0]?.replace(/^(course\s*name|title|subject\s*name)\s*[:\-–]?/i, ''));
  }

  if (!course_name || course_name.length < 2) {
    course_name = `Course ${courseCode}`;
  }
  course_name = course_name.replace(/\s*\(?(?:Common to|Professional Elective|Open Elective|Mandatory Course).*$/i, '').trim();

  const ltpcMatch = /\bL\s*[-–:]?\s*T\s*[-–:]?\s*P\s*[-–:]?\s*C\s*[:\-–]?\s*([0-9]+)\s*[-–]\s*([0-9]+)\s*[-–]\s*([0-9]+)\s*[-–]\s*([0-9]+(?:\.[0-9]+)?)/i.exec(courseText)
    || /\bL\s*[-–:]?\s*T\s*[-–:]?\s*P\s*[:\-–]?\s*([0-9]+)\s*[-–]\s*([0-9]+)\s*[-–]\s*([0-9]+)/i.exec(courseText);

  let l = '3', t = '0', p = '0', credits = '3', ltpc = '3-0-0-3';
  if (ltpcMatch) {
    l = ltpcMatch[1] || '3';
    t = ltpcMatch[2] || '0';
    p = ltpcMatch[3] || '0';
    credits = ltpcMatch[4] || String(Number(l) + Number(p) / 2 || '3');
    ltpc = `${l}-${t}-${p}-${credits}`;
  }

  const coSectionRegex = /(?:Course\s*Outcomes?\s*[:\-–]?\s*)([\s\S]*?)(?=(?:\n\s*UNIT\s*[-–:]?\s*(?:I|1)\b|\n\s*MODULE\s*[-–:]?\s*1\b|$))/i;
  const coMatch = coSectionRegex.exec(courseText);
  const rawOutcomes = clean(coMatch?.[1] || '');

  const coIntroMatch = /^([\s\S]*?)(?=\bCO\s*[1-9]\s*[:\.\-–]|\b[1-9]\.\s)/i.exec(rawOutcomes);
  const co_intro = clean(coIntroMatch?.[1] || 'At the end of the Course, the student shall be able to:');

  const co_list = [];
  const coItemRegex = /(?:CO\s*([1-9])|[1-9]\.)\s*[:\.\-–]?\s*([\s\S]*?)(?=(?:\n\s*CO\s*[1-9]|\n\s*[1-9]\.|$))/gi;
  let com;
  while ((com = coItemRegex.exec(rawOutcomes)) !== null) {
    const num = com[1] || String(co_list.length + 1);
    const coText = clean(com[2]);
    if (coText && coText.length > 2) {
      co_list.push({ code: `CO${num}`, text: coText });
    }
  }

  if (!co_list.length && rawOutcomes) {
    rawOutcomes.split('\n').map(clean).filter(line => line.length > 5 && !/^(course\s*outcomes?|at\s*the\s*end)/i.test(line))
      .forEach((line, idx) => co_list.push({ code: `CO${idx + 1}`, text: line }));
  }

  const unitsList = [];
  const unitContents = {};
  const unitLectures = {};

  for (let u = 1; u <= 5; u++) {
    const curRom = romanNumerals[u - 1];
    const nextRom = romanNumerals[u];
    const nextBoundary = u < 5
      ? `(?=\\n\\s*UNIT\\s*[-–:]?\\s*(?:${nextRom}|${u + 1})\\b|\\n\\s*MODULE\\s*[-–:]?\\s*${u + 1}\\b)`
      : `(?=(?:\\n\\s*(?:TEXT\\s*BOOKS?|REFERENCE\\s*BOOKS?|REFERENCES?|WEB\\s*REFERENCES?|ONLINE\\s*RESOURCES?|GAYATRI\\s*VIDYA|DEPARTMENT)|$))`;

    const unitRegex = new RegExp(`(?:^|\\n)\\s*UNIT\\s*[-–:]?\\s*(?:${curRom}|${u})\\b[\\t ]*([0-9]+\\s*(?:Lectures?|Hours?|Periods?|Hrs|L)?)[\\:\\-–\\t ]*([\\s\\S]*?)${nextBoundary}`, 'i');
    const uMatch = unitRegex.exec(courseText);

    let rawLect = clean(uMatch?.[1] || '');
    let lectures = rawLect ? (/\d/.test(rawLect) && !/lectures?/i.test(rawLect) ? `${rawLect} Lectures` : rawLect) : (u === 3 ? '12 Lectures' : '09 Lectures');
    let content = clean(uMatch?.[2] || '');

    content = content
      .replace(/GAYATRI\s*VIDYA\s*PARISHAD[\s\S]*?Visakhapatnam[^\n]*/gi, '')
      .replace(/\(Autonomous\)[\s\S]*?Visakhapatnam[^\n]*/gi, '')
      .replace(/Madhurawada[^\n]*/gi, '')
      .trim();

    const topicLines = content.split('\n').map(clean).filter(Boolean);

    unitContents[`unit_${u}`] = content;
    unitLectures[`unit_${u}_lectures`] = lectures;
    if (content) {
      unitsList.push({
        unit: `UNIT-${curRom}`,
        number: `UNIT-${curRom}`,
        lectures,
        content,
        topics: topicLines
      });
    }
  }

  const textBooksSection = /(?:TEXT\s*BOOKS?\s*[:\-–]?\s*)([\s\S]*?)(?=(?:\n\s*(?:REFERENCE\s*BOOKS?|REFERENCES?|WEB\s*REFERENCES?|ONLINE\s*RESOURCES?)|$))/i.exec(courseText);
  const rawTextBooks = clean(textBooksSection?.[1] || '');

  const refBooksSection = /(?:REFERENCE\s*BOOKS?|REFERENCES?|SUGGESTED\s*READINGS?)\s*[:\-–]?\s*([\s\S]*?)(?=(?:\n\s*(?:WEB\s*REFERENCES?|ONLINE\s*RESOURCES?|E-RESOURCES?)|$))/i.exec(courseText);
  const rawRefBooks = clean(refBooksSection?.[1] || '');

  const webRefsSection = /(?:WEB\s*REFERENCES?|ONLINE\s*RESOURCES?|E-RESOURCES?)\s*[:\-–]?\s*([\s\S]*?)$/i.exec(courseText);
  const rawWebRefs = clean(webRefsSection?.[1] || '');

  const parseBooks = (raw) => {
    if (!raw) return [];
    const cleaned = raw.replace(/GAYATRI\s*VIDYA\s*PARISHAD[\s\S]*?Visakhapatnam[^\n]*/gi, '').trim();
    const items = [];
    const itemRegex = /(?:^|\n)\s*(?:[0-9]+[\.\)]|•|\*|-)\s*([\s\S]*?)(?=(?:\n\s*(?:[0-9]+[\.\)]|•|\*|-)\s*|$))/g;
    let m;
    while ((m = itemRegex.exec(cleaned)) !== null) {
      const itm = clean(m[1]);
      if (itm && itm.length > 2) items.push(itm);
    }
    if (!items.length && cleaned) {
      return cleaned.split('\n').map(clean).filter(l => l.length > 5);
    }
    return items;
  };

  const text_books_list = parseBooks(rawTextBooks);
  const reference_books_list = parseBooks(rawRefBooks);
  const web_references_list = parseBooks(rawWebRefs);

  return {
    course_name,
    annexure,
    category,
    ltpc,
    l,
    p,
    credits,
    course_outcomes: rawOutcomes,
    co_intro,
    co_list,
    units_list: unitsList,
    ...unitContents,
    ...unitLectures,
    textbooks: rawTextBooks,
    reference_books: rawRefBooks,
    web_references: rawWebRefs,
    text_books_list,
    reference_books_list,
    web_references_list
  };
}

/**
 * Main Syllabus Splitting Pipeline:
 *
 * ALGORITHM:
 * 1. Process original PDF page-by-page.
 * 2. Maintain exact 0-based pageIndex and 1-based pageNumber.
 * 3. When Course Code is detected on a detailed page:
 *    - Finalize previous course: endPage = pageNumber - 1, totalPages = endPage - startPage + 1
 *    - Start new course: startPage = pageNumber
 * 4. Accumulate all following pages into the current course.
 * 5. After entire PDF finishes:
 *    - Finalize final course: endPage = totalPdfPages, totalPages = endPage - startPage + 1
 * 6. Slice authentic multi-page PDFs using pdf-lib.copyPages.
 * 7. Strictly validate all course objects (no NaN, real start/end/total pages).
 */
export async function parseSyllabusPdf(buffer, defaults = {}) {
  const { totalPages, pages } = await extractPdfPages(buffer);
  const docType = detectDocumentType(pages);

  // Stage 1: Build Course Index from Scheme of Instruction tables (metadata only)
  const { courseIndex } = parseCourseStructure(pages, defaults);

  // Load source PDF document with pdf-lib for authentic page slicing
  let sourcePdfDoc = null;
  try {
    sourcePdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch (err) {
    console.warn('pdf-lib failed to load PDF buffer:', err.message);
  }

  // Stage 2: Page-by-Page Course Code Boundary Detection & State-Machine Accumulator
  let currentCourse = null;
  let currentPages = [];
  const accumulatedBatches = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const pageNumber = pageIndex + 1;

    console.log("Processing PDF page:", pageNumber);

    const detected = detectCourseHeadingOnPage(page, courseIndex);

    if (detected && (!currentCourse || detected.code !== currentCourse.courseCode)) {
      if (currentCourse !== null) {
        // Finalize previous course
        currentCourse.endPage = pageNumber - 1;
        currentCourse.endPageIndex = pageIndex - 1;
        currentCourse.totalPages = currentCourse.endPage - currentCourse.startPage + 1;
        currentCourse.total_pages = currentCourse.totalPages;
        currentCourse.pageCount = currentCourse.totalPages;
        currentCourse.page_count = currentCourse.totalPages;
        currentCourse.pages = currentPages.map(p => p.pageNum);
        currentCourse.rawPages = [...currentPages];
        accumulatedBatches.push(currentCourse);

        console.log({
          message: "COURSE FINALIZED",
          courseCode: currentCourse.courseCode,
          startPage: currentCourse.startPage,
          endPage: currentCourse.endPage,
          totalPages: currentCourse.totalPages,
          pages: currentCourse.pages
        });
      }

      // Start new course from THIS page
      currentCourse = {
        courseCode: detected.code,
        course_code: detected.code,
        courseTitle: detected.title,
        course_name: detected.title,
        category: detected.category,
        annexure: detected.annexure,
        startPage: pageNumber,
        start_page: pageNumber,
        startPageIndex: pageIndex,
        endPage: null,
        end_page: null,
        endPageIndex: null,
        totalPages: null,
        total_pages: null,
        pages: []
      };
      currentPages = [page];

      console.log({
        message: "COURSE DETECTED",
        pageNumber,
        courseCode: detected.code,
        courseTitle: detected.title
      });
    } else {
      // Accumulate page into active subject
      if (currentCourse !== null) {
        currentPages.push(page);
      }
    }
  }

  // Finalize the final subject after the last page
  if (currentCourse !== null) {
    currentCourse.endPage = totalPages;
    currentCourse.end_page = totalPages;
    currentCourse.endPageIndex = totalPages - 1;
    currentCourse.totalPages = currentCourse.endPage - currentCourse.startPage + 1;
    currentCourse.total_pages = currentCourse.totalPages;
    currentCourse.pageCount = currentCourse.totalPages;
    currentCourse.page_count = currentCourse.totalPages;
    currentCourse.pages = currentPages.map(p => p.pageNum);
    currentCourse.rawPages = [...currentPages];
    accumulatedBatches.push(currentCourse);

    console.log({
      message: "FINAL COURSE FINALIZED",
      courseCode: currentCourse.courseCode,
      startPage: currentCourse.startPage,
      endPage: currentCourse.endPage,
      totalPages: currentCourse.totalPages,
      pages: currentCourse.pages
    });
  }

  const results = [];

  // Stage 3: Slice authentic PDF pages & parse structured text for each course
  for (const batch of accumulatedBatches) {
    const {
      courseCode,
      startPageIndex,
      endPageIndex,
      startPage,
      endPage,
      totalPages: pageCount,
      rawPages: coursePages
    } = batch;

    const normalizedCode = courseCode.replace(/II/g, '11');
    const indexed = courseIndex.find(c => c.course_code === courseCode || c.course_code.replace(/II/g, '11') === normalizedCode) || {};

    const combinedCourseText = coursePages.map(p => p.text).join('\n\n');

    // Slice authentic PDF pages preserving exact formatting, tables, images, fonts, headers & footers
    let pdf_base64 = '';
    let pdf_size_bytes = 0;

    if (sourcePdfDoc) {
      try {
        const subDoc = await PDFDocument.create();
        const pageIndices = [];
        for (let p = startPageIndex; p <= endPageIndex; p++) {
          if (p < sourcePdfDoc.getPageCount()) {
            pageIndices.push(p);
          }
        }
        if (pageIndices.length > 0) {
          const copiedPages = await subDoc.copyPages(sourcePdfDoc, pageIndices);
          copiedPages.forEach(cp => subDoc.addPage(cp));
          const subBytes = await subDoc.save();
          pdf_base64 = Buffer.from(subBytes).toString('base64');
          pdf_size_bytes = subBytes.length;
        }
      } catch (err) {
        console.warn(`Failed to slice PDF for ${courseCode}:`, err.message);
      }
    }

    // Extract structured sections (COs, Units I-V, Textbooks, References, L-T-P-C)
    const structured = parseStructuredSyllabusContent(combinedCourseText, courseCode);

    const candidateTitles = [
      batch.courseTitle,
      structured.course_name,
      indexed.course_title
    ].filter(t => t && t.length >= 3 && !/^(subject|course)\s*[A-Za-z0-9_-]+$/i.test(t) && !/^(course\s*code|l\s*t\s*p)/i.test(t));

    const courseTitle = candidateTitles[0] || indexed.course_title || structured.course_name || batch.courseTitle || `Course ${courseCode}`;
    const fileName = formatSyllabusFilename(courseCode, courseTitle);

    const yearNumber = indexed.year_number || defaults.year_number || Number(defaults.year) || 1;
    const semesterNumber = indexed.semester_number || defaults.semester_number || Number(defaults.semester) || 1;
    const semesterLabel = indexed.semester || defaults.semesterLabel || defaults.semester || `Semester ${semesterNumber}`;

    const pagesArray = Array.from({ length: pageCount }, (_, i) => startPage + i);
    const pageIndicesArray = Array.from({ length: pageCount }, (_, i) => startPageIndex + i);

    const courseRecord = {
      // Direct property names (matching both camelCase & snake_case)
      courseCode: courseCode,
      course_code: courseCode,
      courseTitle: courseTitle,
      course_name: courseTitle,

      fileName: fileName,
      file_name: fileName,

      // Real 1-based page numbers
      startPage: startPage,
      endPage: endPage,
      totalPages: pageCount,

      // Comprehensive aliases
      start_page: startPage,
      end_page: endPage,
      total_pages: pageCount,
      page_start: startPage,
      page_end: endPage,
      page_count: pageCount,
      pageCount: pageCount,

      // Page numbers arrays
      pages: pagesArray,
      pageIndices: pageIndicesArray,

      // Authentic Sliced PDF payload
      pdf_base64: pdf_base64,
      pdf_size_bytes: pdf_size_bytes,

      // Syllabus content
      annexure: structured.annexure || batch.annexure || '',
      category: indexed.category || structured.category || batch.category || 'PC',
      ltpc: structured.ltpc,
      department: defaults.department || 'CSE',
      year: `${['I', 'II', 'III', 'IV'][yearNumber - 1]} Year`,
      year_number: yearNumber,
      semester_number: semesterNumber,
      semester: semesterLabel,
      credits: indexed.credits || structured.credits || '3',
      l: indexed.l || structured.l || '3',
      p: indexed.p || structured.p || '0',
      internal: indexed.internal || '30',
      external: indexed.external || '70',
      total: indexed.total || '100',
      source_type: docType,
      structure_page: indexed.structure_page || null,
      ...structured
    };

    // Strict validation assertion
    if (courseRecord.startPage == null || isNaN(courseRecord.startPage) || courseRecord.startPage < 1) {
      throw new Error(`Validation Failed: Invalid startPage for ${courseCode}: ${courseRecord.startPage}`);
    }
    if (courseRecord.endPage == null || isNaN(courseRecord.endPage) || courseRecord.endPage < courseRecord.startPage) {
      throw new Error(`Validation Failed: Invalid endPage for ${courseCode}: ${courseRecord.endPage} (start was ${courseRecord.startPage})`);
    }
    if (courseRecord.endPage > totalPages) {
      throw new Error(`Validation Failed: endPage (${courseRecord.endPage}) exceeds totalPdfPages (${totalPages}) for ${courseCode}`);
    }
    if (courseRecord.totalPages !== (courseRecord.endPage - courseRecord.startPage + 1)) {
      throw new Error(`Validation Failed: totalPages mismatch for ${courseCode}: ${courseRecord.totalPages} !== ${courseRecord.endPage - courseRecord.startPage + 1}`);
    }

    results.push(courseRecord);
  }

  // Print Boundary Verification Table
  console.log('\n================================================================================');
  console.log('SYLLABUS BOUNDARY VALIDATION SUMMARY');
  console.log('================================================================================');
  console.log('Course Code | Course Title                           | Start Page | End Page | Total Pages');
  console.log('--------------------------------------------------------------------------------');
  results.forEach(r => {
    console.log(`${r.courseCode.padEnd(11)} | ${(r.courseTitle || '').slice(0, 38).padEnd(38)} | ${String(r.startPage).padStart(10)} | ${String(r.endPage).padStart(8)} | ${String(r.totalPages).padStart(11)}`);
  });
  console.log('================================================================================\n');

  // Sort by semester number and course code
  results.sort((a, b) => {
    if ((a.semester_number || 0) !== (b.semester_number || 0)) {
      return (a.semester_number || 0) - (b.semester_number || 0);
    }
    return a.courseCode.localeCompare(b.courseCode);
  });

  return results;
}
