import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('model-manifest.json',root),'utf8')),bytes=await readFile(new URL(manifest.file,root));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256,'Bundled model checksum mismatch');
assert.equal(bytes.toString('ascii',4,8),'TFL3');
function field(t,i){const vt=t-bytes.readInt32LE(t),n=bytes.readUInt16LE(vt);if(4+i*2>=n)return 0;const offset=bytes.readUInt16LE(vt+4+i*2);return offset?t+offset:0;}
function vector(loc){const p=loc+bytes.readUInt32LE(loc);return {p:p+4,n:bytes.readUInt32LE(p)};}
function table(loc){return loc+bytes.readUInt32LE(loc);}
const model=bytes.readUInt32LE(0),groups=vector(field(model,2)),group=table(groups.p),tensors=vector(field(group,0));
function tensor(kind){const v=vector(field(group,kind)),i=bytes.readInt32LE(v.p),t=table(tensors.p+i*4),s=vector(field(t,0)),type=field(t,1);return {shape:Array.from({length:s.n},(_,j)=>bytes.readInt32LE(s.p+j*4)),type:type?bytes.readUInt8(type):0};}
assert.deepEqual(tensor(1),{shape:[1,112,112,3],type:0});assert.deepEqual(tensor(2),{shape:[1,192],type:0});
const native=await readFile(new URL('android/app/src/main/java/com/gvpcew/attendance/MobileFaceNet.kt',root),'utf8');
const client=await readFile(new URL('src/enrollmentPolicy.ts',root),'utf8');
assert(native.includes(manifest.sha256)&&client.includes(manifest.sha256),'Native/client model pins disagree');
console.log('MobileFaceNet checksum and FLOAT32 112×112×3 → 192 tensor contract verified.');
