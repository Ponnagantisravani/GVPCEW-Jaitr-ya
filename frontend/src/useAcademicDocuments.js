import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export function useAcademicDocuments(kind, templates, editor) {
 const initial=()=>Object.fromEntries(Object.entries(templates).map(([key,value])=>[key,{...structuredClone(value),status:'Draft'}]));
 const [documents,setDocuments]=useState(initial);
 const [audiences,setAudiences]=useState({});
 const setAudience=(key,ids)=>setAudiences(previous=>({...previous,[key]:ids}));
 const [loaded,setLoaded]=useState(false),[available,setAvailable]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [publishedKeys,setPublishedKeys]=useState([]),[savedKeys,setSavedKeys]=useState([]);
 const latest=useRef(documents),dirty=useRef(new Set()),versions=useRef({}),queue=useRef(Promise.resolve()),pending=useRef(0),generation=useRef(0);
 const load=async()=>{
  const request=++generation.current;
  try {
   const {data}=await api.get('/academic-documents/'+kind,{params:{manage:editor}});
   if(request!==generation.current)return;
   const merged={...latest.current};
   for(const row of data.documents)if(!dirty.current.has(row.key))merged[row.key]=row.payload;
   latest.current=merged;setDocuments(merged);
   setAudiences(previous=>({...Object.fromEntries(data.documents.map(row=>[row.key,row.academic_section_ids||[]])),...previous}));
   setSavedKeys(data.documents.map(row=>row.key));
   setPublishedKeys(data.documents.filter(row=>row.published_at).map(row=>row.key));
   setAvailable(true);setError('');
  }catch(e){if(request===generation.current)setError(e.response?.data?.message||'Could not load academic documents. Check the connection and retry.');}
  finally{if(request===generation.current)setLoaded(true);}
 };
 useEffect(()=>{
  load();const focus=()=>{if(!editor)load();};window.addEventListener('focus',focus);
  return()=>{generation.current++;window.removeEventListener('focus',focus);};
 },[kind,editor]);
 const update=next=>{
  const previous=latest.current;
  const result=typeof next==='function'?next(previous):next;
  const updated=Object.fromEntries(Object.entries(result).map(([key,value])=>{
   if(JSON.stringify(value)===JSON.stringify(previous[key]))return [key,value];
   dirty.current.add(key);versions.current[key]=(versions.current[key]||0)+1;
   return [key,{...value,status:'Draft'}];
  }));
  latest.current=updated;setDocuments(updated);
 };
 const save=async(key,publish=false)=>{
  if(!editor||!available)throw new Error('Load the college document before saving.');
  const payload=structuredClone(latest.current[key]),version=versions.current[key]||0;
  pending.current++;setBusy(true);setError('');
  const operation=async()=>{
   try {
    let saved=payload;
    if(publish){
     const {data}=await api.post('/academic-documents/'+kind+'/'+encodeURIComponent(key)+'/publish',{payload,sectionIds:audiences[key]||[]});saved=data.payload;
     setPublishedKeys(previous=>[...new Set([...previous,key])]);
    }else await api.put('/academic-documents/'+kind+'/'+encodeURIComponent(key),{payload,sectionIds:audiences[key]||[]});
    setSavedKeys(previous=>[...new Set([...previous,key])]);
    if((versions.current[key]||0)===version){
     dirty.current.delete(key);
     latest.current={...latest.current,[key]:saved};setDocuments(latest.current);
    }
   }catch(e){setError(e.response?.data?.message||'Could not save. Your changes remain on this screen.');throw e;}
   finally{pending.current--;setBusy(pending.current>0);}
  };
  queue.current=queue.current.catch(()=>{}).then(operation);return queue.current;
 };
 return {audiences,setAudience,documents,setDocuments:update,loaded,available,error,busy,publishedKeys,savedKeys,save,reload:load};
}
