export const inCampusApp=()=>Boolean(globalThis.window?.ReactNativeWebView?.postMessage);
export function openNativeAttendance(){
 if(!inCampusApp())return false;
 window.ReactNativeWebView.postMessage(JSON.stringify({type:'open-attendance'}));
 return true;
}
