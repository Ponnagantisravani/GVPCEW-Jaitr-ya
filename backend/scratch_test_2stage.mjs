import fs from 'fs';
import { extractPdfPages, detectDocumentType, parseCourseStructure, parseSyllabusPdf } from './src/services/syllabusPdfParser.js';

const pdfPath = 'C:\\Users\\SRAVANI\\.gemini\\antigravity-ide\\brain\\cf525b40-3fbd-47ca-b599-0fb86d5b3082\\.user_uploaded\\media_1789882775089.pdf';
const buf = fs.readFileSync(pdfPath);

async function test() {
  const { totalPages, pages } = await extractPdfPages(buf);
  console.log('Total pages:', totalPages);
  const docType = detectDocumentType(pages);
  console.log('Detected Document Type:', docType);

  const results = await parseSyllabusPdf(buf, { department: 'ECE', year: '3', semester: '5' });
  console.log('Results count:', results.length);
  results.forEach(r => {
    console.log({
      course_code: r.course_code,
      course_name: r.course_name,
      category: r.category,
      annexure: r.annexure,
      page_range: `${r.page_start} - ${r.page_end} (${r.page_count} pages)`,
      pdf_base64_length: r.pdf_base64?.length,
      units: r.units_list?.map(u => ({ unit: u.unit, lectures: u.lectures })),
      textbooks: r.text_books_list,
      references: r.reference_books_list,
      validation: r.validation
    });
  });
}

test().catch(console.error);
