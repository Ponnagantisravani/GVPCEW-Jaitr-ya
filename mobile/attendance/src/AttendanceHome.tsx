import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {ApiError,getActiveAttendance,getAttendanceStatus,getStartOptions,registerFcm,startAttendance} from './api';
import {useBleProximity} from './useBleProximity';
import {useFaceAttendance} from './useFaceAttendance';
import {campusPush,campusBle} from './native';
import {acceptsPush,secondsRemaining} from './attendancePolicy';
import type {AttendanceSession,AttendanceStatus,Session,StartPeriod,BroadcastStatus} from './types';
const explain=(e: unknown)=>e instanceof Error?e.message:'Unable to reach campus attendance.';
export default function AttendanceHome({session,deviceId,notificationsAllowed,onExpired}: {session: Session; deviceId: string; notificationsAllowed: boolean; onExpired: ()=>void}) {
  const coordinator=session.user.roles.includes('student_coordinator');
  const [active,setActive]=useState<AttendanceSession|null>(null),[counts,setCounts]=useState<AttendanceStatus|null>(null),[periods,setPeriods]=useState<StartPeriod[]>([]);
  const [error,setError]=useState(''),[pushError,setPushError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[now,setNow]=useState(Date.now());
  const proximity=useBleProximity(session,active,deviceId,onExpired);
  const verification=useFaceAttendance(session,active,deviceId,proximity.receipt,onExpired);
  const [broadcast,setBroadcast]=useState<BroadcastStatus|null>(null),[showRecovery,setShowRecovery]=useState(false);
  const mounted=useRef(true),refreshing=useRef(false),registered=useRef(''),lastEvent=useRef('');
  const refresh=useCallback(async()=>{
    if(refreshing.current||AppState.currentState!=='active')return;
    refreshing.current=true;
    try {
      const result=await getActiveAttendance(session);
      const options=coordinator?await getStartOptions(session):{periods:[]};
      const status=result.session?await getAttendanceStatus(session,result.session.id):null;
      if(mounted.current){setActive(result.session);setPeriods(options.periods);setCounts(status);setError('');}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else setError(explain(e));}}
    finally{refreshing.current=false;if(mounted.current)setLoading(false);}
  },[session,coordinator,onExpired]);
  const syncPush=useCallback(async()=>{
    try {
      const token=await campusPush.token();
      if(!mounted.current)return;
      const canAdvertise=await campusBle.canAdvertise(),key=token+'/'+canAdvertise;
      if(registered.current!==key){await registerFcm(session,deviceId,token,canAdvertise);if(!mounted.current)return;registered.current=key;}
      setPushError('');
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else setPushError(explain(e));}}
  },[session,deviceId,onExpired]);
  useEffect(()=>{
    mounted.current=true;void refresh();void syncPush();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active'){void refresh();void syncPush();}});
    const poll=setInterval(()=>{void refresh();},4000);
    const tokenTimer=setInterval(()=>{if(AppState.currentState==='active')void syncPush();},30000);
    const tick=setInterval(()=>{setNow(Date.now());if(AppState.currentState==='active')void campusPush.event().then(event=>{
      if(mounted.current&&acceptsPush(event,session.user.id)&&event!.session_id!==lastEvent.current){lastEvent.current=event!.session_id;void refresh();}
    }).catch(()=>{});},1000);
    return()=>{mounted.current=false;subscription.remove();clearInterval(poll);clearInterval(tokenTimer);clearInterval(tick);};
  },[refresh,syncPush,session.user.id]);
  useEffect(()=>{
    setShowRecovery(false);
    if(active?.broadcast&&Date.parse(active.expires_at)>Date.now())void campusBle.start(active.id,active.expires_at).catch(e=>setError(explain(e)));
  },[active?.id,active?.broadcast,active?.expires_at]);
  useEffect(()=>{
    let alive=true;
    const poll=()=>{void campusBle.status().then(value=>{if(alive)setBroadcast(value);}).catch(()=>{});};
    poll();const timer=setInterval(poll,1000);
    return()=>{alive=false;clearInterval(timer);};
  },[]);
  async function start(period: StartPeriod){
    if(busy)return;setBusy(true);setError('');
    try {
      if(!await campusBle.canAdvertise())throw new Error('This phone cannot broadcast Bluetooth attendance. Use the other assigned coordinator’s capable phone.');
      const result=await startAttendance(session,period,deviceId);
      if(mounted.current){setActive({...result.session,broadcast:true});await campusBle.start(result.session.id,result.session.expires_at);await refresh();}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else {setError(explain(e));if(e instanceof ApiError&&e.status===409)await refresh();}}}
    finally{if(mounted.current)setBusy(false);}
  }
  const remaining=active?secondsRemaining(active.expires_at,now):0;
  return <View style={styles.card}>
    <Text style={styles.heading}>Class attendance</Text>
    {loading&&<ActivityIndicator />}
    {!!pushError&&<Text accessibilityRole="alert" style={styles.notice}>{pushError} Use Refresh to retry notification registration.</Text>}
    {!notificationsAllowed&&<Text style={styles.notice}>Enable notifications in app settings to receive attendance alerts.</Text>}
    {active&&remaining>0?<>
      <Text style={styles.timer}>{remaining}s remaining</Text>
      <Text style={styles.body}>{counts?counts.present+' / '+counts.total+' marked':'Attendance is open.'}</Text>
      {verification.phase==='success'?<Text accessibilityRole="alert" style={styles.success}>Your attendance is {verification.record?.status==='LATE'?'Present (Late)':'Present'}.</Text>:<>
      {verification.busy&&<Text style={styles.body}>{verification.phase==='preparing'?'Preparing secure face verification…':verification.phase==='capturing'?'Complete the instruction in the front camera.':verification.phase==='checking'?'Verifying this app and phone…':'Sending your attendance…'}</Text>}
      {!!verification.error&&<Text accessibilityRole="alert" style={styles.notice}>{verification.error}</Text>}
      {verification.phase==='failed'&&<Pressable accessibilityRole="button" onPress={()=>verification.retry()} style={styles.secondary}><Text style={styles.secondaryText}>Retry face attendance</Text></Pressable>}
      <Text style={styles.body}>{proximity.cameraUnlocked?'Bluetooth verified. Ready for your face check.':proximity.phase==='still-searching'?'Still searching for the classroom Bluetooth signal…':proximity.phase==='fallback-offered'?'Still searching. You can check the late attendance recovery options.':'Searching for the classroom Bluetooth signal…'}</Text>
      </>}
      {!!proximity.error&&<Text accessibilityRole="alert" style={styles.notice}>{proximity.error}</Text>}
      {broadcast?.session_id===active.id&&<Text style={styles.body}>{broadcast.state==='broadcasting'?'Helping broadcast the class attendance signal.':broadcast.state==='starting'?'Preparing the class Bluetooth broadcast.':broadcast.message}</Text>}
      {active.broadcast&&broadcast?.state==='failed'&&<Pressable accessibilityRole="button" onPress={()=>void campusBle.start(active.id,active.expires_at)} style={styles.secondary}><Text style={styles.secondaryText}>Retry Bluetooth broadcast</Text></Pressable>}
      {!proximity.cameraUnlocked&&proximity.phase==='fallback-offered'&&<Pressable accessibilityRole="button" onPress={()=>setShowRecovery(true)} style={styles.secondary}><Text style={styles.secondaryText}>Late attendance recovery</Text></Pressable>}
      {showRecovery&&<Text style={styles.notice}>Late attendance becomes available after the session closes. Keep searching now; check Bluetooth, permissions and your connection.</Text>}
      {!proximity.cameraUnlocked&&<Pressable accessibilityRole="button" onPress={()=>void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(e=>setError(explain(e)))} style={styles.secondary}><Text style={styles.secondaryText}>Open Bluetooth settings</Text></Pressable>}
    </>:<>
      {verification.phase==='success'&&<Text style={styles.success}>Your attendance was marked Present.</Text>}
      <Text style={styles.body}>No attendance session is open. We will alert you when your class attendance starts.</Text>
      {coordinator&&periods.length===0&&<Text style={styles.body}>No current published period is assigned to you. Refresh when your class begins.</Text>}
      {coordinator&&periods.map(period=><View key={period.timetable_id} style={styles.period}>
        <Text style={styles.subject}>{period.subject_name} · {period.section_name}</Text>
        <Text style={styles.body}>{period.start_time.slice(0,5)}–{period.end_time.slice(0,5)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Start class attendance" accessibilityState={{disabled:busy||!!period.session_id}} disabled={busy||!!period.session_id} onPress={()=>void start(period)} style={[styles.button,(busy||!!period.session_id)&&styles.disabled]}><Text style={styles.buttonText}>{period.session_id?'Attendance already started':busy?'Starting…':'Start 60-second attendance'}</Text></Pressable>
      </View>)}
    </>}
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={()=>{proximity.retry();void refresh();void syncPush();}} style={styles.secondary}><Text style={styles.secondaryText}>Refresh attendance</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({card:{backgroundColor:'#fff',borderRadius:22,padding:24,gap:14,borderWidth:1,borderColor:'#e2e8f3'},heading:{fontSize:20,fontWeight:'700',color:'#15233c'},body:{fontSize:14,lineHeight:22,color:'#57657a'},timer:{fontSize:28,fontWeight:'800',color:'#185adb'},period:{gap:10,paddingVertical:8},subject:{fontSize:16,fontWeight:'600',color:'#15233c'},button:{padding:15,borderRadius:12,backgroundColor:'#185adb',alignItems:'center'},buttonText:{color:'#fff',fontWeight:'700'},disabled:{opacity:.45},secondary:{padding:14,borderRadius:12,backgroundColor:'#eaf0fb',alignItems:'center'},secondaryText:{color:'#24549b',fontWeight:'600'},notice:{backgroundColor:'#fff4d7',padding:12,borderRadius:10,color:'#78510d',fontSize:13,lineHeight:20},success:{backgroundColor:'#e2f5e9',padding:12,borderRadius:10,color:'#17613a',fontSize:16,fontWeight:'700'},error:{color:'#9b2828',fontSize:14,lineHeight:21}});
