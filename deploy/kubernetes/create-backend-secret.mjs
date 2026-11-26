import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const {parse}=require('../../backend/node_modules/dotenv');
const [sourcePath,outputPath]=process.argv.slice(2);
if(!sourcePath||!outputPath)throw new Error('Provide the backend environment file and temporary Secret manifest path.');
const values=parse(await readFile(sourcePath));
for(const key of ['DATABASE_URL','JWT_SECRET','ENROLLMENT_API_KEY','DATASET_ADMIN_API_KEY']){
 if(!values[key])throw new Error(`Required environment setting ${key} is missing from backend/.env.`);
}
const jwt=values.JWT_SECRET;
if(jwt.length<32||/change_me|replace-with|your.*secret/i.test(jwt))throw new Error('JWT_SECRET must be a unique secret of at least 32 characters.');
const databaseUrl=new URL(values.DATABASE_URL);
if(['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname.toLowerCase())){
 databaseUrl.hostname='host.docker.internal';
 values.DATABASE_URL=databaseUrl.href;
}
const runtimeKeys=new Set(['NODE_ENV','PORT','DATABASE_SSL_MODE','TRUST_PROXY','ALLOWED_ORIGINS']);
const data=Object.fromEntries(Object.entries(values).filter(([key,value])=>!runtimeKeys.has(key)&&value!==''));
const encoded=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,Buffer.from(value,'utf8').toString('base64')]));
const manifest={apiVersion:'v1',kind:'Secret',metadata:{name:'gvpcew-backend-secrets',namespace:'gvpcew-campus'},type:'Opaque',data:encoded};
await writeFile(resolve(outputPath),JSON.stringify(manifest,null,2),{encoding:'utf8',mode:0o600});
console.log('Prepared the backend Kubernetes Secret without displaying secret values.');
