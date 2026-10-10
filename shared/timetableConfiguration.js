export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const HOURS = {CD:4,DWDM:4,'IRS/MPMC':4,CN:4,AI:4,'DT&E':3,COUNSELLING:1,TERMPROJECT:3,'DEVOPS LAB':3,'CN LAB':3,'DM LAB':3};
export const LABS = {'DEVOPS LAB':['PROJECTS LAB'],'CN LAB':['CSLAB1','CSLAB2'],'DM LAB':['CSLAB3','CSLAB4']};
export const POOLS = {
 CN:['Dr. D. Indu','Dr. P. Muralidhara Rao','Dr. G. Sankara Rao'],
 DWDM:['Mrs. Y. Sowmya','Mrs. R. Archana','Mrs. V. Gowtami Annapurna'],
 CD:['Mrs. K. Suneetha','Dr. G. Sankara Rao','Dr. N. Sharmili'],
 AI:['Mrs. M. Aswini','Mrs. K. Lakshmi','Mrs. M. K. Lakshmi'],
 IRS:['Mrs. M. Deepthi','Mrs. K. Sirisha'],
 'DT&E':['Dr. N. Sharmili','Mrs. M. Aswini','Dr. K. Rohini','Mrs. D. Sarvani'],
 'DEVOPS LAB':['Mrs. P. S. L. Sravani','Dr. P. V. S. L. Jagadamba','Mrs. Y. A. V. Lakshmi Prasanna'],
 'CN LAB':['Dr. D. Indu','Dr. P. Muralidhara Rao','Dr. G. Sankara Rao','Ms. Bhoomika','Mrs. V. S. Swathi Priya','Mrs. D. Sarvani'],
 'DM LAB':['Mrs. Y. Sowmya','Mrs. R. Archana','Mrs. V. Gowtami Annapurna','Mrs. P. S. L. Sravani','Ms. Bhavana']
};
export const FIXED = {CD:['Mrs. K. Suneetha'],DWDM:['Mrs. Y. Sowmya'],'IRS/MPMC':['Mrs. M. Deepthi','Mrs. M. Hemalata'],CN:['Dr. D. Indu'],AI:['Mrs. M. Aswini'],'DT&E':['Dr. N. Sharmili'],'DEVOPS LAB':['Mrs. P. S. L. Sravani'],'CN LAB':['Dr. D. Indu','Ms. Bhoomika'],'DM LAB':['Mrs. Y. Sowmya','Mrs. P. S. L. Sravani']};
export const isValue = value => typeof value==='string' && !!value.trim() && !/\[|\]|^auto$/i.test(value.trim());
export const canonicalSubject = value => value.trim().toUpperCase()==='DEVOPS'?'DEVOPS LAB':value.trim().toUpperCase();
export function configurationTemplate() {
 return 'ACADEMIC YEAR: 2026-27\nYEAR: III\nDEPARTMENT: CSE\n\n'+[1,2,3,4].map(number=>`SECTION ${number}\nROOM: ${['215','216','104','[ROOM NUMBER]'][number-1]}\nCLASS TEACHER: ${number===1?'Dr. D. Indu':'[NAME]'}\n\n`+Object.entries(HOURS).map(([subject,hours])=>`${subject}: ${hours}\nTEACHERS: ${number===1&&FIXED[subject]?FIXED[subject].join(', '):'Auto'}${LABS[subject]?`\nLAB ROOMS: ${LABS[subject].join(', ')}`:''}`).join('\n\n')).join('\n\n');
}
export function parseConfiguration(text) {
 if(typeof text!=='string'||text.length>100000) return {reasons:['Enter a configuration of at most 100,000 characters.']};
 if(text.trim().startsWith('{')) {try{const input=JSON.parse(text);if(!Array.isArray(input.sections)||input.sections.some(s=>!s||!Array.isArray(s.subjects))||!input.honours||Array.isArray(input.honours))return {reasons:['JSON requires sections with subject arrays and a honours configuration object.']};return {input,reasons:[]};}catch(error){return {reasons:['Invalid JSON: '+error.message]};}}
 const input={batch:'III CSE',academicYear:'',year:'III',department:'CSE',sections:[],unavailable:{},roomUnavailable:{},honours:{combined:true,days:['HPC','SM','HPC','SM','HPC','SM'],teachers:{HPC:'Dr. SSH',SM:'Dr. MBS'},rooms:[]}},reasons=[];
 let section,subject,availability;
 text.split(/\r?\n/).forEach((raw,index)=>{
  const line=raw.trim(); if(!line||line.startsWith('#'))return;
  const match=line.match(/^SECTION\s+([1-4])\s*:?$/i);
  if(match){section={number:Number(match[1]),name:`III CSE - ${match[1]}`,room:'',classTeacher:'',subjects:[]};input.sections.push(section);subject=null;availability=null;return;}
  const unavailable=line.match(/^(?:UNAVAILABLE|ROOM UNAVAILABLE):\s*(.+)$/i);
  if(unavailable){availability={target:line.toUpperCase().startsWith('ROOM ')?input.roomUnavailable:input.unavailable,name:unavailable[1].trim()};availability.target[availability.name]||=[];return;}
  if(availability){const slot=line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+P([1-7])$/i);if(slot){availability.target[availability.name].push(`${DAYS.findIndex(d=>d.toLowerCase()===slot[1].toLowerCase())}:${slot[2]}`);return;}availability=null;}
  const colon=line.indexOf(':');if(colon<0){reasons.push(`Line ${index+1}: expected LABEL: value.`);return;}
  const key=line.slice(0,colon).trim().toUpperCase(),value=line.slice(colon+1).trim();
  if(key==='ACADEMIC YEAR'){input.academicYear=value;return;}if(key==='YEAR'){input.year=value;return;}if(key==='DEPARTMENT'){input.department=value;return;}
  if(key==='HONOURS MODE'){input.honours.combined=value.toLowerCase()==='combined';return;}
  if(key==='HONOURS DAYS'){input.honours.days=value.split(',').map(s=>s.trim().toUpperCase());return;}
  if(key==='HONOURS ROOMS'){input.honours.rooms=value.split(',').map(s=>s.trim()).filter(Boolean);return;}
  if(key==='HPC TEACHER'||key==='SM TEACHER'){input.honours.teachers[key.split(' ')[0]]=value;return;}
  if(!section){reasons.push(`Line ${index+1}: start a SECTION before entering assignments.`);return;}
  if(key==='ROOM'){section.room=value;return;}if(key==='CLASS TEACHER'){section.classTeacher=value;return;}
  const name=canonicalSubject(key);
  if(Object.hasOwn(HOURS,name)){subject={name,hours:Number(value),kind:LABS[name]?'lab':'theory',teachers:[],...(LABS[name]?{rooms:[...LABS[name]]}:{})};section.subjects.push(subject);return;}
  if(['TEACHER','TEACHERS','LAB ROOMS'].includes(key)&&subject){const entries=/^auto$/i.test(value)?[]:value.split(/[,|]/).map(s=>s.trim()).filter(Boolean);subject[key==='LAB ROOMS'?'rooms':'teachers']=entries;return;}
  reasons.push(`Line ${index+1}: unknown label ${key}.`);
 });
 return {input,reasons};
}

export function validateBatch(input,{allowAuto=false}={}) {
 const reasons=[];
 if(!input||!Array.isArray(input.sections))return ['Enter the four III CSE sections.'];
 if(!isValue(input.academicYear))reasons.push('Enter the academic year.');
 if(input.year!=='III'||input.department!=='CSE')reasons.push('This generator requires Year III, Department CSE.');
 if(input.sections.length!==4||new Set(input.sections.map(s=>s?.number)).size!==4||input.sections.some(s=>![1,2,3,4].includes(s?.number))) reasons.push('Enter Section 1, Section 2, Section 3 and Section 4 exactly once.');
 for(const section of input.sections){
  if(!section||!Array.isArray(section.subjects)){reasons.push('Each section needs a subjects list.');continue;}
  if(!isValue(section.name))reasons.push(`Section ${section.number}: enter a section name.`);
  if(!isValue(section.room))reasons.push(`Section ${section.number} has no home classroom.`);
  if(!isValue(section.classTeacher))reasons.push(`Section ${section.number} has no class teacher.`);
  if(section.subjects.length!==11)reasons.push(`Section ${section.number}: enter all 11 required subjects exactly once.`);
  for(const [name,hours] of Object.entries(HOURS)){
   const matches=section.subjects.filter(s=>s?.name===name),subject=matches[0];
   if(matches.length!==1){reasons.push(`${name} for Section ${section.number} must appear exactly once.`);continue;}
   if(subject.hours!==hours)reasons.push(`${name} for Section ${section.number} requires ${hours} hours; ${subject.hours} entered.`);
   if(subject.kind!==(LABS[name]?'lab':'theory'))reasons.push(`${name}: use ${LABS[name]?'lab':'theory'} kind.`);
   if(LABS[name]&&(!Array.isArray(subject.rooms)||!subject.rooms.length||subject.rooms.some(r=>!isValue(r))||new Set(subject.rooms).size!==subject.rooms.length))reasons.push(`${name} for Section ${section.number}: enter distinct lab rooms.`);
   if(!Array.isArray(subject.teachers)||subject.teachers.some(t=>!isValue(t))){reasons.push(`${name} for Section ${section.number}: invalid teacher list.`);continue;}
   const count=['CN LAB','DM LAB','IRS/MPMC'].includes(name)?2:1;
   if(!subject.teachers.length&&allowAuto)continue;
   if(subject.teachers.length!==count||new Set(subject.teachers).size!==count)reasons.push(`${name} for Section ${section.number} requires ${count} distinct teacher${count>1?'s':''}.`);
   if(name==='IRS/MPMC'&&subject.teachers.length&&(!subject.teachers.includes('Mrs. M. Hemalata')||!subject.teachers.some(t=>POOLS.IRS.includes(t))))reasons.push(`IRS/MPMC for Section ${section.number} requires one IRS faculty member and Mrs. M. Hemalata.`);
  }
 }
 const honours=input.honours;
 if(!honours||typeof honours.combined!=='boolean'||!Array.isArray(honours.days)||honours.days.length!==6||honours.days.some(s=>!['HPC','SM'].includes(s))||!isValue(honours.teachers?.HPC)||!isValue(honours.teachers?.SM))reasons.push('Honours requires six HPC/SM day entries, a combined/separate mode and both teachers.');
 if(honours?.combined===false)reasons.push('Separate honours classes cannot share the same P7 teachers. Configure a combined class or provide a separate scheduling module.');
 if(honours&&(!Array.isArray(honours.rooms)||honours.rooms.some(r=>!isValue(r))||new Set(honours.rooms).size!==honours.rooms.length))reasons.push('Honours rooms must be a list of distinct room names (or an empty list).');
 for(const field of ['unavailable','roomUnavailable']){
  if(input[field]&&(typeof input[field]!=='object'||Array.isArray(input[field])))reasons.push(`${field} must map resource names to unavailable periods.`);
  else for(const [name,slots] of Object.entries(input[field]||{}))if(!Array.isArray(slots)||slots.some(s=>typeof s!=='string'||!/^[0-5]:[1-7]$/.test(s))||new Set(slots).size!==slots.length)reasons.push(`${name}: enter distinct unavailable slots in day:period format (days 0–5, periods 1–7).`);
 }
 return reasons;
}

export function assignFaculty(source) {
 const input=structuredClone(source),loads=new Map();
 const capacity=teacher=>DAYS.reduce((n,_,d)=>n+Math.min(input.honours.teachers[input.honours.days[d]]===teacher?4:5,6-(input.unavailable?.[teacher]||[]).filter(s=>s.startsWith(`${d}:`)&&!s.endsWith(':7')).length),0);
 const add=(teacher,hours)=>loads.set(teacher,(loads.get(teacher)||0)+hours);
 for(const section of input.sections)for(const subject of section.subjects){
  if(!subject.teachers.length&&section.number===1&&FIXED[subject.name])subject.teachers=[...FIXED[subject.name]];
  for(const teacher of subject.teachers)add(teacher,subject.hours);
 }
 const reasons=[];
 for(const section of input.sections)for(const subject of section.subjects){
  if(subject.teachers.length)continue;
  let pool=subject.name==='IRS/MPMC'?POOLS.IRS:POOLS[subject.name];
  // No faculty pool was supplied for these two subjects: use the entered class teacher.
  if(!pool)pool=[section.classTeacher];
  const count=['CN LAB','DM LAB'].includes(subject.name)?2:1;
  const candidates=[...pool].filter(t=>isValue(t)&&(loads.get(t)||0)+subject.hours<=capacity(t)).sort((a,b)=>(loads.get(a)||0)-(loads.get(b)||0)||pool.indexOf(a)-pool.indexOf(b));
  const valid=teachers=>{
   let windows=0;
   for(let d=0;d<6;d++)for(const p of subject.kind==='lab'?[1,4]:['COUNSELLING','TERMPROJECT'].includes(subject.name)?[6]:[1,2,3,4,5,6])if(Array.from({length:subject.kind==='lab'?3:1},(_,offset)=>p+offset).every(period=>teachers.every(t=>!input.unavailable?.[t]?.includes(`${d}:${period}`))&&(subject.rooms||[section.room]).every(r=>!input.roomUnavailable?.[r]?.includes(`${d}:${period}`))))windows++;
   return windows>=subject.hours/(subject.kind==='lab'?3:1);
  };
  let chosen=[];
  for(const teacher of candidates){if(count===1){const team=subject.name==='IRS/MPMC'?[teacher,'Mrs. M. Hemalata']:[teacher];if(valid(team)){chosen=[teacher];break;}}else{const second=candidates.find(t=>t!==teacher&&valid([teacher,t]));if(second){chosen=[teacher,second];break;}}}
  if(chosen.length!==count){reasons.push(`${subject.name} for Section ${section.number}: no faculty allocation fits available weekly capacity. Override assignments or free unavailable periods.`);continue;}
  subject.teachers=subject.name==='IRS/MPMC'?[...chosen,'Mrs. M. Hemalata']:chosen;
  for(const teacher of subject.teachers)add(teacher,subject.hours);
 }
 return {input,reasons};
}
