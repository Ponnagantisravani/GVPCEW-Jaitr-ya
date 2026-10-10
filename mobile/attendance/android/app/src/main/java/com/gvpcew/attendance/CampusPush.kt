package com.gvpcew.attendance

import android.content.Context
import android.app.NotificationManager
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.net.URI
import java.net.HttpURLConnection
import java.net.URL

object CampusPush {
    private const val STORE="campus_push"
    fun configured(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context)!=null
    fun save(context: Context,data: Map<String,String>): Boolean {
        val id=data["session_id"] ?: return false
        if(!Regex("[a-fA-F0-9-]{36}").matches(id)||data["type"]!="attendance_session")return false
        val session=SecureCampusStorage(context).session()?.let { JSONObject(it) } ?: return false
        if(data["user_id"]!=session.getJSONObject("user").getString("id"))return false
        val expires=try {java.time.Instant.parse(data["expires_at"]).toEpochMilli()}catch(_:Exception){return false}
        if(expires<=System.currentTimeMillis())return false
        context.getSharedPreferences(STORE,Context.MODE_PRIVATE).edit().putString("event",JSONObject(data).toString()).apply()
        return true
    }
    fun event(context: Context): String? {
        val value=context.getSharedPreferences(STORE,Context.MODE_PRIVATE).getString("event",null) ?: return null
        return try {
            val data=JSONObject(value)
            val session=SecureCampusStorage(context).session()?.let { JSONObject(it) }
            if(data.getString("user_id")!=session?.getJSONObject("user")?.getString("id")||java.time.Instant.parse(data.getString("expires_at")).toEpochMilli()<=System.currentTimeMillis()){clear(context);null}else value
        }catch(_:Exception){clear(context);null}
    }
    fun clear(context: Context) {
        context.getSharedPreferences(STORE,Context.MODE_PRIVATE).edit().clear().apply()
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
    }
    // Token refresh survives JS inactivity. Foreground synchronization retries network failures.
    fun register(context: Context,token: String) {
        var connection: HttpURLConnection?=null
        try {
            val secure=SecureCampusStorage(context)
            val session=secure.session()?.let { JSONObject(it) } ?: return
            val base=session.getString("apiBase");val uri=URI(base)
            require(uri.scheme=="https"&&!uri.host.isNullOrBlank()&&uri.userInfo==null&&uri.query==null&&uri.fragment==null&&uri.path.endsWith("/api"))
            connection=URL(base+"/devices/register-fcm").openConnection() as HttpURLConnection
            connection.instanceFollowRedirects=false;connection.connectTimeout=5000;connection.readTimeout=5000
            connection.requestMethod="POST";connection.doOutput=true
            connection.setRequestProperty("Authorization","Bearer "+session.getString("token"))
            connection.setRequestProperty("Content-Type","application/json")
            val bytes=JSONObject().put("device_id",secure.deviceId()).put("fcm_token",token).put("can_advertise",CampusBleService.canAdvertise(context)).toString().toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(bytes.size);connection.outputStream.use {it.write(bytes)}
            connection.responseCode
        }catch(_:Exception){ /* Retry at next foreground refresh; no token or JWT logging. */ }
        finally {connection?.disconnect()}
    }
}
