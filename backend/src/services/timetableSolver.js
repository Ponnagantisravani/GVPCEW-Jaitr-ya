import { validateBatch, isValue, DAYS } from '../../../shared/timetableConfiguration.js';

export function checkInput(input) {
  const reasons = [];
  if (!Array.isArray(input?.sections) || !input.sections.length || input.sections.length > 12) return ['Enter between 1 and 12 sections.'];
  if(input.batch==='III CSE') reasons.push(...validateBatch(input));
  for(const field of ['unavailable','roomUnavailable']) {
    if(input[field] && (typeof input[field]!=='object'||Array.isArray(input[field])))return [`${field} must map names to unavailable slots.`];
    for(const [name,slots] of Object.entries(input[field]||{}))if(!Array.isArray(slots)||slots.some(s=>typeof s!=='string'||!/^[0-5]:[1-7]$/.test(s))||new Set(slots).size!==slots.length)reasons.push(`${name}: unavailable slots must be distinct day:period entries, days 0–5 and periods 1–7.`);
  }
  if(reasons.length)return reasons;
  const names = new Set(), loads = new Map(), rooms = new Map();
  for (const section of input.sections) {
    if(!section||!Array.isArray(section.subjects))return ['Every section requires a subjects array.'];
    if (!section.name || names.has(section.name)) reasons.push('Every section needs a unique name.');
    names.add(section.name);
    if (!isValue(section.room)) reasons.push(`${section.name}: enter a home classroom.`);
    if (!section.subjects?.length) { reasons.push(`${section.name}: add subjects.`); continue; }
    let total = 0, p6 = 0;
    const subjects = new Set();
    for (const subject of section.subjects) {
      if(!subject||typeof subject.name!=='string'||!Array.isArray(subject.teachers)||subject.teachers.some(t=>!isValue(t)))return [`${section.name}: invalid subject or teacher list.`];
      if (!subject.name || subjects.has(subject.name)) reasons.push(`${section.name}: subject names must be unique.`);
      subjects.add(subject.name);
      if (!Number.isInteger(subject.hours) || subject.hours < 0 || subject.hours > 36) reasons.push(`${section.name}/${subject.name}: hours must be a whole number from 0 to 36.`);
      total += subject.hours;
      if (!subject.teachers?.length || subject.teachers.some(t => typeof t !== 'string' || !t.trim()) || new Set(subject.teachers).size !== subject.teachers?.length) reasons.push(`${section.name}/${subject.name}: enter distinct teacher names.`);
      if (subject.kind === 'lab' && (subject.hours % 3 || !subject.rooms?.length)) reasons.push(`${section.name}/${subject.name}: labs require rooms and hours in multiples of 3.`);
      if(!['lab','theory'].includes(subject.kind))reasons.push(`${subject.name}: kind must be theory or lab.`);
      if(subject.kind==='lab'&&(!Array.isArray(subject.rooms)||subject.rooms.some(r=>!isValue(r))||new Set(subject.rooms).size!==subject.rooms.length))return [`${subject.name}: enter distinct valid lab rooms.`];
      if (['COUNSELLING','TERMPROJECT'].includes(subject.name.toUpperCase())) p6 += subject.hours;
      for (const teacher of subject.teachers || []) loads.set(teacher, (loads.get(teacher) || 0) + subject.hours);
      for (const room of subject.kind === 'lab' ? subject.rooms || [] : [section.room]) rooms.set(room, (rooms.get(room) || 0) + subject.hours);
    }
    if (total > 36) reasons.push(`${section.name}: ${total} hours exceed 36 available periods. Reduce subject hours.`);
    if (p6 > 6) reasons.push(`${section.name}: counselling and term project exceed the six P6 slots.`);
    const labBlocks=section.subjects.filter(s=>s.kind==='lab').reduce((n,s)=>n+s.hours/3,0);
    if(labBlocks>12-p6)reasons.push(`${section.name}: lab blocks cannot fit alongside the required P6 subjects.`);
    for(const subject of section.subjects.filter(s=>s.kind==='lab')){
      let windows=0;
      for(let d=0;d<6;d++)for(const p of [1,4])if([0,1,2].every(offset=>subject.teachers.every(t=>!input.unavailable?.[t]?.includes(`${d}:${p+offset}`))&&subject.rooms.every(r=>!input.roomUnavailable?.[r]?.includes(`${d}:${p+offset}`))))windows++;
      if(windows<subject.hours/3)reasons.push(`${subject.name} for ${section.name}: only ${windows} valid three-period windows for ${subject.rooms.join(' + ')} and its teachers. Free a room or teacher window or override the assignment.`);
    }
  }
  for (const [teacher, hours] of loads) {
    const blocked = new Set((input.unavailable?.[teacher] || []).filter(s => /^[0-5]:[1-6]$/.test(s)));
    const capacity = Array.from({length:6}, (_,d) => Math.min(input.honours&&!Array.isArray(input.honours)&&input.honours.teachers[input.honours.days[d]]===teacher?4:5, 6 - [...blocked].filter(s => s.startsWith(`${d}:`)).length)).reduce((a,b)=>a+b,0);
    if (hours > capacity) reasons.push(`${teacher}: ${hours} hours exceed ${capacity} available periods. Reassign classes or change unavailable slots.`);
  }
  for (const [room,hours] of rooms) {const capacity=36-(input.roomUnavailable?.[room]||[]).filter(s=>!s.endsWith(':7')).length;if (hours > capacity) reasons.push(`${room}: ${hours} hours exceed ${capacity} room periods. Assign another room.`);}
  if(input.honours&&typeof input.honours==='object'&&!Array.isArray(input.honours))for(let d=0;d<6;d++){
    const teacher=input.honours.teachers[input.honours.days[d]];
    if(input.unavailable?.[teacher]?.includes(`${d}:7`))reasons.push(`${teacher} is unavailable for combined honours on ${DAYS[d]} P7.`);
    for(const room of input.honours.rooms||[])if(input.roomUnavailable?.[room]?.includes(`${d}:7`))reasons.push(`${room} is unavailable for honours on ${DAYS[d]} P7.`);
  }
  return reasons;
}

function tasksFor(input) {
  return input.sections.flatMap(section => section.subjects.flatMap(subject => Array.from({length:subject.hours/(subject.kind==='lab'?3:1)},()=>({section:section.name, subject:subject.name, teachers:subject.teachers, rooms:subject.kind==='lab'?subject.rooms:[section.room], kind:subject.kind==='lab'?'lab':'theory', span_len:subject.kind==='lab'?3:1}))));
}

function legal(task, day, period, placed, input) {
  if (day<0 || day>5 || period<1 || period+task.span_len-1>6) return false;
  if (task.kind==='lab' && ![1,4].includes(period)) return false;
  if (['COUNSELLING','TERMPROJECT'].includes(task.subject.toUpperCase()) && period!==6) return false;
  const sameDay=placed.filter(x=>x.day===day);
  if (task.kind!=='lab' && sameDay.filter(x=>x.section===task.section && x.subject===task.subject).length>=2) return false;
  for(const teacher of task.teachers) {
    const honours=input.honours&&!Array.isArray(input.honours)&&input.honours.teachers[input.honours.days[day]]===teacher?1:0;
    if (sameDay.filter(x=>x.teachers.includes(teacher)).reduce((n,x)=>n+x.span_len,0)+task.span_len+honours>5) return false;
    for(let p=period;p<period+task.span_len;p++) if(input.unavailable?.[teacher]?.includes(`${day}:${p}`)) return false;
  }
  for(const room of task.rooms)for(let p=period;p<period+task.span_len;p++)if(input.roomUnavailable?.[room]?.includes(`${day}:${p}`))return false;
  return !sameDay.some(x=>period<x.period+x.span_len && x.period<period+task.span_len && (x.section===task.section || x.teachers.some(t=>task.teachers.includes(t)) || x.rooms.some(r=>task.rooms.includes(r))));
}

export function verifyTimetable(input, slots) {
  const reasons=checkInput(input);
  if(reasons.length) return reasons;
  if (!Array.isArray(slots)) return [...reasons,'Timetable slots must be an array.'];
  const remaining=tasksFor(input), placed=[];
  for(const slot of slots) {
    if(!slot||!Array.isArray(slot.teachers)||!Array.isArray(slot.rooms)){reasons.push('Invalid timetable slot.');continue;}
    const index=remaining.findIndex(t=>t.section===slot.section && t.subject===slot.subject && t.kind===slot.kind && t.span_len===slot.span_len && JSON.stringify(t.teachers)===JSON.stringify(slot.teachers) && JSON.stringify(t.rooms)===JSON.stringify(slot.rooms));
    if(index<0) { reasons.push('Unexpected or modified subject assignment. Generate again after changing inputs.'); continue; }
    const task=remaining.splice(index,1)[0];
    if(!Number.isInteger(slot.day)||!Number.isInteger(slot.period)||!legal(task,slot.day,slot.period,placed,input)) {
      const conflict=placed.find(x=>x.day===slot.day&&slot.period<x.period+x.span_len&&x.period<slot.period+slot.span_len&&(x.section===slot.section||x.teachers.some(t=>slot.teachers.includes(t))||x.rooms.some(r=>slot.rooms.includes(r))));
      const teacher=conflict?.teachers.find(t=>slot.teachers.includes(t)),room=conflict?.rooms.find(r=>slot.rooms.includes(r));
      reasons.push(conflict?`${teacher||room||slot.section} is already occupied by ${conflict.section} ${conflict.subject} on ${DAYS[slot.day]} P${Math.max(slot.period,conflict.period)}.`:`${slot.section}/${slot.subject} on ${DAYS[slot.day]||'invalid day'} P${slot.period}: violates lab duration, P6 restriction, daily limit or unavailable periods.`);
    }
    placed.push(slot);
  }
  if(remaining.length) reasons.push('Some required subject hours are missing.');
  return reasons;
}

export function generateTimetable(input, settings={}) {
  const reasons=checkInput(input);
  if(reasons.length) return {reasons};
  const deadline=Date.now()+Math.min(60000,Math.max(100,settings.timeoutMs||20000));
  const nodeLimit=Math.min(1000000,Math.max(1,settings.nodeLimit||50000));
  let seed=(settings.seed??Date.now())>>>0;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  for(let restart=0;restart<32 && Date.now()<deadline;restart++) {
    let nodes=0; const placed=[];
    function search(tasks) {
      if(!tasks.length) return true;
      if(++nodes>nodeLimit || Date.now()>deadline) return false;
      let chosen=0, options=null;
      const seen=new Set();
      for(let i=0;i<tasks.length;i++) {
        const t=tasks[i], key=`${t.section}/${t.subject}`;
        if(seen.has(key)) continue; seen.add(key);
        const possible=[];
        for(let d=0;d<6;d++) for(const p of t.kind==='lab'?[1,4]:[1,2,3,4,5,6]) if(legal(t,d,p,placed,input)) {
          const daily=placed.filter(x=>x.day===d);
          const cost=daily.filter(x=>x.section===t.section&&x.subject===t.subject).length*10+daily.filter(x=>x.section===t.section).length+daily.filter(x=>x.teachers.some(teacher=>t.teachers.includes(teacher))).reduce((n,x)=>n+x.span_len,0)+(p>3&&t.kind!=='lab'?1:0)+random();
          possible.push({day:d,period:p,cost});
        }
        if(!possible.length) return false;
        if(!options || possible.length<options.length) {chosen=i;options=possible;}
      }
      const task=tasks[chosen], rest=tasks.filter((_,i)=>i!==chosen);
      for(const option of options.sort((a,b)=>a.cost-b.cost)) { placed.push({...task,day:option.day,period:option.period}); if(search(rest)) return true; placed.pop(); }
      return false;
    }
    if(search(tasksFor(input))) return {slots:placed,reasons:verifyTimetable(input,placed)};
  }
  return {reasons:['No timetable found within the search limit. Try again, reassign shared teachers or rooms, or reduce unavailable slots. This does not prove the inputs are impossible.']};
}
