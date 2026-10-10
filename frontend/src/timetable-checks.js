const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s.]+/g, '');
export function branchKeyForStudent(profile) {
 const department = String(profile?.id_details?.department_code || profile?.department || '').toLowerCase();
 const raw = String(profile?.section || '1').trim().toLowerCase();
 const section = ({a:'1',b:'2',c:'3',d:'4'})[raw] || raw.match(/[1-4]/)?.[0] || '1';
 if (/cyber|csc/.test(department)) return 'csc_sec1';
 if (/artificial|machine|aiml|csm/.test(department)) return 'csm_sec'+(section==='2'?'2':'1');
 if (/electronics|communication|ece/.test(department)) return 'ece_sec'+(section==='2'?'2':'1');
 if (/electrical|eee/.test(department)) return 'eee_sec1';
 if (/information technology|^it$/.test(department)) return 'it_sec1';
 return 'cse_sec'+section;
}
export function periodMinutes(time) {
 const match=String(time||'').match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i);
 if(!match)return null;
 const minutes=(hour,min,ampm)=>{
  hour=Number(hour);min=Number(min);
  if(min>59 || (ampm ? hour<1||hour>12 : hour>23))return NaN;
  return (ampm ? hour%12+(/pm/i.test(ampm)?12:0) : hour)*60+min;
 };
 const start=minutes(match[1],match[2],match[3]),end=minutes(match[4],match[5],match[6]);
 return Number.isFinite(start)&&Number.isFinite(end)&&end>start ? [start,end] : null;
}
export function checkTimetableConflicts(documents) {
 const entries=[],issues=[],conflicts=[];
 for(const [key,doc] of Object.entries(documents)) {
  if(!doc)continue;
  for(const period of doc.periods||[]) {
   if(period.isBreak)continue;
   const range=periodMinutes(period.time);
   if(!range){issues.push((doc.title||key)+': invalid time for '+period.label);continue;}
   for(const day of doc.days||[]) {
    const slot=doc.grid?.[day]?.[period.id];
    if(!slot?.subject?.trim()||slot.type==='break')continue;
    entries.push({key,title:doc.title||key,year:doc.academicYear||'',day:day.toLowerCase(),period:period.label||period.id,time:period.time,start:range[0],end:range[1],
     faculty:String(slot.faculty||'').split('/').map(normalize).filter(Boolean),room:normalize(slot.room||doc.classroom),subject:slot.subject});
   }
  }
 }
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];
  if(a.day!==b.day||a.year!==b.year||a.start>=b.end||b.start>=a.end)continue;
  const reasons=[];
  if(a.key===b.key)reasons.push('Section overlap');
  if(a.faculty.some(f=>b.faculty.includes(f)))reasons.push('Faculty overlap');
  if(a.room&&a.room===b.room)reasons.push('Classroom overlap');
  if(reasons.length)conflicts.push({day:a.day,first:a.title+' · '+a.subject+' · '+a.time,second:b.title+' · '+b.subject+' · '+b.time,reasons:reasons.join(', ')});
 }
 return {sections:Object.keys(documents).length,checked:entries.length,issues,conflicts};
}

export function sanitizeAcademicYear(rawYear) {
  if (
    !rawYear ||
    typeof rawYear !== 'string' ||
    /Academic\s+Session\s+starts/i.test(rawYear) ||
    /w\.?e\.?f/i.test(rawYear) ||
    rawYear.length > 60 ||
    (rawYear.match(/\(AUTONOMOUS\)/gi) || []).length > 1
  ) {
    return 'II B.Tech II Semester (2025–26)';
  }
  return rawYear.trim();
}

export function sanitizeTimetableTitle(rawTitle, branchKey, yearSem, branchName) {
  const cleanYearSem = sanitizeAcademicYear(yearSem || 'II B.Tech II Semester (2025–26)');
  const defaultBranchName = branchName || (branchKey ? branchKey.toUpperCase().replace('_', ' ') : 'Department');

  if (!rawTitle || typeof rawTitle !== 'string') {
    return `${cleanYearSem} — ${defaultBranchName}`;
  }

  // If title contains announcement footnotes, is corrupted, or is excessively long
  if (
    /Academic\s+Session\s+starts/i.test(rawTitle) ||
    /w\.?e\.?f|with\s+effect\s+from|classwork\s+commences/i.test(rawTitle) ||
    rawTitle.length > 120 ||
    (rawTitle.match(/\(AUTONOMOUS\)/gi) || []).length > 1 ||
    rawTitle.includes('\n')
  ) {
    return `${cleanYearSem} — ${defaultBranchName}`;
  }

  return rawTitle.trim();
}

export function sanitizeTimetableRecord(record, branchKey, branchName) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const cleanYear = sanitizeAcademicYear(record.academicYear);
  const cleanTitle = sanitizeTimetableTitle(record.title, branchKey, cleanYear, branchName);

  return {
    ...record,
    id: record.id || branchKey,
    title: cleanTitle,
    academicYear: cleanYear,
    classroom: (record.classroom && !/Academic\s+Session/i.test(record.classroom)) ? record.classroom : 'Room 301',
    incharge: (record.incharge && !/Academic\s+Session/i.test(record.incharge)) ? record.incharge : 'Faculty Incharge',
    status: record.status || 'Published',
    days: (Array.isArray(record.days) && record.days.length > 0 && record.days.every(d => typeof d === 'string' && d.length < 20 && !/Academic\s+Session/i.test(d)))
      ? record.days
      : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    periods: (Array.isArray(record.periods) && record.periods.length > 0 && record.periods.every(p => p && p.id && !/Academic\s+Session/i.test(p.label || '')))
      ? record.periods
      : [
          { id: 'p1', time: '08:40 AM - 09:30 AM', label: 'Period 1', isBreak: false },
          { id: 'p2', time: '09:30 AM - 10:20 AM', label: 'Period 2', isBreak: false },
          { id: 'p3', time: '10:20 AM - 11:10 AM', label: 'Period 3', isBreak: false },
          { id: 'p4', time: '11:10 AM - 12:00 PM', label: 'Period 4', isBreak: false },
          { id: 'lunch', time: '12:00 PM - 12:50 PM', label: 'LUNCH BREAK', isBreak: true },
          { id: 'p5', time: '12:50 PM - 01:40 PM', label: 'Period 5', isBreak: false },
          { id: 'p6', time: '01:40 PM - 02:30 PM', label: 'Period 6', isBreak: false },
          { id: 'p7', time: '02:30 PM - 03:20 PM', label: 'Period 7', isBreak: false }
        ],
    grid: (record.grid && typeof record.grid === 'object') ? record.grid : {}
  };
}
