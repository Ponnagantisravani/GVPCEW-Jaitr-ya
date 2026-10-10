import { Router } from '../utils/router.js';
import { pool } from '../config/db.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { z } from 'zod';
import {publicationScope,publicationAudience,assertPublicationOwner,notifyPublication,projectExamPayload} from '../services/publicationAccess.js';
export const academicDocumentsRouter = Router();
academicDocumentsRouter.use(requireAuth);
const editor = req => req.user.roles.some(role=>['admin','academic_coordinator'].includes(role));
const kindSchema=z.enum(['calendar','exams','timetable']);
academicDocumentsRouter.get('/:kind', async(req,res)=>{
 const kind=kindSchema.safeParse(req.params.kind);
 if(!kind.success)return res.status(400).json({message:'Unknown document type.'});
 const manage=req.query.manage==='true'&&editor(req);
 const scope=await publicationScope(req);
 const {rows}=await pool.query(`select key, case when $2 then draft else published end payload, academic_section_ids, published_at, updated_at
 from academic_documents where kind=$1 and ($2 or published is not null) and ($3 or (cardinality(academic_section_ids)>0 and case when $2 then academic_section_ids <@ $4::uuid[] else academic_section_ids && $4::uuid[] end)) order by key`,[kind.data,manage,scope.wide,scope.ids]);
 if(!manage)for(const row of rows){row.payload=projectExamPayload(row.payload,scope.sections.filter(s=>row.academic_section_ids.includes(s.id)));row.academic_section_ids=row.academic_section_ids.filter(id=>scope.ids.includes(id));}
 res.json({documents:rows});
});
const bodySchema=z.object({payload:z.record(z.unknown())});
academicDocumentsRouter.put('/:kind/:key', allowRoles('admin','academic_coordinator'), async(req,res)=>{
 const kind=kindSchema.safeParse(req.params.kind),body=bodySchema.safeParse(req.body);
 if(!kind.success||!body.success||req.params.key.length>100)return res.status(400).json({message:'Invalid academic document.'});
 const client=await pool.connect();
 try{await client.query('begin');
 const ids=await publicationAudience(req,req.body,client);
 await client.query('select pg_advisory_xact_lock(hashtext($1))',[kind.data+':'+req.params.key]);
 await assertPublicationOwner(req,'academic_documents','kind=$1 and key=$2',[kind.data,req.params.key],client);
 await client.query(`insert into academic_documents(kind,key,draft,updated_by,academic_section_ids) values($1,$2,$3,$4,$5)
 on conflict(kind,key) do update set draft=excluded.draft,updated_by=excluded.updated_by,published=case when academic_documents.academic_section_ids=excluded.academic_section_ids then academic_documents.published else null end,published_at=case when academic_documents.academic_section_ids=excluded.academic_section_ids then academic_documents.published_at else null end,academic_section_ids=excluded.academic_section_ids,institution_wide=false,updated_at=now()`,[kind.data,req.params.key,{...body.data.payload,status:'Draft'},req.user.sub,ids]);
 await client.query('commit');}catch(e){await client.query('rollback');throw e;}finally{client.release();}
 res.json({message:'Draft saved.'});
});
academicDocumentsRouter.post('/:kind/:key/publish', allowRoles('admin','academic_coordinator'), async(req,res)=>{
 const kind=kindSchema.safeParse(req.params.kind),body=bodySchema.safeParse(req.body);
 if(!kind.success||!body.success||req.params.key.length>100)return res.status(400).json({message:'Invalid academic document.'});
 const payload={...body.data.payload,status:'Published'};
 if(typeof payload.title!=='string'||!payload.title.trim())return res.status(400).json({message:'A document title is required.'});
 if(kind.data==='calendar'&&(!Array.isArray(payload.semesters)||!payload.semesters.length))return res.status(400).json({message:'Add at least one semester.'});
 if(kind.data==='exams'&&(!Array.isArray(payload.rows)||!payload.rows.length))return res.status(400).json({message:'Add examination dates before publishing.'});
 const client=await pool.connect();
 try{await client.query('begin');
 const ids=await publicationAudience(req,req.body,client);
 await client.query('select pg_advisory_xact_lock(hashtext($1))',[kind.data+':'+req.params.key]);
 await assertPublicationOwner(req,'academic_documents','kind=$1 and key=$2',[kind.data,req.params.key],client);
 await client.query(`insert into academic_documents(kind,key,draft,published,updated_by,published_at,academic_section_ids) values($1,$2,$3,$3,$4,now(),$5)
 on conflict(kind,key) do update set draft=excluded.draft,published=excluded.published,updated_by=excluded.updated_by,academic_section_ids=excluded.academic_section_ids,institution_wide=false,updated_at=now(),published_at=now()`,[kind.data,req.params.key,payload,req.user.sub,ids]);
 await notifyPublication(client,ids,'Academic document published',payload.title,'academic');
 await client.query('commit');res.json({payload});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
