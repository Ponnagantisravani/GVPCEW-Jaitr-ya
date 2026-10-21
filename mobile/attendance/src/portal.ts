import type {Session} from './types';
import {API_BASE_URL,PORTAL_BASE_URL} from './config';
export const portalRoles: Record<string,{label:string;path:string}>={
 student:{label:'Student dashboard',path:'/student.html'},
 student_coordinator:{label:'Student coordinator dashboard',path:'/student-coordinator.html'},
 faculty:{label:'Faculty dashboard',path:'/faculty.html'},
 academic_coordinator:{label:'Academic coordinator dashboard',path:'/academic-coordinator.html'},
 admin:{label:'Administrator dashboard',path:'/admin.html'},
};
export const studentRole=(role:string)=>role==='student'||role==='student_coordinator';
export function portalOrigin(session:Pick<Session,'apiBase'>){
 const url=new URL(session.apiBase);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api')throw Error('Use the campus HTTPS server address ending in /api.');
 return session.apiBase===API_BASE_URL ? new URL(PORTAL_BASE_URL).origin : url.origin;
}
export function portalLoginAddress(apiBase:string){
 const url=new URL(apiBase);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api')throw Error('Use the campus HTTPS server address ending in /api.');
 const origin=apiBase===API_BASE_URL?new URL(PORTAL_BASE_URL).origin:url.origin;
 return origin+'/index.html';
}
export function portalAddress(session:Session,role:string){
 if(!session.user.roles.includes(role)||!portalRoles[role])throw Error('This dashboard is not assigned to your account.');
 return portalOrigin(session)+portalRoles[role].path;
}
export function portalNavigationAllowed(session:Pick<Session,'apiBase'>,url:string){
 try{return new URL(url).origin===portalOrigin(session);}catch{return false;}
}
export function portalBootstrap(session:Session,role:string){
 const destination=portalAddress(session,role);
 const saved=encodeURIComponent(JSON.stringify({token:session.token,user:session.user,activeRole:role}));
 // Establish storage on the trusted frontend origin before its module scripts run.
 return '<!doctype html><html><head><meta charset="utf-8"></head><body><script>'+ 
 'localStorage.setItem("gvpcew_session",decodeURIComponent('+JSON.stringify(saved)+'));'+
 'window.ReactNativeWebView.postMessage("{\\"type\\":\\"portal-ready\\"}");'+
 'location.replace('+JSON.stringify(destination)+');</script></body></html>';
}
