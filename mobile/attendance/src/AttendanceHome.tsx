import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Linking,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {ApiError,getCurrentAttendance,getAttendanceStatus,getStartOptions,registerFcm,startAttendance} from './api';
import {useBleProximity} from './useBleProximity';
import {useFaceAttendance} from './useFaceAttendance';
import {campusPush,campusBle} from './native';
import {acceptsPush,attendanceMilliseconds,anchorAttendance} from './attendancePolicy';
import {monotonicNow} from './bleProtocol';
import type {AttendanceSession,AttendanceStatus,Session,StartPeriod,BroadcastStatus,AttendanceRecord,AttendanceCurrent} from './types';
const explain=(e: unknown)=>e instanceof Error?e.message:'Unable to reach campus attendance.';
export default function AttendanceHome({session,deviceId,notificationsAllowed,onExpired}: {session: Session; deviceId: string; notificationsAllowed: boolean; onExpired: ()=>void}) {
  const coordinator=session.user.roles.includes('student_coordinator');
  const [active,setActive]=useState<AttendanceSession|null>(null),[counts,setCounts]=useState<AttendanceStatus|null>(null),[periods,setPeriods]=useState<StartPeriod[]>([]);
  const [error,setError]=useState(''),[pushError,setPushError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[now,setNow]=useState(Date.now());
  const [duration,setDuration]=useState('60');
  const durationValid=Number.isInteger(Number(duration))&&Number(duration)>=30&&Number(duration)<=1800;
  const [openedSession,setOpenedSession]=useState<string|null>(null);
  const [windowPhase,setWindowPhase]=useState<AttendanceCurrent['phase']>(null),[ownRecord,setOwnRecord]=useState<AttendanceRecord|null>(null);
  const proximity=useBleProximity(session,windowPhase==='ble'?active:null,deviceId,onExpired);
  const verification=useFaceAttendance(session,active,deviceId,proximity.receipt,onExpired,windowPhase==='ble'?'ble':windowPhase==='fallback'?'fallback':'closed',openedSession===active?.id);
  const [broadcast,setBroadcast]=useState<BroadcastStatus|null>(null),[showRecovery,setShowRecovery]=useState(false);
  const mounted=useRef(true),refreshing=useRef(false),registered=useRef(''),lastEvent=useRef('');
  const refresh=useCallback(async()=>{
    if(refreshing.current||AppState.currentState!=='active')return;
    refreshing.current=true;
    try {
      const requested=monotonicNow();
      const result=await getCurrentAttendance(session,deviceId);
      const current=anchorAttendance(result,requested);
      const options=coordinator?await getStartOptions(session):{periods:[]};
      const status=result.session?await getAttendanceStatus(session,result.session.id):null;
      if(mounted.current){setActive(current);setWindowPhase(result.phase);setOwnRecord(result.own_record);setPeriods(options.periods);setCounts(status);setError('');}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else setError(explain(e));}}
    finally{refreshing.current=false;if(mounted.current)setLoading(false);}
  },[session,deviceId,coordinator,onExpired]);
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
      if(mounted.current&&acceptsPush(event,session.user.id)){if(event!.opened==='true')setOpenedSession(event!.session_id);if(event!.session_id!==lastEvent.current){lastEvent.current=event!.session_id;void refresh();}}
    }).catch(()=>{});},1000);
    return()=>{mounted.current=false;subscription.remove();clearInterval(poll);clearInterval(tokenTimer);clearInterval(tick);};
  },[refresh,syncPush,session.user.id]);
  useEffect(()=>{
    setShowRecovery(false);
    if(active?.broadcast&&windowPhase==='ble'&&attendanceMilliseconds(active)>0)void campusBle.start(active.id,active.expires_at).catch(e=>setError(explain(e)));
    else void campusBle.stop().catch(()=>{});
  },[active?.id,active?.broadcast,active?.expires_at,windowPhase]);
  useEffect(()=>{
    let alive=true;
    const poll=()=>{void campusBle.status().then(value=>{if(alive)setBroadcast(value);}).catch(()=>{});};
    poll();const timer=setInterval(poll,1000);
    return()=>{alive=false;clearInterval(timer);};
  },[]);
  async function start(period: StartPeriod){
    if(busy)return;if(!durationValid){setError('Choose a time limit from 30 to 1800 seconds.');return;}setBusy(true);setError('');
    try {
      if(!await campusBle.canAdvertise())throw new Error('This phone cannot broadcast Bluetooth attendance. Use the other assigned coordinator’s capable phone.');
      const result=await startAttendance(session,period,deviceId,Number(duration));
      if(mounted.current){setOpenedSession(result.session.id);setActive({...result.session,broadcast:true});setWindowPhase('ble');setOwnRecord(null);await campusBle.start(result.session.id,result.session.expires_at);await refresh();}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else {setError(explain(e));if(e instanceof ApiError&&e.status===409)await refresh();}}}
    finally{if(mounted.current)setBusy(false);}
  }
  const remaining=active?Math.ceil(attendanceMilliseconds(active)/1000):0;
  const lateRemaining=active?Math.ceil(attendanceMilliseconds(active,'fallback')/1000):0;
  const marked=verification.phase==='success'?verification.record:ownRecord;
  const accepted=marked?.status==='PRESENT'||marked?.status==='LATE';
  useEffect(()=>{if(active&&windowPhase==='ble'&&remaining===0){void campusBle.stop().catch(()=>{});void refresh();}},[active?.id,windowPhase,remaining,refresh]);
  useEffect(()=>{if(verification.phase==='success')void refresh();},[verification.phase,refresh]);
  // now updates once per second so monotonic countdowns redraw without trusting phone clock.
  void now;
  return <View style={[styles.card,accepted&&styles.successScreen]}>
    <Text style={styles.heading}>Class attendance</Text>
    {loading&&<ActivityIndicator />}
    {!!pushError&&<Text accessibilityRole="alert" style={styles.notice}>{pushError} Use Refresh to retry notification registration.</Text>}
    {!notificationsAllowed&&<Text style={styles.notice}>Enable notifications in app settings to receive attendance alerts.</Text>}
    {active?<>
      <Text style={styles.timer}>{windowPhase==='ble'&&remaining>0?remaining+'s remaining':windowPhase==='fallback'&&lateRemaining>0?'Late check-in · '+lateRemaining+'s left':'Session closed'}</Text>
      <Text style={styles.body}>{counts?counts.present+' present · '+counts.late+' late / '+counts.total+' students':'Refreshing attendance results…'}</Text>
      {accepted&&<Text accessibilityRole="alert" style={styles.success}>{marked?.status==='LATE'?'Attendance marked (Late)':'Attendance marked'}</Text>}
      {windowPhase==='ble'&&remaining>0&&!accepted&&<>
        {!verification.busy&&<Pressable accessibilityRole="button" accessibilityLabel="Start Face Verification" onPress={()=>{setOpenedSession(active.id);if(verification.phase==='failed')verification.retry();}} style={[styles.button,{backgroundColor:'#066448'}]}><Text style={styles.buttonText}>▣ Start Face Verification</Text></Pressable>}
        {verification.busy&&<Text style={styles.body}>{verification.phase==='preparing'?'Preparing secure face verification…':verification.phase==='capturing'?'Blink once in the front camera.':verification.phase==='checking'?'Verifying this app and phone…':'Sending your attendance…'}</Text>}
        {!!verification.error&&<Text accessibilityRole="alert" style={styles.notice}>{verification.error}</Text>}
        <Text style={styles.body}>{proximity.cameraUnlocked?'Bluetooth verified. Ready for your face check.':proximity.phase==='still-searching'?'Still searching for the classroom Bluetooth signal…':proximity.phase==='fallback-offered'?'Still searching. Late check-in will be available after this session closes.':'Searching for the classroom Bluetooth signal…'}</Text>
        {!!proximity.error&&<Text accessibilityRole="alert" style={styles.notice}>{proximity.error}</Text>}
        {proximity.phase==='fallback-offered'&&!proximity.cameraUnlocked&&<Pressable accessibilityRole="button" onPress={()=>setShowRecovery(true)} style={styles.secondary}><Text style={styles.secondaryText}>Late attendance options</Text></Pressable>}
        {showRecovery&&<Text style={styles.notice}>Keep searching now. After the main session closes, this phone can perform the same secure face check without Bluetooth for two minutes. A successful check is marked Present (Late) and flagged for teacher review.</Text>}
        {!proximity.cameraUnlocked&&<Pressable accessibilityRole="button" onPress={()=>void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(e=>setError(explain(e)))} style={styles.secondary}><Text style={styles.secondaryText}>Open Bluetooth settings</Text></Pressable>}
      </>}
      {windowPhase==='ble'&&remaining===0&&!accepted&&<Text style={styles.body}>Closing attendance and checking the late window…</Text>}
      {windowPhase==='fallback'&&lateRemaining>0&&!accepted&&<>
        <Text style={styles.body}>The main session has closed. Complete the same face challenge without Bluetooth. A successful late check-in is flagged for teacher review.</Text>
        {verification.busy&&<Text style={styles.body}>{verification.phase==='preparing'?'Preparing secure late check-in…':verification.phase==='capturing'?'Complete the instruction in the front camera.':verification.phase==='checking'?'Verifying this app and phone…':'Sending your late attendance…'}</Text>}
        {!!verification.error&&<Text accessibilityRole="alert" style={styles.notice}>{verification.error}</Text>}
        {verification.phase==='failed'?<Pressable accessibilityRole="button" onPress={()=>verification.retry()} style={styles.secondary}><Text style={styles.secondaryText}>Prepare late retry</Text></Pressable>:<Pressable accessibilityRole="button" accessibilityLabel="Start late face check" accessibilityState={{disabled:verification.phase!=='ready'}} disabled={verification.phase!=='ready'} onPress={()=>verification.startLate()} style={[styles.button,verification.phase!=='ready'&&styles.disabled]}><Text style={styles.buttonText}>Start late face check</Text></Pressable>}
      </>}
      {(windowPhase==='closed'||(windowPhase==='fallback'&&lateRemaining===0))&&!accepted&&<Text style={styles.notice}>Your attendance is Absent. The late check-in window has ended.</Text>}
      {broadcast?.session_id===active.id&&windowPhase==='ble'&&remaining>0&&<Text style={styles.body}>{broadcast.state==='broadcasting'?'Helping broadcast the class attendance signal.':broadcast.state==='starting'?'Preparing the class Bluetooth broadcast.':broadcast.message}</Text>}
      {active.broadcast&&windowPhase==='ble'&&remaining>0&&broadcast?.state==='failed'&&<Pressable accessibilityRole="button" onPress={()=>void campusBle.start(active.id,active.expires_at)} style={styles.secondary}><Text style={styles.secondaryText}>Retry Bluetooth broadcast</Text></Pressable>}
    </>:<Text style={styles.body}>No attendance session has started for your class today. We will alert you when attendance opens.</Text>}
    {coordinator&&windowPhase!=='ble'&&<>
      <Text style={styles.subject}>Attendance time limit (seconds)</Text><TextInput accessibilityLabel="Attendance time limit in seconds" keyboardType="number-pad" value={duration} onChangeText={setDuration} editable={!busy} style={[styles.secondary,{color:'#15233c'}]}/><Text style={styles.body}>Choose 30 seconds to 30 minutes before starting.</Text>
      {periods.length===0&&<Text style={styles.body}>No current published period is assigned to you. Refresh when your class begins.</Text>}
      {periods.map(period=><View key={period.timetable_id} style={styles.period}>
        <Text style={styles.subject}>{period.subject_name} · {period.section_name}</Text>
        <Text style={styles.body}>{period.start_time.slice(0,5)}–{period.end_time.slice(0,5)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Start class attendance" accessibilityState={{disabled:busy||!durationValid||!!period.session_id}} disabled={busy||!durationValid||!!period.session_id} onPress={()=>void start(period)} style={[styles.button,(busy||!!period.session_id)&&styles.disabled]}><Text style={styles.buttonText}>{period.session_id?'Attendance already started':busy?'Starting…':'Start attendance'}</Text></Pressable>
      </View>)}
    </>}
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={()=>{proximity.retry();void refresh();void syncPush();}} style={styles.secondary}><Text style={styles.secondaryText}>Refresh attendance</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({successScreen:{backgroundColor:'#e2f5e9',borderColor:'#7cc49a'},card:{backgroundColor:'#fff',borderRadius:22,padding:24,gap:14,borderWidth:1,borderColor:'#e2e8f3'},heading:{fontSize:20,fontWeight:'700',color:'#15233c'},body:{fontSize:14,lineHeight:22,color:'#57657a'},timer:{fontSize:28,fontWeight:'800',color:'#185adb'},period:{gap:10,paddingVertical:8},subject:{fontSize:16,fontWeight:'600',color:'#15233c'},button:{padding:15,borderRadius:12,backgroundColor:'#185adb',alignItems:'center'},buttonText:{color:'#fff',fontWeight:'700'},disabled:{opacity:.45},secondary:{padding:14,borderRadius:12,backgroundColor:'#eaf0fb',alignItems:'center'},secondaryText:{color:'#24549b',fontWeight:'600'},notice:{backgroundColor:'#fff4d7',padding:12,borderRadius:10,color:'#78510d',fontSize:13,lineHeight:20},success:{backgroundColor:'#e2f5e9',padding:12,borderRadius:10,color:'#17613a',fontSize:16,fontWeight:'700'},error:{color:'#9b2828',fontSize:14,lineHeight:21}});
