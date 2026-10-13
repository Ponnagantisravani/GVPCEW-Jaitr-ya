import {portalAddress,portalBootstrap,portalNavigationAllowed,studentRole} from '../src/portal';
import type {Session} from '../src/types';
import {API_BASE_URL,PORTAL_BASE_URL} from '../src/config';
const session:Session={apiBase:'https://campus.example/api',token:'existing-token',user:{id:'u',email:'student@example.invalid',fullName:'Student',role:'student',roles:['student','student_coordinator','faculty']}};
test('login storage is established before dashboard navigation and names cannot inject scripts',()=>{
 const special={...session,user:{...session.user,fullName:'</script><script>bad()</script>'}};
 const html=portalBootstrap(special,'student_coordinator');
 expect(html.match(/<script>/g)).toHaveLength(1);
 const events:string[]=[];
 let stored:any;
 const execute=new Function('localStorage','window','location',html.split('<script>')[1].split('</script>')[0]);
 execute(
  {setItem:(key:string,value:string)=>{expect(key).toBe('gvpcew_session');stored=JSON.parse(value);events.push('saved');}},
  {ReactNativeWebView:{postMessage:(value:string)=>{expect(JSON.parse(value).type).toBe('portal-ready');events.push('ready');}}},
  {replace:(url:string)=>{expect(url).toBe('https://campus.example/student-coordinator.html');events.push('navigate');}},
 );
 expect(events).toEqual(['saved','ready','navigate']);
 expect(stored.token).toBe(session.token);
 expect(stored.activeRole).toBe('student_coordinator');
 expect(stored.user.fullName).toBe(special.user.fullName);
 expect(()=>portalBootstrap(session,'admin')).toThrow('not assigned');
});
test('separate Render deployments open frontend dashboards and retain backend API transport',()=>{
 const deployed={...session,apiBase:API_BASE_URL};
 expect(portalAddress(deployed,'student_coordinator')).toBe(PORTAL_BASE_URL+'/student-coordinator.html');
 expect(portalNavigationAllowed(deployed,PORTAL_BASE_URL+'/student.html')).toBe(true);
 expect(portalNavigationAllowed(deployed,API_BASE_URL.replace('/api','')+'/student.html')).toBe(false);
 expect(deployed.apiBase).toBe(API_BASE_URL);
});
test('assigned dashboards share campus login; unassigned roles are refused',()=>{
 expect(portalAddress(session,'student')).toBe('https://campus.example/student.html');
 expect(portalAddress(session,'student_coordinator')).toBe('https://campus.example/student-coordinator.html');
 expect(portalAddress(session,'faculty')).toBe('https://campus.example/faculty.html');
 expect(()=>portalAddress(session,'admin')).toThrow('not assigned');
});
test('portal navigation stays on the authenticated campus HTTPS origin',()=>{
 expect(portalNavigationAllowed(session,'https://campus.example/students')).toBe(true);
 for(const url of ['https://different.example/student.html','http://campus.example/student.html','javascript:alert(1)','file:///student.html'])expect(portalNavigationAllowed(session,url)).toBe(false);
 expect(()=>portalAddress({...session,apiBase:'http://campus.example/api'},'student')).toThrow('HTTPS');
 expect(studentRole('faculty')).toBe(false);expect(studentRole('student_coordinator')).toBe(true);
});
