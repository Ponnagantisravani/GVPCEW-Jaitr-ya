package com.gvpcew.attendance

import java.net.URI
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject
import android.app.Activity
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CampusNativeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val storage = SecureCampusStorage(context)
    private var capture: Promise? = null
    private var attendanceCapture: Promise? = null
    private val integrity=CampusIntegrity(context)
    private val attendanceCode=7022
    private val network = Executors.newFixedThreadPool(2)
    private val requestCode = 7021
    init {
        context.addActivityEventListener(object: BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity, code: Int, result: Int, data: Intent?) {
                if(code==attendanceCode) {
                    val pending=attendanceCapture ?: return;attendanceCapture=null
                    val payload=data?.getStringExtra("attendance")
                    if(result==Activity.RESULT_OK && payload!=null)pending.resolve(payload)
                    else pending.reject(data?.getStringExtra("error_code") ?: "CAPTURE_CANCELLED",data?.getStringExtra("error") ?: "Face verification cancelled.")
                    return
                }
                if(code != requestCode) return
                val pending = capture ?: return; capture = null
                val payload = data?.getStringExtra("enrollment")
                if(result == Activity.RESULT_OK && payload != null) pending.resolve(payload)
                else pending.reject("CAPTURE_CANCELLED",data?.getStringExtra("error") ?: "Face registration cancelled. Try again when ready.")
            }
        })
    }
    override fun getName() = "CampusNative"
    private fun call(promise: Promise, block: () -> Any?) { try { promise.resolve(block()) } catch(_: Exception) { promise.reject("SECURE_STORAGE","Secure device storage is unavailable. Restart the app and try again.") } }
    @ReactMethod fun getDeviceId(promise: Promise) = call(promise) { storage.deviceId() }
    @ReactMethod fun getSession(promise: Promise) = call(promise) { storage.session() }
    @ReactMethod fun saveSession(value: String,promise: Promise) = call(promise) { storage.saveSession(value); true }
    @ReactMethod fun clearSession(promise: Promise) = call(promise) { CampusBleService.stop(context); FaceAttendanceActivity.cancelCurrent();integrity.clear();storage.clearSession(); true }
    @ReactMethod fun permissionsPrompted(promise: Promise) = call(promise) { storage.prompted() }
    @ReactMethod fun markPermissionsPrompted(promise: Promise) = call(promise) { storage.markPrompted(); true }
    @ReactMethod fun enrollFace(promise: Promise) {
        val activity = context.currentActivity
        if(activity == null) { promise.reject("NO_ACTIVITY","Open the app to register your face."); return }
        if(ContextCompat.checkSelfPermission(context,Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("CAMERA_DENIED","Enable Camera in app settings before registration."); return
        }
        activity.runOnUiThread {
            if(capture != null || attendanceCapture != null) { promise.reject("CAPTURE_BUSY","Face camera is already open."); return@runOnUiThread }
            capture = promise
            try { activity.startActivityForResult(Intent(activity,FaceEnrollmentActivity::class.java),requestCode) }
            catch(_: Exception) { capture = null; promise.reject("CAMERA_UNAVAILABLE","Front camera could not open.") }
        }
    }
    @ReactMethod fun captureAttendance(type: String,validFor: Double,ownTemplate: String,minimum: Double,promise: Promise) {
        val activity=context.currentActivity
        if(activity==null) { promise.reject("NO_ACTIVITY","Open the campus app to verify attendance.");return }
        if(type != "blink" || !validFor.isFinite() || validFor<=0 || validFor>6000) { promise.reject("CHALLENGE_EXPIRED","Attendance challenge expired. Retry while your window is open.");return }
        if(ContextCompat.checkSelfPermission(context,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) { promise.reject("CAMERA_DENIED","Enable Camera in app settings and retry attendance.");return }
        val template=try { val values=org.json.JSONArray(ownTemplate);require(values.length()==192 && minimum.isFinite() && minimum>0 && minimum<1)
            FloatArray(192) { values.getDouble(it).toFloat() }.also { require(it.all { value -> value.isFinite() } && it.any { value -> value!=0f }) }
        } catch(_: Exception) { promise.reject("FACE_CONFIG","Your enrolled face template is unavailable.");return }
        val deadline=android.os.SystemClock.elapsedRealtime()+validFor.toLong()
        activity.runOnUiThread {
            if(capture!=null || attendanceCapture!=null) { promise.reject("CAPTURE_BUSY","Face camera is already open.");return@runOnUiThread }
            attendanceCapture=promise
            try { activity.startActivityForResult(Intent(activity,FaceAttendanceActivity::class.java).putExtra("challenge_type",type).putExtra("deadline",deadline).putExtra("own_template",template).putExtra("similarity_threshold",minimum),attendanceCode) }
            catch(_: Exception) { attendanceCapture=null;promise.reject("CAMERA_UNAVAILABLE","Front camera could not open.") }
        }
    }
    @ReactMethod fun cancelAttendance(promise: Promise) { FaceAttendanceActivity.cancelCurrent();promise.resolve(true) }
    @ReactMethod fun prepareIntegrity(project: String,promise: Promise) {
        try { integrity.prepare(project).addOnCompleteListener { task -> if(task.isSuccessful)promise.resolve(true) else promise.reject("INTEGRITY_UNAVAILABLE","Play Integrity could not prepare. Check Google Play services and your connection, then retry.") } }
        catch(_: Exception) { promise.reject("INTEGRITY_CONFIG","Play Integrity is not configured for this app.") }
    }
    @ReactMethod fun requestIntegrity(canonical: String,promise: Promise) {
        try { integrity.request(canonical).addOnCompleteListener { task -> if(task.isSuccessful)promise.resolve(task.result.token()) else promise.reject("INTEGRITY_UNAVAILABLE","Play Integrity could not verify this app and device. Retry with the official campus app on a certified phone.") } }
        catch(_: Exception) { promise.reject("INTEGRITY_UNAVAILABLE","Prepare Play Integrity before checking attendance.") }
    }
    @ReactMethod fun request(base: String,route: String,token: String,body: String?,promise: Promise) {
        network.execute {
            var connection: HttpURLConnection? = null
            try {
                val uri = URI(base)
                require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null && uri.path.endsWith("/api"))
                require(route.startsWith("/") && !route.startsWith("//"))
                connection = URL(base.trimEnd('/')+route).openConnection() as HttpURLConnection
                val c = connection
                c.instanceFollowRedirects=false;c.connectTimeout=10000;c.readTimeout=20000
                c.requestMethod=if(body==null)"GET" else "POST"
                c.setRequestProperty("Accept","application/json")
                if(token.isNotBlank())c.setRequestProperty("Authorization","Bearer "+token)
                if(body!=null) {
                    c.doOutput=true;c.setRequestProperty("Content-Type","application/json")
                    val bytes=body.toByteArray(Charsets.UTF_8);c.setFixedLengthStreamingMode(bytes.size)
                    c.outputStream.use { it.write(bytes) }
                }
                val status=c.responseCode
                val stream=if(status in 200..299)c.inputStream else c.errorStream
                val bytes=stream?.use { input ->
                    val output=java.io.ByteArrayOutputStream()
                    val chunk=ByteArray(8192)
                    while(true) {
                        val count=input.read(chunk)
                        if(count<0)break
                        require(output.size()+count <= 1048576)
                        output.write(chunk,0,count)
                    }
                    output.toByteArray()
                } ?: ByteArray(0)
                promise.resolve(JSONObject().put("status",status).put("body",String(bytes,Charsets.UTF_8)).toString())
            } catch(_: Exception) { promise.reject("NETWORK","Could not reach the campus server. Check your connection and try again.") }
            finally { connection?.disconnect() }
        }
    }
    @ReactMethod fun getFcmToken(promise: Promise) {
        try {
            if(!CampusPush.configured(context)){promise.reject("FCM_CONFIG","Campus notifications are not configured yet.");return}
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if(task.isSuccessful)promise.resolve(task.result) else promise.reject("FCM_TOKEN","Could not register notifications. Check Google Play services and your connection.")
            }
        }catch(_:Exception){promise.reject("FCM_CONFIG","Campus notifications are not configured yet.")}
    }
    @ReactMethod fun getPushEvent(promise: Promise)=call(promise){CampusPush.event(context)}
    @ReactMethod fun clearPushState(promise: Promise)=call(promise){CampusPush.clear(context);true}
    @ReactMethod fun canBleAdvertise(promise: Promise)=call(promise){CampusBleService.canAdvertise(context)}
    @ReactMethod fun startBleBroadcast(id: String,expires: String,promise: Promise)=call(promise){
        val session=storage.session()?.let {JSONObject(it)} ?: throw IllegalStateException()
        CampusBleService.start(context,id,expires,session.getJSONObject("user").getString("id"))
    }
    @ReactMethod fun stopBleBroadcast(promise: Promise)=call(promise){CampusBleService.stop(context);true}
    @ReactMethod fun isBleBroadcastRunning(id: String,promise: Promise)=call(promise){CampusBleService.running==id}
    @ReactMethod fun getBleBroadcastStatus(promise: Promise)=call(promise){CampusBleService.status(context).toString()}
    @ReactMethod fun setBleBroadcastStatus(id: String,state: String,message: String,promise: Promise)=call(promise){
        if(CampusBleService.running==id)CampusBleService.publish(context,id,state,message.take(240));true
    }
    override fun invalidate() { FaceAttendanceActivity.cancelCurrent();integrity.clear();attendanceCapture?.reject("APP_CLOSED","Face verification interrupted.");attendanceCapture=null;capture?.reject("APP_CLOSED","Face registration interrupted.");capture=null;network.shutdown();super.invalidate() }
}
