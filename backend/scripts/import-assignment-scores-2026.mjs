import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});
const source=JSON.parse(readFileSync(new URL('./assignment-scores-2026-source.json',import.meta.url),'utf8'));
const entries=source.sections.flatMap(section=>section.rows.map(([roll,...scores])=>({roll,section:section.section,subject:section.subject,scores,average:Number((scores.reduce((sum,v)=>sum+(v??0),0)/3).toFixed(2))})));
assert.equal(entries.length,278);
assert.equal(new Set(entries.map(e=>e.roll)).size,278);
for(const section of source.sections) assert.equal(section.rows.length,{'1':69,'2':70,'3':70,'4':69}[section.section]);
for(const e of entries){assert.match(e.roll,/^(32410321\d{4}|325103210L\d{2})$/);assert.equal(e.scores.length,3);assert.ok(e.scores.every(v=>v===null||(Number.isInteger(v)&&v>=0&&v<=10)));}
const csv=['roll_number,screenshot_section,subject,assignment_1,assignment_2,assignment_3,average_out_of_10',...entries.map(e=>[e.roll,e.section,e.subject,...e.scores.map(v=>v??''),e.average.toFixed(2)].join(','))].join('\n')+'\n';
writeFileSync(new URL('./assignment-scores-2026.csv',import.meta.url),csv);
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL),connectionTimeoutMillis:10000,query_timeout:15000});
try{
 await db.connect();
 const rows=(await db.query(`select s.id,s.roll_number,s.section,s.academic_section_id,x.year_number,x.academic_year,u.full_name from students s join users u on u.id=s.user_id left join academic_sections x on x.id=s.academic_section_id where s.roll_number=any($1::text[])`,[entries.map(e=>e.roll)])).rows;
 const byRoll=new Map(rows.map(r=>[r.roll_number,r]));
 const missing=entries.filter(e=>!byRoll.has(e.roll));
 const mismatches=entries.filter(e=>byRoll.has(e.roll)&&byRoll.get(e.roll).section!==e.section);
 const report={sourceRows:entries.length,matched:rows.length,missing:missing.map(e=>({roll:e.roll,section:e.section,subject:e.subject})),sectionMismatches:mismatches.length,matchedByScreenshotSection:Object.fromEntries(source.sections.map(s=>[s.section,s.rows.filter(([roll])=>byRoll.has(roll)).length])),blankCells:entries.reduce((n,e)=>n+e.scores.filter(v=>v===null).length,0)};
 console.log(JSON.stringify(report,null,2));
 writeFileSync(new URL('./assignment-scores-2026-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
}catch(e){console.error(e.code||e.message);process.exitCode=1;}finally{await db.end();}
