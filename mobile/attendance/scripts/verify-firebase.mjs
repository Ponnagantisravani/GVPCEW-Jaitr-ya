import {readFile} from 'node:fs/promises';
const file=new URL('../android/app/google-services.json',import.meta.url);
let config;
try {config=JSON.parse(await readFile(file,'utf8'));}catch {throw new Error('Place the campus Android google-services.json in android/app before testing notifications.');}
const client=config.client?.find(c=>c.client_info?.android_client_info?.package_name==='com.gvpcew.attendance');
if(!config.project_info?.project_id||!config.project_info?.project_number||!client?.client_info?.mobilesdk_app_id||!client.api_key?.some(k=>k.current_key))throw new Error('Firebase configuration must include the com.gvpcew.attendance Android app.');
console.log('Firebase Android configuration verified for project '+config.project_info.project_id+'. Use this same project ID in backend FCM_PROJECT_ID.');
