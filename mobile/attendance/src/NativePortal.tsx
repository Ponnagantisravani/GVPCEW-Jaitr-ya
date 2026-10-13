import React,{useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Session} from './types';
import {portalBootstrap,portalNavigationAllowed,portalOrigin,portalRoles} from './portal';
export default function NativePortal({session,role,onClose,onAttendance,onExpired}:{session:Session;role:string;onClose:()=>void;onAttendance:()=>void;onExpired:()=>void}){
 const [error,setError]=useState('');
 const ready=useRef(false);
 const origin=portalOrigin(session),html=portalBootstrap(session,role);
 return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.root}>
  <View style={styles.bar}><Text style={styles.title}>{portalRoles[role].label}</Text><Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.close}>Back to app</Text></Pressable></View>
  {!!error&&<View style={styles.error}><Text>{error}</Text></View>}
  <WebView source={{html,baseUrl:origin+'/'}} style={styles.web} originWhitelist={[origin]} javaScriptEnabled domStorageEnabled
   mixedContentMode="never" allowFileAccess={false} thirdPartyCookiesEnabled={false} setSupportMultipleWindows={false}
   injectedJavaScriptObject={{campusSession:{token:session.token,user:session.user,activeRole:role}}}
   startInLoadingState renderLoading={()=> <ActivityIndicator style={styles.loading}/>}
   onMessage={event=>{try{const m=JSON.parse(event.nativeEvent.data);if(m.type==='portal-ready')ready.current=true;else if(m.type==='open-attendance')onAttendance();else if(m.type==='signed-out')onExpired();}catch{}}}
   onShouldStartLoadWithRequest={request=>{
    if(!portalNavigationAllowed(session,request.url))return false;
    const path=new URL(request.url).pathname;
    if((path==='/'&&ready.current)||path==='/index.html'||path==='/login'){onExpired();return false;}
    return true;
   }}
   onError={()=>setError('Could not open the campus dashboard. Check your connection and campus server address.')}
   onHttpError={event=>{if(event.nativeEvent.statusCode>=400)setError('The campus server could not load this dashboard. Please retry.');}}/>
 </SafeAreaView></Modal>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#fff'},bar:{padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,backgroundColor:'#f3f6fc'},title:{fontWeight:'700',color:'#15233c',flex:1},close:{color:'#185adb',fontWeight:'600'},web:{flex:1},loading:{position:'absolute',top:'50%',left:'50%'},error:{padding:14,backgroundColor:'#fce9e9'}});
