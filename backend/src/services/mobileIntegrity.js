import crypto from 'node:crypto';
let cached, refreshing;
const unavailable=()=>Object.assign(new Error('Play Integrity verification is unavailable.'),{status:503});
export function integrityProjectNumber(){const p=process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;if(!/^[1-9][0-9]{5,17}$/.test(p||''))throw unavailable();return p;}
export function integrityReady(){
 try { integrityProjectNumber();const c=JSON.parse(process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON||'null');
  return Boolean(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(process.env.PLAY_INTEGRITY_PACKAGE_NAME||'')&&process.env.PLAY_INTEGRITY_CERT_SHA256&&c?.client_email&&c?.private_key&&crypto.createPrivateKey(c.private_key).asymmetricKeyType==='rsa');
 }catch{return false;}
}
async function loadAccessToken(){
 if(cached&&cached.until>Date.now()+30000)return cached.token;
 const c=JSON.parse(process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON),now=Math.floor(Date.now()/1000);
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/playintegrity',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),c.private_key).toString('base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw unavailable();const data=await r.json();if(!data.access_token)throw unavailable();
 cached={token:data.access_token,until:Date.now()+Number(data.expires_in)*1000};return cached.token;
}
async function accessToken(){
 if(cached&&cached.until>Date.now()+30000)return cached.token;
 if(!refreshing)refreshing=loadAccessToken().finally(()=>{refreshing=undefined;});
 return refreshing;
}
export function validIntegrity(payload,hash,now=Date.now()){
 const p=process.env.PLAY_INTEGRITY_PACKAGE_NAME,certs=(process.env.PLAY_INTEGRITY_CERT_SHA256||'').split(',').map(c=>{const value=c.trim(),hex=value.replace(/:/g,'');return /^[a-fA-F0-9]{64}$/.test(hex)?Buffer.from(hex,'hex').toString('base64url'):value;}).filter(Boolean);
 if(!p||!payload||typeof payload!=='object'||typeof hash!=='string')return false;
 const d=payload?.requestDetails,a=payload?.appIntegrity,t=Number(d?.timestampMillis);
 return Boolean(d?.requestPackageName===p&&d.requestHash===hash&&Number.isFinite(t)&&t<=now+5000&&t>=now-30000&&a?.packageName===p&&a.appRecognitionVerdict==='PLAY_RECOGNIZED'&&Array.isArray(a.certificateSha256Digest)&&a.certificateSha256Digest.some(c=>certs.includes(c))&&Array.isArray(payload.deviceIntegrity?.deviceRecognitionVerdict)&&payload.deviceIntegrity.deviceRecognitionVerdict.includes('MEETS_DEVICE_INTEGRITY'));
}
export async function verifyIntegrity(token,hash){
 if(!integrityReady())throw unavailable();
 try{
 const packageName=process.env.PLAY_INTEGRITY_PACKAGE_NAME;
 const r=await fetch('https://playintegrity.googleapis.com/v1/'+encodeURIComponent(packageName)+':decodeIntegrityToken',{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},body:JSON.stringify({integrity_token:token}),signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw unavailable();const data=await r.json();return validIntegrity(data.tokenPayloadExternal,hash);
 }catch(e){if(e.status)throw e;throw unavailable();}
}
