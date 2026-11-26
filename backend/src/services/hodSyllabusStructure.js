import cseSyllabusIndex from '../data/cse-syllabus-index.json' with {type:'json'};
import {parseSyllabusPdf} from './syllabusPdfParser.js';

const asText=value=>String(value||'').trim();
const asNumber=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};

/** Reuse the existing syllabus parser and enrich its page slices with the
 * reviewed semester map already used by the CSE curriculum index. */
export async function splitFourYearStructure(bytes,{program=''}={}){
  const detected=await parseSyllabusPdf(bytes,{department:program});
  return detected.map(item=>{
    const code=asText(item.course_code||item.courseCode).toUpperCase();
    const indexed=cseSyllabusIndex[code]||cseSyllabusIndex[code.replace(/II/g,'11')];
    const title=asText(indexed?.title||item.course_name||item.courseTitle)||`Course ${code}`;
    const year=asNumber(indexed?.year??item.year_number,0);
    const semester=asNumber(indexed?.semester??item.semester_number,0);
    if(!code||!year||!semester)return null;
    const category=asText(indexed?.type||item.category).toLowerCase();
    const type=indexed?.elective||/\b(open|professional) elective\b|\b(oe|pe)\b/i.test(category+' '+code)?'elective':/lab/i.test(category+' '+title)?'lab':'theory';
    const pdf=Buffer.from(item.pdf_base64||'','base64');
    if(pdf.subarray(0,5).toString()!=='%PDF-')return null;
    return {item,code,title,year,semester,type,credits:asNumber(indexed?.credits??item.credits,0),periodsPerWeek:asNumber(asNumber(indexed?.l??item.l)+asNumber(indexed?.p??item.p),0),pdf};
  }).filter(Boolean);
}
