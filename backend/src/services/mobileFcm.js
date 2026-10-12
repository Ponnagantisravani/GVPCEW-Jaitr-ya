import crypto from 'node:crypto';
let cached,refreshing;
const unavailable=()=>Object.assign(new Error('Firebase messaging is not configured or unavailable.'),{status:503});
export function fcmReady(){
 try {const c=JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON||'{}');return Boolean(process.env.FCM_PROJECT_ID&&c.project_id===process.env.FCM_PROJECT_ID&&c.client_email&&c.private_key&&crypto.createPrivateKey(c.private_key).asymmetricKeyType==='rsa');}catch{return false;}
}
async function loadToken(){
 if(!fcmReady())throw unavailable();
 const c=JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON),now=Math.floor(Date.now()/1000);
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),c.private_key).toString('base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw unavailable();const data=await r.json();if(!data.access_token)throw unavailable();
 cached={token:data.access_token,until:Date.now()+Number(data.expires_in||3600)*1000,project:process.env.FCM_PROJECT_ID};return cached.token;
}
async function accessToken(){
 if(cached?.project===process.env.FCM_PROJECT_ID&&cached.until>Date.now()+30000)return cached.token;
 if(!refreshing)refreshing=loadToken().finally(()=>{refreshing=undefined;});return refreshing;
}
export function messageFor(row,now=Date.now()){
 const remaining=Math.floor((new Date(row.expires_at).getTime()-now)/1000);
 if(remaining<=0)return null;
 return {token:row.fcm_token,data:{type:'attendance_session',session_id:row.session_id,section_id:row.academic_section_id,user_id:row.user_id,expires_at:new Date(row.expires_at).toISOString(),broadcast:row.broadcast?'true':'false'},android:{priority:'HIGH',ttl:Math.min(1800,remaining)+'s',collapse_key:row.session_id}};
}
export async function sendFcm(message){
 const r=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(process.env.FCM_PROJECT_ID)+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},body:JSON.stringify({message}),signal:AbortSignal.timeout(5000)});
 if(r.ok)return {sent:true};
 const data=await r.json().catch(()=>({}));const code=data.error?.details?.find(d=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
 if(r.status===401)cached=undefined;
 return {sent:false,invalidToken:code==='UNREGISTERED',retry:r.status===429||r.status>=500||r.status===401,error:code||String(r.status)};
}
