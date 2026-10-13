import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {ApiError, getEnrollmentStatus, login, logout, submitEnrollment, unregisterFcm} from './src/api';
import AttendanceHome from './src/AttendanceHome';
import NativePortal from './src/NativePortal';
import {portalRoles, studentRole} from './src/portal';
import {API_BASE_URL} from './src/config';
import {enrollmentScreen} from './src/enrollmentPolicy';
import {captureEnrollment, secureStorage, campusPush} from './src/native';
import {checkPermissions, requestPermissionsOnce} from './src/permissions';
import type {EnrollmentCapture, EnrollmentStatus, PermissionState, Session} from './src/types';

function Action({title, onPress, disabled=false, secondary=false}: {title: string; onPress: () => void; disabled?: boolean; secondary?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>;
}
function Field({label, value, onChange, password=false}: {label: string; value: string; onChange: (v: string) => void; password?: boolean}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry={password} autoCapitalize="none" autoCorrect={false} style={styles.input} textContentType={password ? 'password' : 'none'} /></View>;
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.';

export default function App() {
  const [booting,setBooting]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [session,setSession]=useState<Session|null>(null),[status,setStatus]=useState<EnrollmentStatus|null>(null),[deviceId,setDeviceId]=useState('');
  const [apiBase,setApiBase]=useState(API_BASE_URL),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [consent,setConsent]=useState(false);
  const [portalRole,setPortalRole]=useState<string|null>(null);
  const [attendanceOpenRequest,setAttendanceOpenRequest]=useState(0);
  const [permissions,setPermissions]=useState<PermissionState|null>(null);
  const sessionRef=useRef<Session|null>(null),captureRef=useRef<EnrollmentCapture|null>(null),version=useRef(0);
  const releaseCapture=useCallback(()=>{captureRef.current?.embedding.fill(0);captureRef.current=null;},[]);
  const clearIdentity=useCallback(async()=>{version.current++;sessionRef.current=null;setSession(null);setStatus(null);releaseCapture();setConsent(false);await secureStorage.clear();await campusPush.clear();},[releaseCapture]);
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
  useEffect(()=>{setPortalRole(null);},[session?.user.id]);

  useEffect(()=>{
    if(status && status.face_enrolled) {
      setConsent(false);releaseCapture();
    }
  },[status,releaseCapture]);
  async function signIn() {
    if(!deviceId) {setError('Secure device identity is unavailable. Restart the app.');return;}
    if(!email.trim()||!password) {setError('Enter your assigned college email and password.');return;}
    setBusy(true);setError('');
    try {
      const signed=await login(apiBase,email,password);version.current++;await secureStorage.save(signed);
      sessionRef.current=signed;setSession(signed);setPassword('');await refresh(signed,true);
    } catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  async function signOut() {
    setBusy(true);setError('');
    try {if(session){try{await unregisterFcm(session,deviceId);}finally{await logout(session);}}}catch { /* Local sign-out still succeeds when offline. */ }
    try {await clearIdentity();}catch(e){setError(message(e));}finally{setBusy(false);}
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
  const permissionNotice=permissions&&!permissions.notificationsAllowed ? <Text style={styles.notice}>Notifications are disabled. Enable them in app settings to receive attendance alerts.</Text> : null;
  return <SafeAreaProvider><SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#f3f6fc" /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><View style={styles.content}>
    <View style={styles.brand}><Text style={styles.brandMark}>G</Text><View><Text style={styles.brandTitle}>GVPCEW</Text><Text style={styles.subtitle}>Smart campus attendance</Text></View></View>
    {booting ? <View style={styles.card}><ActivityIndicator color="#185adb" /><Text style={styles.body}>Checking your secure campus account…</Text></View> : !session ? <View style={styles.card}>
      <Text style={styles.eyebrow}>STUDENT ACCESS</Text><Text style={styles.title}>Welcome to campus</Text><Text style={styles.body}>Sign in with the credentials assigned by your administrator.</Text>
      <Field label="Campus HTTPS address (ending in /api)" value={apiBase} onChange={setApiBase} />
      <Field label="College email" value={email} onChange={setEmail} /><Field label="Password" value={password} onChange={setPassword} password />
      <Action title={busy?'Signing in…':'Sign in'} onPress={()=>void signIn()} disabled={busy||!deviceId} />
    </View> : <>
      <View style={styles.account}><Text style={styles.accountName}>{session.user.fullName}</Text><Text style={styles.subtitle}>{session.user.email}</Text></View>
      {!session.user.roles.some(studentRole) ? <View style={styles.card}><Text style={styles.title}>Campus portal</Text><Text style={styles.body}>Open your assigned dashboard below to manage your campus work and review attendance.</Text></View> : !status ? <View style={styles.card}><Text style={styles.title}>Checking enrollment</Text><Text style={styles.body}>Connect to the campus server to continue.</Text><Action title="Retry" disabled={busy} onPress={()=>void refresh(session,true)} /></View> : screen==='setup' ? <View style={styles.card}>
        <Text style={styles.eyebrow}>ONE-TIME SETUP</Text><Text style={styles.title}>Register your face</Text><Text style={styles.body}>Register your face once on this phone. Look forward, slightly left, then slightly right. Your registration saves automatically.</Text>
        <View style={styles.consent}><Text style={styles.heading}>Your face data and privacy</Text><Text style={styles.body}>Your numeric face template is used to verify your own attendance. Camera frames are processed on this phone. Only the averaged numeric template is sent to the campus server.</Text><Text style={styles.body}>Your template stays until an administrator resets enrollment or removes your account. This account is bound to this phone; only an administrator can reset it.</Text><Text style={styles.body}>Camera, Bluetooth, location permission for Bluetooth proximity, and notification access support attendance. The app does not collect GPS coordinates. Contact your administrator if you do not consent.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}} onPress={()=>{setConsent(!consent);if(consent)releaseCapture();}} style={styles.checkboxRow}><Text style={[styles.checkbox,consent&&styles.checked]}>{consent?'✓':''}</Text><Text style={styles.checkboxLabel}>I consent to face enrollment and attendance verification.</Text></Pressable>
        </View>
        {permissions && permissions.missing.length>0 && <Text style={styles.notice}>Required access: {permissions.missing.join(', ')}.</Text>}{permissionNotice}
        <Action title={busy?'Capturing and saving…':'Register face'} disabled={busy||!consent} onPress={()=>void captureFace()} />
        <Action title="Open permission settings" secondary disabled={busy} onPress={()=>void Linking.openSettings()} />
      </View> : <View style={styles.card}>
        <Text style={styles.eyebrow}>{screen==='ready'?'FACE REGISTERED':'ENROLLMENT STATUS'}</Text>
        <Text style={styles.title}>{screen==='ready'?'You’re ready':screen==='pending'?'Awaiting approval':screen==='wrong-device'?'Use your enrolled phone':'Registration needs review'}</Text>
        <Text style={styles.body}>{screen==='ready'?'Your face is registered. You’ll receive an alert when attendance opens.':screen==='pending'?'Your setup is saved. Your administrator needs to review and approve it. You cannot repeat enrollment while it is awaiting review.':screen==='wrong-device'?'This account is bound to another phone. Contact your administrator for a device reset.':'Your registration was rejected. Contact your administrator to reset enrollment before capturing again.'}</Text>
        {permissionNotice}<Action title="Refresh status" secondary disabled={busy} onPress={()=>void refresh(session,true)} />
        {permissions && (permissions.missing.length>0||!permissions.notificationsAllowed) && <Action title="Open permission settings" secondary onPress={()=>void Linking.openSettings()} />}
      </View>}
      <View style={styles.card}><Text style={styles.heading}>Campus dashboards</Text>{Object.entries(portalRoles).filter(([role])=>session.user.roles.includes(role)).map(([role,portal])=><Action key={role} title={portal.label} onPress={()=>setPortalRole(role)} />)}</View>
      {screen==='ready' && <AttendanceHome session={session} deviceId={deviceId} notificationsAllowed={permissions?.notificationsAllowed ?? false} onExpired={expireAttendance} openRequest={attendanceOpenRequest} />}
      <Action title="Sign out" secondary disabled={busy} onPress={()=>void signOut()} />
    </>}
    {!!error && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
    <Text style={styles.footer}>One account. One phone. Your attendance.</Text>
  </View></ScrollView></KeyboardAvoidingView></SafeAreaView>{session && portalRole && <NativePortal session={session} role={portalRole} onClose={()=>setPortalRole(null)} onAttendance={()=>{setPortalRole(null);setAttendanceOpenRequest(n=>n+1);}} onExpired={()=>{setPortalRole(null);expireAttendance();}} />}</SafeAreaProvider>;
}
const styles=StyleSheet.create({
  flex:{flex:1},safe:{flex:1,backgroundColor:'#f3f6fc'},scroll:{padding:22,flexGrow:1},content:{width:'100%',maxWidth:520,alignSelf:'center',gap:18},brand:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:16},brandMark:{fontSize:28,fontWeight:'800',color:'#fff',backgroundColor:'#185adb',width:56,height:56,textAlign:'center',textAlignVertical:'center',borderRadius:16},brandTitle:{fontSize:23,fontWeight:'800',color:'#15233c'},subtitle:{fontSize:13,color:'#69758a',marginTop:3},card:{backgroundColor:'#fff',borderRadius:22,padding:24,gap:16,borderWidth:1,borderColor:'#e2e8f3'},eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.4,color:'#185adb'},title:{fontSize:27,fontWeight:'800',color:'#15233c'},heading:{fontSize:17,fontWeight:'700',color:'#15233c'},body:{fontSize:14,lineHeight:22,color:'#57657a'},field:{gap:7},label:{fontSize:13,fontWeight:'600',color:'#34425c'},input:{backgroundColor:'#f8faff',borderWidth:1,borderColor:'#d5dfed',borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:16,color:'#15233c'},button:{paddingVertical:15,paddingHorizontal:16,borderRadius:12,backgroundColor:'#185adb',alignItems:'center'},buttonText:{color:'#fff',fontSize:15,fontWeight:'700'},secondary:{backgroundColor:'#eaf0fb'},secondaryText:{color:'#24549b'},disabled:{opacity:0.45},account:{paddingHorizontal:4},accountName:{fontSize:18,fontWeight:'700',color:'#15233c'},consent:{backgroundColor:'#f4f7fc',padding:16,borderRadius:14,gap:10},checkboxRow:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:10},checkbox:{width:24,height:24,borderRadius:6,borderWidth:1,borderColor:'#a5b4cc',textAlign:'center',textAlignVertical:'center',fontWeight:'700',color:'#fff'},checked:{backgroundColor:'#185adb',borderColor:'#185adb'},checkboxLabel:{flex:1,fontSize:13,lineHeight:20,color:'#34425c'},notice:{backgroundColor:'#fff4d7',padding:12,borderRadius:10,color:'#78510d',fontSize:13,lineHeight:20},captureSummary:{alignItems:'center',gap:10},facePreview:{width:136,height:136,borderRadius:18},error:{padding:14,backgroundColor:'#fce9e9',borderRadius:12},errorText:{color:'#9b2828',fontSize:14,lineHeight:21},footer:{color:'#8a95a7',fontSize:12,textAlign:'center',paddingVertical:12},
});
