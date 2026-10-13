import fs from 'node:fs';
import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';
import {detectAndSplitTimetableExcel} from '../frontend/src/utils/timetableSplitter.js';
const source=JSON.parse(fs.readFileSync(new URL('iii-cse3-reference-timetable.json',import.meta.url)));
const slots={
 'AI (MA)':'AI:MA','CD (GSR)':'CD:GSR','IRS/MPMC (KSR/MHL)':'IRS/MPMC:KSR',
 'Lunch':'LUNCH','DM Lab (YS, Bhavana)':'DMLAB:YS','HPC Honors (SSH)':'HPC:SSH',
 'DT&E (KR)':'DTE:KR','CN (DI)':'CN:DI','Library':'LIB:DI','DWDM (YS)':'DWDM:YS',
 'SM Honors (MBS)':'SM:MBS','CD Tutorial (GSR)':'CDT:GSR','Counselling':'COUNSELLING:YS',
 'DevOps (YAVLP)':'DEVOPS:YAVLP','CN Lab (DI, Bhoomika)':'CNLAB:DI','DWDM Tutorial (YS)':'DWDMT:YS'
};
const rows=[['TIME TABLE FOR III BTECH I SEMESTER 2026-2027'],['DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING'],['Class Teacher: Mrs. Y. Sowmya'],
 ['III CSE-3 Room:104',...source.periods.map(([a,b])=>a+' - '+b)],
 ...Object.entries(source.days).map(([day,cells])=>[day.slice(0,3).toUpperCase(),...cells.map(x=>slots[x])]),
 ['AI:Mrs.M.Aswini CD:Dr.G.Sankara Rao IRS/MPMC:Mrs.K.Sirisha DWDM:Mrs.Y.Sowmya CN:Dr.D.Indu DTE:Dr.K.Rohini DEVOPS:Dr.Y.A.V.LakshmiPrasanna HPC:Dr.S.S.H SM:Dr.M.B.S DMLAB:Mrs.Y.Sowmya CNLAB:Dr.D.Indu CDT:Dr.G.Sankara Rao DWDMT:Mrs.Y.Sowmya LIB:Dr.D.Indu COUNSELLING:Mrs.Y.Sowmya']];
const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(rows);
sheet['!cols']=[{wch:25},...Array.from({length:8},()=>({wch:23}))];
XLSX.utils.book_append_sheet(workbook,sheet,'III CSE 3');
const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
const checked=detectAndSplitTimetableExcel(bytes);
if(!checked.sections?.length)throw Error('Dashboard importer did not recognize the timetable.');
fs.writeFileSync(new URL('III-CSE-3-Room-104.xlsx',import.meta.url),bytes);
console.log(JSON.stringify({sections:checked.sections.map(s=>({section:s.sectionNumber||s.section,rows:s.rows?.length})),days:Object.keys(source.days).length,file:'III-CSE-3-Room-104.xlsx'}));
