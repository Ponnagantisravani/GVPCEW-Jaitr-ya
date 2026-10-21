import React,{useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Modal,StyleSheet,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Session} from './types';
import {portalLoginAddress,portalNavigationAllowed} from './portal';
import {API_BASE_URL} from './config';
export default function NativeLoginPortal({apiBase,onLogin}:{apiBase:string;onLogin:(session:Session)=>void}){
 const [error,setError]=useState('');
 const webView=useRef<WebView<{}>>(null),handled=useRef(false);
 const address=useMemo(()=>portalLoginAddress(apiBase),[apiBase]),origin=new URL(address).origin;
 function capturePortalSession(){webView.current?.injectJavaScript(`(()=>{try{const s=JSON.parse(localStorage.getItem('gvpcew_session')||'null');if(s?.token&&s?.user?.roles?.length)window.ReactNativeWebView.postMessage(JSON.stringify({type:'campus-login',session:{...s,apiBase:s.apiBase||${JSON.stringify(API_BASE_URL)}}}));}catch{}})();true;`);}
 return <Modal visible animationType="fade" onRequestClose={()=>{}}><SafeAreaView style={styles.root}>
  {!!error&&<View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
  <WebView ref={webView} source={{uri:address}} style={styles.web} originWhitelist={[origin]} javaScriptEnabled domStorageEnabled
   mixedContentMode="never" allowFileAccess={false} thirdPartyCookiesEnabled={false} setSupportMultipleWindows={false}
   startInLoadingState renderLoading={()=> <ActivityIndicator style={styles.loading}/>}
   onMessage={event=>{try{const message=JSON.parse(event.nativeEvent.data);if(message.type!=='campus-login'||handled.current)return;const value=message.session;if(!value?.token||!value?.user||!Array.isArray(value.user.roles)||!value.user.roles.length)throw Error('The campus portal returned an incomplete sign-in. Please retry.');handled.current=true;onLogin({...value,apiBase:value.apiBase||API_BASE_URL} as Session);}catch(e){setError(e instanceof Error?e.message:'Unable to complete campus sign-in.');}}}
   onNavigationStateChange={state=>{if(state.url.startsWith(origin+'/')||state.url===origin)capturePortalSession();}}
   onLoadEnd={capturePortalSession}
   onShouldStartLoadWithRequest={request=>portalNavigationAllowed({apiBase},request.url)}
   onError={()=>setError('Could not open the campus portal. Check your connection and campus server address.')}
   onHttpError={event=>{if(event.nativeEvent.statusCode>=400)setError('The campus portal could not load. Check your server address and retry.');}}/>
 </SafeAreaView></Modal>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#f4f7f6'},web:{flex:1,backgroundColor:'#f4f7f6'},loading:{position:'absolute',top:'50%',left:'50%'},error:{padding:12,backgroundColor:'#fce9e9'},errorText:{color:'#9b2828'}});
