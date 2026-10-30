import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Linking,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {ApiError,getCurrentAttendance,getAttendanceStatus,getStartOptions,getSubjectStartOptions,registerFcm,startAttendance} from './api';
import {useBleProximity} from './useBleProximity';
import {useFaceAttendance} from './useFaceAttendance';
import {campusPush,campusBle} from './native';
import {acceptsPush,attendanceMilliseconds,anchorAttendance} from './attendancePolicy';
import {monotonicNow} from './bleProtocol';
import type {AttendanceSession,AttendanceStatus,Session,StartPeriod,BroadcastStatus,AttendanceRecord,AttendanceCurrent,SubjectStartOptions,SubjectStartSlot} from './types';
const explain=(e: unknown)=>e instanceof Error?e.message:'Unable to reach campus attendance.';
export default function AttendanceHome({session,deviceId,notificationsAllowed,onExpired,startRequest=0,startDurationSeconds=60,startSelection}: {session: Session; deviceId: string; notificationsAllowed: boolean; onExpired: ()=>void; startRequest?:number; startDurationSeconds?:number; startSelection?:{subjectId:string;period:number}|null}) {
  const coordinator=session.user.roles.includes('student_coordinator');
  const [active,setActive]=useState<AttendanceSession|null>(null),[counts,setCounts]=useState<AttendanceStatus|null>(null),[periods,setPeriods]=useState<StartPeriod[]>([]),[subjectOptions,setSubjectOptions]=useState<SubjectStartOptions|null>(null);
  const [error,setError]=useState(''),[pushError,setPushError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[now,setNow]=useState(Date.now());
  const [duration,setDuration]=useState('60'),[rollSearch,setRollSearch]=useState(''),[selectedSubjectId,setSelectedSubjectId]=useState(''),[selectedSlot,setSelectedSlot]=useState<SubjectStartSlot|null>(null),[selectedBatchId,setSelectedBatchId]=useState('');
  const availableSubjects=subjectOptions?.subjects.filter(s=>subjectOptions.slots.some(slot=>slot.subject_id===s.subject_id))||[];
  const chosenSubject=availableSubjects.find(s=>s.subject_id===selectedSubjectId);
  const subjectSlots=subjectOptions?.slots.filter(slot=>slot.subject_id===selectedSubjectId)||[];
  const durationValid=Number.isInteger(Number(duration))&&Number(duration)>=30&&Number(duration)<=1800;
  const [windowPhase,setWindowPhase]=useState<AttendanceCurrent['phase']>(null),[ownRecord,setOwnRecord]=useState<AttendanceRecord|null>(null);
  const proximity=useBleProximity(session,windowPhase==='ble'?active:null,deviceId,onExpired);
  const verification=useFaceAttendance(session,active,deviceId,proximity.receipt,onExpired,windowPhase==='ble'?'ble':'closed',proximity.cameraUnlocked);
  const [broadcast,setBroadcast]=useState<BroadcastStatus|null>(null);
  const mounted=useRef(true),refreshing=useRef(false),registered=useRef(''),lastEvent=useRef(''),handledStartRequest=useRef(0);
  const refresh=useCallback(async()=>{
    if(refreshing.current||AppState.currentState!=='active')return;
    refreshing.current=true;
    try {
      if(coordinator){
        const [options,catalog]=await Promise.all([getStartOptions(session),getSubjectStartOptions(session)]);
        if(mounted.current){setPeriods(options.default_option?[options.default_option]:options.periods);setSubjectOptions(catalog);if(!catalog.subjects.some(s=>s.subject_id===selectedSubjectId&&catalog.slots.some(slot=>slot.subject_id===s.subject_id))){setSelectedSubjectId(catalog.subjects.find(s=>catalog.slots.some(slot=>slot.subject_id===s.subject_id))?.subject_id||'');setSelectedSlot(null);setSelectedBatchId('');}}
      }
      const requested=monotonicNow();
      const result=await getCurrentAttendance(session,deviceId);
      const current=anchorAttendance(result,requested);
      const status=result.session?await getAttendanceStatus(session,result.session.id):null;
      if(mounted.current){setActive(current);setWindowPhase(result.phase);setOwnRecord(result.own_record);setCounts(status);setError('');}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else setError(explain(e));}}
    finally{refreshing.current=false;if(mounted.current)setLoading(false);}
  },[session,deviceId,coordinator,onExpired,selectedSubjectId]);
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
    if(active?.broadcast&&windowPhase==='ble'&&attendanceMilliseconds(active)>0)void campusBle.start(active.id,active.expires_at).catch(e=>setError(explain(e)));
    else void campusBle.stop().catch(()=>{});
  },[active?.id,active?.broadcast,active?.expires_at,windowPhase]);
  useEffect(()=>{
    let alive=true;
    const poll=()=>{void campusBle.status().then(value=>{if(alive)setBroadcast(value);}).catch(()=>{});};
    poll();const timer=setInterval(poll,1000);
    return()=>{alive=false;clearInterval(timer);};
  },[]);
  async function start(period: StartPeriod,durationOverride?:number){
    const seconds=durationOverride??Number(duration);if(busy)return;if(!Number.isInteger(seconds)||seconds<30||seconds>1800){setError('Choose a time limit from 30 to 1800 seconds.');return;}setBusy(true);setError('');
    try {
      if(!await campusBle.canAdvertise())throw new Error('This phone cannot broadcast Bluetooth attendance. Use the other assigned coordinator’s capable phone.');
      const result=await startAttendance(session,period,deviceId,seconds);
      if(mounted.current){setActive({...result.session,broadcast:true});setWindowPhase('ble');setOwnRecord(null);await campusBle.start(result.session.id,result.session.expires_at);await refresh();}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status===401)onExpired();else {setError(explain(e));if(e instanceof ApiError&&e.status===409)await refresh();}}}
    finally{if(mounted.current)setBusy(false);}
  }
  function startSelectedSubject(){
    if(!chosenSubject||!selectedSlot||!subjectOptions)return;
    void start({timetable_id:selectedSlot.id,default_period:selectedSlot.manual_period,section_id:subjectOptions.section.id,section_name:subjectOptions.section.section_name,subject_name:chosenSubject.name,start_time:selectedSlot.start_time,end_time:selectedSlot.end_time,session_id:null,expires_at:null,subject_id:selectedSlot.subject_id,period:selectedSlot.period,...(selectedBatchId?{batch_id:selectedBatchId}:{})});
  }
  useEffect(()=>{
    if(startRequest<=0||startRequest<=handledStartRequest.current||loading)return;
    handledStartRequest.current=startRequest;
    if(!coordinator)return;
    if(active&&(windowPhase==='ble'||windowPhase==='fallback')){setError('Attendance is already open or in its late check-in window.');return;}
    if(startSelection){
      const subject=subjectOptions?.subjects.find(item=>item.subject_id===startSelection.subjectId),slot=subjectOptions?.slots.find(item=>item.subject_id===startSelection.subjectId&&item.period===startSelection.period);
      if(!subject||!slot||!subjectOptions){setError('The selected subject or period is no longer available. Refresh and choose it again.');return;}
      void start({timetable_id:slot.id,default_period:slot.manual_period,section_id:subjectOptions.section.id,section_name:subjectOptions.section.section_name,subject_name:subject.name,start_time:slot.start_time,end_time:slot.end_time,session_id:null,expires_at:null,subject_id:slot.subject_id,period:slot.period});
      return;
    }
    const assignedClass=periods.find(period=>period.default_attendance);
    if(!assignedClass){setError('Your assigned class is unavailable. Refresh or contact your administrator.');return;}
    void start(assignedClass,startDurationSeconds);
  },[startRequest,startDurationSeconds,startSelection,subjectOptions,loading,coordinator,active?.id,windowPhase,periods,start]);
  const remaining=active?Math.ceil(attendanceMilliseconds(active)/1000):0;
  const marked=verification.phase==='success'?verification.record:ownRecord;
  const accepted=marked?.status==='PRESENT'||marked?.status==='LATE';
  useEffect(()=>{if(active&&windowPhase==='ble'&&remaining===0){void campusBle.stop().catch(()=>{});void refresh();}},[active?.id,windowPhase,remaining,refresh]);
  useEffect(()=>{if(verification.phase==='success')void refresh();},[verification.phase,refresh]);
  // now updates once per second so monotonic countdowns redraw without trusting phone clock.
  void now;
  return <View style={[styles.card,accepted&&styles.successScreen]}>
    <Text style={styles.heading}>{coordinator?'Start and manage attendance':'Mark your attendance'}</Text>
    {loading&&<ActivityIndicator />}
    {!!pushError&&<Text accessibilityRole="alert" style={styles.notice}>{pushError} Use Refresh to retry notification registration.</Text>}
    {!notificationsAllowed&&<Text style={styles.notice}>Enable notifications in app settings to receive attendance alerts.</Text>}
    {active?<>
      <Text style={styles.timer}>{windowPhase==='ble'&&remaining>0?remaining+'s remaining':'Session closed'}</Text>
      <Text style={styles.body}>{counts?counts.present+' present · '+counts.late+' late / '+counts.total+' students':'Refreshing attendance results…'}</Text>
      {accepted&&<View accessibilityRole="alert" style={styles.successScreen}><Text style={styles.successMark}>✓</Text><Text style={styles.successTitle}>{marked?.status==='LATE'?'Attendance marked (Late)':'Attendance marked'}</Text></View>}
      {windowPhase==='ble'&&remaining>0&&!accepted&&<>
        {verification.busy&&<Text style={styles.body}>{verification.phase==='preparing'?'Preparing secure face verification…':verification.phase==='capturing'?'Blink once in the front camera.':verification.phase==='checking'?'Verifying this app and phone…':'Sending your attendance…'}</Text>}
        {!!verification.error&&<Text accessibilityRole="alert" style={styles.notice}>{verification.error}</Text>}
        <Text style={styles.body}>{verification.phase==='failed'?'Face not recognized, try again':verification.busy?'Blink once in the front camera.':proximity.cameraUnlocked?'Bluetooth verified. Starting face verification…':proximity.phase==='still-searching'?'Still searching for the classroom Bluetooth signal…':'Searching for the classroom Bluetooth signal…'}</Text>
        {!!proximity.error&&<Text accessibilityRole="alert" style={styles.notice}>{proximity.error}</Text>}
        {!proximity.cameraUnlocked&&<Pressable accessibilityRole="button" onPress={()=>void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(e=>setError(explain(e)))} style={styles.secondary}><Text style={styles.secondaryText}>Open Bluetooth settings</Text></Pressable>}
      </>}
      {windowPhase==='ble'&&remaining===0&&!accepted&&<Text style={styles.body}>Closing attendance and checking the late window…</Text>}
      {windowPhase!=='ble'&&!accepted&&<Text style={styles.notice}>Attendance can only be marked while the session is open and its Bluetooth signal is verified.</Text>}
      {broadcast?.session_id===active.id&&windowPhase==='ble'&&remaining>0&&<Text style={styles.body}>{broadcast.state==='broadcasting'?'Helping broadcast the class attendance signal.':broadcast.state==='starting'?'Preparing the class Bluetooth broadcast.':broadcast.message}</Text>}
      {active.broadcast&&windowPhase==='ble'&&remaining>0&&broadcast?.state==='failed'&&<Pressable accessibilityRole="button" onPress={()=>void campusBle.start(active.id,active.expires_at)} style={styles.secondary}><Text style={styles.secondaryText}>Retry Bluetooth broadcast</Text></Pressable>}
    </>:<Text style={styles.body}>No attendance session has started for your class today. We will alert you when attendance opens.</Text>}
    {coordinator&&windowPhase!=='ble'&&<>
      <Text style={styles.subject}>Attendance time limit (seconds)</Text><TextInput accessibilityLabel="Attendance time limit in seconds" keyboardType="number-pad" value={duration} onChangeText={setDuration} editable={!busy} style={[styles.secondary,{color:'#15233c'}]}/><Text style={styles.body}>Choose 30 seconds to 30 minutes before starting.</Text>
      {!!subjectOptions&&<View style={styles.period}>
        <Text style={styles.subject}>Subject · Year {subjectOptions.section.year_number} · Section {subjectOptions.section.section_name}</Text>
        {availableSubjects.length===0&&<Text style={styles.body}>No mapped subjects have a published period in today’s timetable.</Text>}
        <View style={styles.choiceRow}>{availableSubjects.map(item=><Pressable key={item.subject_id} accessibilityRole="button" accessibilityLabel={'Select subject '+item.name} accessibilityState={{selected:selectedSubjectId===item.subject_id}} onPress={()=>{setSelectedSubjectId(item.subject_id);setSelectedSlot(null);setSelectedBatchId('');}} style={[styles.choice,selectedSubjectId===item.subject_id&&styles.choiceSelected]}><Text style={[styles.choiceText,selectedSubjectId===item.subject_id&&styles.choiceTextSelected]}>{item.name}</Text></Pressable>)}</View>
        {!!chosenSubject&&<>
          {!!chosenSubject.faculty_name&&<Text style={styles.body}>Faculty: {chosenSubject.faculty_name}</Text>}
          <Text style={styles.subject}>Period</Text>
          <View style={styles.choiceRow}>{subjectSlots.map(slot=><Pressable key={slot.id} accessibilityRole="button" accessibilityLabel={'Select period '+slot.period} accessibilityState={{selected:selectedSlot?.id===slot.id}} onPress={()=>setSelectedSlot(slot)} style={[styles.choice,selectedSlot?.id===slot.id&&styles.choiceSelected]}><Text style={[styles.choiceText,selectedSlot?.id===slot.id&&styles.choiceTextSelected]}>Period {slot.period}</Text></Pressable>)}</View>
          {chosenSubject.kind==='lab'&&!!subjectOptions.batches.length&&<><Text style={styles.subject}>Lab batch</Text><View style={styles.choiceRow}>{subjectOptions.batches.map(batch=><Pressable key={batch.id} accessibilityRole="button" accessibilityState={{selected:selectedBatchId===batch.id}} onPress={()=>setSelectedBatchId(batch.id)} style={[styles.choice,selectedBatchId===batch.id&&styles.choiceSelected]}><Text style={[styles.choiceText,selectedBatchId===batch.id&&styles.choiceTextSelected]}>{batch.name} · {batch.student_count}</Text></Pressable>)}</View></>}
          <Text style={styles.body}>Students receive a session alert, catch the rotating room Bluetooth signal, and complete blink and face verification. The server checks the selected subject, period, roster, device, and session window.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Start subject attendance session" accessibilityState={{disabled:busy||!durationValid||!selectedSlot||(chosenSubject.kind==='lab'&&subjectOptions.batches.length>0&&!selectedBatchId)}} disabled={busy||!durationValid||!selectedSlot||(chosenSubject.kind==='lab'&&subjectOptions.batches.length>0&&!selectedBatchId)} onPress={startSelectedSubject} style={[styles.button,(busy||!selectedSlot)&&styles.disabled]}><Text style={styles.buttonText}>{busy?'Starting…':'Start session'}</Text></Pressable>
        </>}
      </View>}
      {periods.map(period=><View key={period.timetable_id} style={styles.period}>
        <Text style={styles.subject}>{period.default_attendance?`Year ${period.year_number} · Section ${period.section_name}`:`${period.subject_name} · ${period.section_name}`}</Text>
        <Text style={styles.body}>{period.default_attendance?'Default attendance for your assigned class':`${period.start_time.slice(0,5)}–${period.end_time.slice(0,5)}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Start class attendance" accessibilityState={{disabled:busy||!durationValid||!!period.session_id}} disabled={busy||!durationValid||!!period.session_id} onPress={()=>void start(period)} style={[styles.button,(busy||!!period.session_id)&&styles.disabled]}><Text style={styles.buttonText}>{period.session_id?'Attendance already started':busy?'Starting…':'Start attendance'}</Text></Pressable>
      </View>)}
    </>}
    {coordinator&&active&&<View style={styles.period}>
      <Text style={styles.heading}>Present students</Text>
      <TextInput accessibilityLabel="Search present students by roll number" placeholder="Enter roll number" value={rollSearch} onChangeText={setRollSearch} autoCapitalize="none" style={[styles.secondary,{color:'#15233c'}]}/>
      {(counts?.present_students||[]).filter(student=>student.roll_number.toLowerCase().includes(rollSearch.trim().toLowerCase())).map(student=><View key={student.student_id}><Text style={styles.subject}>{student.roll_number} · {student.full_name}</Text><Text style={styles.body}>{student.status==='LATE'?'Present (Late)':'Present'}</Text></View>)}
      {counts?.present_students===undefined?<Text style={styles.body}>Waiting for the server to provide the present-student list.</Text>:!counts.present_students.some(student=>student.roll_number.toLowerCase().includes(rollSearch.trim().toLowerCase()))&&<Text style={styles.body}>{rollSearch?'No present student matches this roll number.':'No students have been marked present yet.'}</Text>}
    </View>}
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={()=>{proximity.retry();void refresh();void syncPush();}} style={styles.secondary}><Text style={styles.secondaryText}>Refresh attendance</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({successScreen:{backgroundColor:'#e2f5e9',borderColor:'#7cc49a'},card:{backgroundColor:'#fff',borderRadius:22,padding:24,gap:14,borderWidth:1,borderColor:'#e2e8f3'},heading:{fontSize:20,fontWeight:'700',color:'#15233c'},body:{fontSize:14,lineHeight:22,color:'#57657a'},timer:{fontSize:28,fontWeight:'800',color:'#185adb'},period:{gap:10,paddingVertical:8},subject:{fontSize:16,fontWeight:'600',color:'#15233c'},choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{paddingVertical:10,paddingHorizontal:12,borderRadius:10,borderWidth:1,borderColor:'#cbd5e1',backgroundColor:'#f8fafc'},choiceSelected:{borderColor:'#185adb',backgroundColor:'#eaf0fb'},choiceText:{fontSize:13,color:'#334155'},choiceTextSelected:{fontWeight:'700',color:'#174ea6'},button:{padding:15,borderRadius:12,backgroundColor:'#185adb',alignItems:'center'},buttonText:{color:'#fff',fontWeight:'700'},disabled:{opacity:.45},secondary:{padding:14,borderRadius:12,backgroundColor:'#eaf0fb',alignItems:'center'},secondaryText:{color:'#24549b',fontWeight:'600'},notice:{backgroundColor:'#fff4d7',padding:12,borderRadius:10,color:'#78510d',fontSize:13,lineHeight:20},success:{backgroundColor:'#e2f5e9',padding:12,borderRadius:10,color:'#17613a',fontSize:16,fontWeight:'700'},successMark:{alignSelf:'center',fontSize:36,fontWeight:'800',color:'#168447'},successTitle:{textAlign:'center',fontSize:20,fontWeight:'800',color:'#17613a'},error:{color:'#9b2828',fontSize:14,lineHeight:21}});
