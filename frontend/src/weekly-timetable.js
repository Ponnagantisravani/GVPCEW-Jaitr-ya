export const weekDays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const clock=value=>String(value||'').slice(0,5);
export function sourceEntries(document,section){
 const payload=document?.payload;
 if(!payload?.sourceSection?.entries?.length)return [];
 return payload.sourceSection.entries.map((entry,index)=>({...section,id:`source-${index}`,
  day_of_week:entry.dayOfWeek,start_time:entry.startTime,end_time:entry.endTime,
  subject:entry.rawEntry,code:(entry.alternatives||[]).map(a=>a.subjectLabel).join(' / '),
  faculty:(entry.alternatives||[]).flatMap(a=>a.legendFaculty||[]).join(' / '),
  classroom:entry.room,entry_type:entry.isBreak?'break':entry.entryType}));
}
export function timetablePeriods(rows,referenceRows=[]){
 const boundaries=[...new Set([...rows,...referenceRows].flatMap(row=>[clock(row.start_time),clock(row.end_time)]).filter(Boolean))].sort();
 return boundaries.slice(0,-1).map((start,index)=>({start,end:boundaries[index+1]}));
}
export function dayCells(rows,day,periods){
 const today=rows.filter(row=>Number(row.day_of_week)===day);
 const cells=[];
 for(let i=0;i<periods.length;i++){
  const period=periods[i];
  const entries=today.filter(row=>clock(row.start_time)<period.end&&clock(row.end_time)>period.start);
  let span=1;
  // Merge only while the same records occupy each consecutive interval.
  while(entries.length&&i+span<periods.length){
   const next=periods[i+span];
   const matches=today.filter(row=>clock(row.start_time)<next.end&&clock(row.end_time)>next.start);
   if(matches.length!==entries.length||!matches.every(row=>entries.includes(row)))break;
   span++;
  }
  cells.push({start:period.start,span,entries});i+=span-1;
 }
 return cells;
}
