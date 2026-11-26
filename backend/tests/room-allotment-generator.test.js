import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAllotment} from '../src/routes/roomAllotment.js';

function fixture(labs=3){
 const classes=[];for(const [year,branch,count] of [[2,'CSE',4],[2,'CSC',1],[2,'CSM',1],[3,'CSE',4],[4,'CSE',4]])for(let n=1;n<=count;n++)classes.push({id:`y${year}-${branch}-${n}`,year_number:year,code:`${year}${branch}${n}`,department:branch,section_name:`${branch}${n}`,preferredRoomId:null});
 const home={1:[],2:['101','102','104'].map(id=>({id,room_code:id})),3:['115','116','215','216'].map(id=>({id,room_code:id})),4:['201','202','203','214'].map(id=>({id,room_code:id}))};
 classes.forEach((c,i)=>{const yr=home[c.year_number];c.preferredRoomId=yr[i%yr.length]?.id;});
 const rows=classes.map((c,i)=>({section_id:c.id,day_of_week:1,start_time:'09:00',end_time:'10:00',entry_type:i<labs?'lab':'class'}));
 return {cfg:{classes,home,rooms:[...home[2],...home[3],...home[4]],allowBorrow:true},rows};
}

test('generates 14 class assignments with 11 unique rooms when three classes are in labs',()=>{
 const {cfg,rows}=fixture();const cells=makeAllotment(cfg,rows,'2026-09-14');const monday=cells.filter(c=>c.day===1&&c.halfDay==='FN'&&c.classId);
 assert.equal(monday.length,11);assert.equal(new Set(monday.map(c=>c.roomId)).size,11);assert.equal(new Set(monday.map(c=>c.classId)).size,11);
});

test('reports the exact half-day shortfall when rooms are insufficient',()=>{
 const {cfg,rows}=fixture(0);assert.throws(()=>makeAllotment(cfg,rows,'2026-09-14'),/Monday forenoon needs 14 rooms, 11 available/);
});

test('rejects more simultaneous lab classes than configured venues',()=>{
 const {cfg,rows}=fixture(4);cfg.labCount=3;assert.throws(()=>makeAllotment(cfg,rows,'2026-09-14'),/Monday forenoon has 4 lab classes, but only 3 lab venues/);
});
