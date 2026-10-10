// 17 manufacturer bytes: company LE (FFFF for private testing), GC, v1, 12-byte token.
// Manufacturer AD + flags = 22 bytes. No UUID/name/TxPower AD competes for the 31-byte limit.
export const BLE_COMPANY_ID=0xffff;
export const BLE_ADVERTISER_KEY='47435043-4154-544e-8000-000000000001';
export function tokenBytes(token: string): number[]{
 if(!/^[a-f0-9]{24}$/.test(token))throw new Error('Invalid campus Bluetooth token.');
 return [0x47,0x43,1,...Array.from({length:12},(_,i)=>parseInt(token.slice(i*2,i*2+2),16))];
}
export function decodeManufacturerData(encoded: string|null|undefined): string|null {
 if(!encoded||encoded.length!==24||!/^([A-Za-z0-9+/]{23})=$/.test(encoded))return null;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let accumulator=0,bits=0;const bytes:number[]=[];
 for(const char of encoded){if(char==='=')break;accumulator=(accumulator<<6)|alphabet.indexOf(char);bits+=6;if(bits>=8){bits-=8;bytes.push((accumulator>>bits)&255);}}
 if(bytes.length!==17||bytes[0]!==255||bytes[1]!==255||bytes[2]!==0x47||bytes[3]!==0x43||bytes[4]!==1)return null;
 return bytes.slice(5).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function scanPhase(elapsedMs:number,verified:boolean): 'searching'|'still-searching'|'fallback-offered'|'verified' {
 return verified?'verified':elapsedMs>=20000?'fallback-offered':elapsedMs>=10000?'still-searching':'searching';
}

export function monotonicNow():number {return (globalThis as unknown as {performance:{now:()=>number}}).performance.now();}
