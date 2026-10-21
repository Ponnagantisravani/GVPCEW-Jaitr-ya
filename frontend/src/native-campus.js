export const inCampusApp=()=>Boolean(globalThis.window?.ReactNativeWebView?.postMessage);
export function sendNativePortalLogin(session){if(!inCampusApp())return;window.ReactNativeWebView.postMessage(JSON.stringify({type:'campus-login',session}));}
export function openNativeAttendance({startDefaultAttendance=false,durationSeconds=60}={}){
 if(!inCampusApp())return false;
 window.ReactNativeWebView.postMessage(JSON.stringify({type:'open-attendance',start_default_attendance:startDefaultAttendance,...(startDefaultAttendance?{duration_seconds:durationSeconds}:{})}));
 return true;
}
