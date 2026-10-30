import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {ApiError, getEnrollmentStatus, logout, submitEnrollment, unregisterFcm, resetOwnEnrollment} from './src/api';
import AttendanceHome from './src/AttendanceHome';
import NativePortal from './src/NativePortal';
import NativeLoginPortal from './src/NativeLoginPortal';
import {studentRole, attendanceRole} from './src/attendanceAccess';
import {portalRoles} from './src/portal';
import {API_BASE_URL} from './src/config';
import {enrollmentScreen} from './src/enrollmentPolicy';
import {captureEnrollment, secureStorage, campusPush} from './src/native';
import {checkPermissions, requestPermissionsOnce} from './src/permissions';
import type {EnrollmentCapture, EnrollmentStatus, PermissionState, Session} from './src/types';

function Action({title, onPress, disabled=false, secondary=false}: {title: string; onPress: () => void; disabled?: boolean; secondary?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>;
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.';

export default function App() {
  const [booting,setBooting]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [session,setSession]=useState<Session|null>(null),[status,setStatus]=useState<EnrollmentStatus|null>(null),[deviceId,setDeviceId]=useState('');
  const [apiBase,setApiBase]=useState(API_BASE_URL);
  const [consent,setConsent]=useState(false);
  const [portalOpen,setPortalOpen]=useState(false);
  const [portalRole,setPortalRole]=useState<string|null>(null);
  const [attendanceStartRequest,setAttendanceStartRequest]=useState(0),[attendanceStartDuration,setAttendanceStartDuration]=useState(60),[attendanceStartSelection,setAttendanceStartSelection]=useState<{subjectId:string;period:number}|null>(null);
  const [permissions,setPermissions]=useState<PermissionState|null>(null);
  const sessionRef=useRef<Session|null>(null),captureRef=useRef<EnrollmentCapture|null>(null),version=useRef(0);
  const releaseCapture=useCallback(()=>{captureRef.current?.embedding.fill(0);captureRef.current=null;},[]);
  const clearIdentity=useCallback(async()=>{version.current++;sessionRef.current=null;setSession(null);setStatus(null);releaseCapture();setConsent(false);setPortalOpen(false);setPortalRole(null);await secureStorage.clear();await campusPush.clear();},[releaseCapture]);
  const refresh=useCallback(async(s: Session, lock=false)=>{
    if(!s.user.roles.some(studentRole))return;
    const requestVersion=version.current;
    if(lock)setStatus(null);
    try {
      const latest=await getEnrollmentStatus(s);
      if(version.current===requestVersion && sessionRef.current?.user.id===s.user.id) {setStatus(latest);setError('');}
    } catch(e) {
      if(version.current!==requestVersion)return;
      if(e instanceof ApiError && e.status===401) {await clearIdentity();setError('Your session expired. Sign in again.');}
      else setError(message(e));
    }
  },[clearIdentity]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      try {
        const id=await secureStorage.deviceId();if(!active)return;setDeviceId(id);
        const restored=await secureStorage.session();if(!active)return;
        if(restored) {sessionRef.current=restored;setSession(restored);setApiBase(restored.apiBase);await refresh(restored,true);}
        setPermissions(await checkPermissions());
      } catch(e) {if(active)setError(message(e));}
      finally {if(active)setBooting(false);}
    })();
    const subscription=AppState.addEventListener('change',next=>{
      if(next==='active') {void checkPermissions().then(setPermissions).catch(e=>setError(message(e)));if(sessionRef.current)void refresh(sessionRef.current);}
      else releaseCapture();
    });
    return ()=>{active=false;subscription.remove();captureRef.current?.embedding.fill(0);};
  },[refresh,releaseCapture]);
  useEffect(()=>{
    if(!session)return;
    const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh(session);},15000);
    return ()=>clearInterval(timer);
  },[session,refresh]);

  useEffect(()=>{
    if(status && status.face_enrolled) {
      setConsent(false);releaseCapture();
    }
  },[status,releaseCapture]);
  async function acceptPortalLogin(signed:Session) {
    if(!deviceId) {setError('Secure device identity is unavailable. Restart the app.');return;}
    if(!signed.user?.roles?.some(role=>role in portalRoles)) {setError('No campus dashboard has been assigned to this account.');return;}
    if(signed.activeRole&&!signed.user.roles.includes(signed.activeRole))signed.activeRole=undefined;
    signed.apiBase=signed.apiBase||apiBase;
    setBusy(true);setError('');
    try {
      version.current++;await secureStorage.save(signed);sessionRef.current=signed;setSession(signed);setApiBase(signed.apiBase);
      if(signed.user.roles.some(studentRole))await refresh(signed,true);
      else {const role=signed.activeRole||signed.user.roles.find(item=>item in portalRoles)||'';setPortalRole(role);setPortalOpen(true);}
    } catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  async function signOut() {
    setBusy(true);setError('');
    try {if(session){try{await unregisterFcm(session,deviceId);}finally{await logout(session);}}}catch { /* Local sign-out still succeeds when offline. */ }
    try {await clearIdentity();}catch(e){setError(message(e));}finally{setBusy(false);}
  }
  function confirmEnrollmentReset(){
    if(busy||!session||!status||!session.user.roles.includes('admin'))return;
    Alert.alert('Reset face registration?','This removes your saved face template and phone binding. You must register your face again on this phone. Existing attendance records are kept.',[
      {text:'Cancel',style:'cancel'},
      {text:'Reset registration',style:'destructive',onPress:()=>{void (async()=>{setBusy(true);setError('');try{await resetOwnEnrollment(session,status.student_id);setConsent(false);releaseCapture();await refresh(session,true);}catch(e){setError(message(e));}finally{setBusy(false);}})();}},
    ]);
  }
  async function captureFace() {
    if(!consent) {setError('Read and accept the face attendance consent before registration.');return;}
    setBusy(true);setError('');releaseCapture();
    try {
      const access=await requestPermissionsOnce();setPermissions(access);
      if(access.missing.length)throw new Error('Enable '+access.missing.join(', ')+' in app settings, then return.');
      const captured=await captureEnrollment();captureRef.current=captured;
      if(!sessionRef.current)throw new Error('Sign in again before saving enrollment.');
      await submitEnrollment(sessionRef.current,captured,deviceId);
      await refresh(sessionRef.current,true);
    } catch(e) {if(sessionRef.current)await refresh(sessionRef.current,true);setError(message(e));}finally{releaseCapture();setBusy(false);}
  }
  const expireAttendance=useCallback(()=>{void clearIdentity().then(()=>setError('Your session expired. Sign in again.')).catch(e=>setError(message(e)));},[clearIdentity]);
  const screen=status ? enrollmentScreen(status,deviceId) : null;
  const dashboardRole=(session?.activeRole&&session.user.roles.includes(session.activeRole)?session.activeRole:null)||session?.user.roles.find(role=>role==='student_coordinator')||session?.user.roles.find(role=>role==='student')||session?.user.roles.find(role=>role in portalRoles)||null;
  const dashboardRoles=session?.user.roles.filter(role=>role in portalRoles)||[];
  useEffect(()=>{if(!session||!dashboardRole)return;if(!session.user.roles.some(studentRole)||screen==='ready'){setPortalRole(role=>role&&session.user.roles.includes(role)?role:dashboardRole);setPortalOpen(true);}},[session?.user.id,screen,dashboardRole]);
  const permissionNotice=permissions&&!permissions.notificationsAllowed ? <Text style={styles.notice}>Notifications are disabled. Enable them in app settings to receive attendance alerts.</Text> : null;
  return <SafeAreaProvider><SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#f3f6fc" /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><View style={styles.content}>
    <View style={styles.brand}><Text style={styles.brandMark}>G</Text><View><Text style={styles.brandTitle}>GVPCEW</Text><Text style={styles.subtitle}>Smart campus attendance</Text></View></View>
    {booting ? <View style={styles.card}><ActivityIndicator color="#185adb" /><Text style={styles.body}>Opening the campus portal…</Text></View> : !session ? <NativeLoginPortal apiBase={apiBase} onLogin={signed=>void acceptPortalLogin(signed)} /> : <>
      <View style={styles.account}><Text style={styles.accountName}>{session.user.fullName}</Text><Text style={styles.subtitle}>{session.user.email}</Text><Text style={styles.heading}>{session.user.roles.some(studentRole)?(attendanceRole(session.user.roles)==='student_coordinator'?'Student coordinator attendance':'Student attendance'):(portalRoles[dashboardRole||'']?.label||'Campus dashboard')}</Text></View>
      {dashboardRole&&(!session.user.roles.some(studentRole)||screen==='ready')&&(dashboardRoles.length>1?dashboardRoles.map(role=><Action key={role} title={'Open '+portalRoles[role].label} secondary onPress={()=>{setPortalRole(role);setPortalOpen(true);}} />):<Action title="Open full campus dashboard" secondary onPress={()=>{setPortalRole(dashboardRole);setPortalOpen(true);}} />)}
      {!session.user.roles.some(studentRole) ? <View style={styles.card}><Text style={styles.title}>Your campus dashboard is ready</Text><Text style={styles.body}>Open the dashboard to access the modules and tools assigned to your account.</Text></View> : !status ? <View style={styles.card}><Text style={styles.title}>Checking enrollment</Text><Text style={styles.body}>Connect to the campus server to continue.</Text><Action title="Retry" disabled={busy} onPress={()=>void refresh(session,true)} /></View> : screen==='setup' ? <View style={styles.card}>
        <Text style={styles.eyebrow}>ONE-TIME SETUP</Text><Text style={styles.title}>Register your face</Text><Text style={styles.body}>Register your face once on this phone. Look forward, slightly left, then slightly right. Your registration saves automatically.</Text>
        <View style={styles.consent}><Text style={styles.heading}>Your face data and privacy</Text><Text style={styles.body}>Your numeric face template is used to verify your own attendance. Camera frames are processed on this phone. Only the averaged numeric template is sent to the campus server.</Text><Text style={styles.body}>Your template stays until an administrator resets enrollment or removes your account. This account is bound to this phone; only an administrator can reset it.</Text><Text style={styles.body}>Camera, Bluetooth, location permission for Bluetooth proximity, and notification access support attendance. The app does not collect GPS coordinates. Contact your administrator if you do not consent.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}} onPress={()=>{setConsent(!consent);if(consent)releaseCapture();}} style={styles.checkboxRow}><Text style={[styles.checkbox,consent&&styles.checked]}>{consent?'✓':''}</Text><Text style={styles.checkboxLabel}>I consent to face enrollment and attendance verification.</Text></Pressable>
        </View>
        {permissions && permissions.missing.length>0 && <Text style={styles.notice}>Required access: {permissions.missing.join(', ')}.</Text>}{permissionNotice}
        <Action title={busy?'Capturing and saving…':'Register face'} disabled={busy||!consent} onPress={()=>void captureFace()} />
        <Action title="Open permission settings" secondary disabled={busy} onPress={()=>void Linking.openSettings()} />
      </View> : <View style={styles.card}>
        <Text style={styles.eyebrow}>{screen==='ready'?'FACE REGISTERED':'ENROLLMENT STATUS'}</Text>
        <Text style={styles.title}>{screen==='ready'?'You’re ready':screen==='pending'?'Awaiting approval':screen==='wrong-device'?'Phone verification required':screen==='needs-reset'?'Enrollment needs updating':'Registration needs review'}</Text>
        <Text style={styles.body}>{screen==='ready'?'Your face is registered. You’ll receive an alert when attendance opens.':screen==='pending'?'Your setup is saved. Your administrator needs to review and approve it. You cannot repeat enrollment while it is awaiting review.':screen==='wrong-device'?'This app installation does not match your registered device. Even on the same phone, a signing change can change its device identity. Contact your administrator to check or reset enrollment.':screen==='needs-reset'?'Your existing face enrollment is not ready for mobile attendance. Contact your administrator to reset it, then register your face on this phone.':'Your registration was rejected. Contact your administrator to reset enrollment before capturing again.'}</Text>
        {(screen==='wrong-device'||screen==='needs-reset'||screen==='rejected')&&session.user.roles.includes('admin')&&<Action title="Reset my face registration" secondary disabled={busy} onPress={confirmEnrollmentReset}/>}
        {permissionNotice}<Action title="Refresh status" secondary disabled={busy} onPress={()=>void refresh(session,true)} />
        {permissions && (permissions.missing.length>0||!permissions.notificationsAllowed) && <Action title="Open permission settings" secondary onPress={()=>void Linking.openSettings()} />}
      </View>}
      {session.user.roles.some(studentRole) && screen==='ready' && <AttendanceHome session={session} deviceId={deviceId} notificationsAllowed={permissions?.notificationsAllowed ?? false} onExpired={expireAttendance} startRequest={attendanceStartRequest} startDurationSeconds={attendanceStartDuration} startSelection={attendanceStartSelection} />}
      {portalOpen&&(portalRole||dashboardRole)&&(!session.user.roles.some(studentRole)||screen==='ready')&&<NativePortal session={session} role={portalRole||dashboardRole||''} onClose={()=>{setPortalOpen(false);setPortalRole(null);}} onAttendance={request=>{setPortalOpen(false);setPortalRole(null);if(screen==='ready'&&attendanceRole(session.user.roles)==='student_coordinator'){const seconds=Number(request?.durationSeconds);setAttendanceStartDuration(Number.isInteger(seconds)&&seconds>=30&&seconds<=1800?seconds:60);setAttendanceStartSelection(request?.subjectId&&request.period?{subjectId:request.subjectId,period:request.period}:null);setAttendanceStartRequest(value=>value+1);}else if(attendanceRole(session.user.roles)==='student_coordinator')setError('Complete approved face enrollment before starting attendance.');}} onExpired={expireAttendance}/>}
      <Action title="Sign out" secondary disabled={busy} onPress={()=>void signOut()} />
    </>}
    {!!error && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
    <Text style={styles.footer}>One account. One phone. Your attendance.</Text>
  </View></ScrollView></KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({
  flex:{flex:1},safe:{flex:1,backgroundColor:'#f3f6fc'},scroll:{padding:22,flexGrow:1},content:{width:'100%',maxWidth:520,alignSelf:'center',gap:18},brand:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:16},brandMark:{fontSize:28,fontWeight:'800',color:'#fff',backgroundColor:'#185adb',width:56,height:56,textAlign:'center',textAlignVertical:'center',borderRadius:16},brandTitle:{fontSize:23,fontWeight:'800',color:'#15233c'},subtitle:{fontSize:13,color:'#69758a',marginTop:3},card:{backgroundColor:'#fff',borderRadius:22,padding:24,gap:16,borderWidth:1,borderColor:'#e2e8f3'},eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.4,color:'#185adb'},title:{fontSize:27,fontWeight:'800',color:'#15233c'},heading:{fontSize:17,fontWeight:'700',color:'#15233c'},body:{fontSize:14,lineHeight:22,color:'#57657a'},field:{gap:7},label:{fontSize:13,fontWeight:'600',color:'#34425c'},input:{backgroundColor:'#f8faff',borderWidth:1,borderColor:'#d5dfed',borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:16,color:'#15233c'},button:{paddingVertical:15,paddingHorizontal:16,borderRadius:12,backgroundColor:'#185adb',alignItems:'center'},buttonText:{color:'#fff',fontSize:15,fontWeight:'700'},secondary:{backgroundColor:'#eaf0fb'},secondaryText:{color:'#24549b'},disabled:{opacity:0.45},account:{paddingHorizontal:4},accountName:{fontSize:18,fontWeight:'700',color:'#15233c'},consent:{backgroundColor:'#f4f7fc',padding:16,borderRadius:14,gap:10},checkboxRow:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:10},checkbox:{width:24,height:24,borderRadius:6,borderWidth:1,borderColor:'#a5b4cc',textAlign:'center',textAlignVertical:'center',fontWeight:'700',color:'#fff'},checked:{backgroundColor:'#185adb',borderColor:'#185adb'},checkboxLabel:{flex:1,fontSize:13,lineHeight:20,color:'#34425c'},notice:{backgroundColor:'#fff4d7',padding:12,borderRadius:10,color:'#78510d',fontSize:13,lineHeight:20},captureSummary:{alignItems:'center',gap:10},facePreview:{width:136,height:136,borderRadius:18},error:{padding:14,backgroundColor:'#fce9e9',borderRadius:12},errorText:{color:'#9b2828',fontSize:14,lineHeight:21},footer:{color:'#8a95a7',fontSize:12,textAlign:'center',paddingVertical:12},
});
