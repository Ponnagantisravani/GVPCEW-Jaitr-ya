let pending=null;const listeners=new Set();
const account=()=>{try{return JSON.parse(localStorage.getItem('gvpcew_session')||'null')?.user?.id||null;}catch{return null;}};
export function requestFaceEntry(sessionId){pending={sessionId,account:account()};for(const fn of listeners)fn(sessionId);}
export function listenFaceEntry(fn){listeners.add(fn);if(pending?.account===account())fn(pending.sessionId);else pending=null;return()=>listeners.delete(fn);}
export function consumeFaceEntry(sessionId){if(pending?.sessionId===sessionId)pending=null;}
