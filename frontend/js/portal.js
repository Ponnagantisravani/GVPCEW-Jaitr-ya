import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RoleDashboard } from '../src/RoleDashboards.jsx';
import '../css/admin.css';
import {readSession, rememberAttendanceLink, destinationForRole, preferredRole} from '../src/session.js';
import {api} from '../src/api.js';

export const paths={admin:'/admin.html',faculty:'/faculty.html',academic_coordinator:'/academic-coordinator.html',student:'/student.html',student_coordinator:'/student-coordinator.html'};
export function mountDashboard(expectedRole){
  function Page(){
    const [session,setSession]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
    const roles=session?.user?.roles||session?.roles||[session?.user?.role||session?.role].filter(Boolean);
    const [active,setActive]=useState(expectedRole==='student' && new URLSearchParams(window.location.search).has('attendanceCode') ? 'Mark Attendance' : 'Dashboard');
    useEffect(()=>{
      let alive=true,controller;
      const verify=async()=>{
        controller?.abort();controller=new AbortController();setError('');
        const saved=readSession();
        setSession(previous=>previous?.token===saved?.token?previous:null);
        if(!saved){rememberAttendanceLink();window.location.replace('/index.html');return;}
        try{
          const {data}=await api.get('/auth/me',{signal:controller.signal,headers:{Authorization:'Bearer '+saved.token}});
          if(!alive||readSession()?.token!==saved.token)return;
          const target=preferredRole(data.user,expectedRole);
          if(!target){localStorage.removeItem('gvpcew_session');window.location.replace('/index.html');return;}
          const verified={token:saved.token,user:data.user,activeRole:preferredRole(data.user,saved.activeRole)};
          const encoded=JSON.stringify(verified);
          if(localStorage.getItem('gvpcew_session')!==encoded)localStorage.setItem('gvpcew_session',encoded);
          if(target!==expectedRole){window.location.replace(destinationForRole(target));return;}
          setSession(verified);
        }catch(e){
          if(!alive||e.code==='ERR_CANCELED')return;
          setSession(null);
          if(e.response?.status===401){localStorage.removeItem('gvpcew_session');window.location.replace('/index.html');}
          else setError('Unable to verify dashboard access. Please retry.');
        }
      };
      const changed=e=>{if(e.key==='gvpcew_session')verify();};
      verify();window.addEventListener('storage',changed);window.addEventListener('focus',verify);window.addEventListener('pageshow',verify);
      return()=>{alive=false;controller?.abort();window.removeEventListener('storage',changed);window.removeEventListener('focus',verify);window.removeEventListener('pageshow',verify);};
    },[attempt]);
    if(!session)return React.createElement('main',null,React.createElement('p',{role:error?'alert':'status'},error||'Verifying your dashboard access...'),error&&React.createElement('button',{onClick:()=>setAttempt(v=>v+1)},'Retry'));
    if(!roles.includes(expectedRole)){window.location.replace(paths[roles[0]]||'/index.html');return null;}
    const logout=async()=>{try{await api.post('/auth/logout');localStorage.removeItem('gvpcew_session');window.location.replace('/index.html');}catch(e){if(e.response?.status===401){localStorage.removeItem('gvpcew_session');window.location.replace('/index.html');}else window.alert('Could not revoke your session. Check your connection and try signing out again.');}};
    const changeRole=role=>{if(roles.includes(role)){localStorage.setItem('gvpcew_session',JSON.stringify({...session,activeRole:role}));window.location.assign(destinationForRole(role));}};
    return React.createElement(RoleDashboard,{key:session.user.id,role:expectedRole,name:session.user?.fullName||'GVPCEW User',active,onNavigate:setActive,onLogout:logout,onRoleChange:changeRole,roles});
  }
  createRoot(document.getElementById('root')).render(React.createElement(Page));
}
