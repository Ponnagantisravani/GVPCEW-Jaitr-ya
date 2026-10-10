package com.gvpcew.attendance

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.vitorpamplona.bleavertiser.BLEAdvertiserModule
import org.json.JSONObject

class CampusBleService : HeadlessJsTaskService() {
    private val handler=Handler(Looper.getMainLooper())
    private var owned: String?=null
    override fun onStartCommand(intent: Intent?,flags: Int,startId: Int): Int {
        val request=intent ?: run {stopSelf();return START_NOT_STICKY}
        val id=request.getStringExtra("session_id") ?: run {stopSelf();return START_NOT_STICKY}
        if(owned==id)return START_NOT_STICKY
        if(owned!=null)return START_NOT_STICKY
        try {
            val stored=SecureCampusStorage(this).session()?.let {JSONObject(it)}
            require(stored?.getJSONObject("user")?.getString("id")==request.getStringExtra("user_id"))
            val until=java.time.Instant.parse(request.getStringExtra("expires_at")).toEpochMilli()
            val duration=(until-System.currentTimeMillis()).coerceAtMost(60000)
            require(duration>0)
            val manager=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("attendance_ble","Attendance Bluetooth",NotificationManager.IMPORTANCE_LOW))
            val tap=PendingIntent.getActivity(this,410,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notice=NotificationCompat.Builder(this,"attendance_ble").setSmallIcon(R.drawable.ic_attendance_notification).setContentTitle("Class attendance Bluetooth")
                .setContentText("Helping your classmates find the attendance signal.").setContentIntent(tap).setOngoing(true).build()
            if(Build.VERSION.SDK_INT>=29)startForeground(410,notice,ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(410,notice)
            owned=id;running=id;publish(this,id,"starting","")
            handler.postDelayed({stopSelf()},duration)
            super.onStartCommand(intent,flags,startId)
        }catch(_:Exception){publish(this,id,"failed","Bluetooth broadcasting could not start. Open the app and check Bluetooth permissions.");stopSelf()}
        return START_NOT_STICKY
    }
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        if(intent==null||owned==null)return null
        val data=Arguments.createMap().apply {putString("session_id",owned);putString("expires_at",intent.getStringExtra("expires_at"));putString("user_id",intent.getStringExtra("user_id"))}
        return HeadlessJsTaskConfig("CampusBleBroadcast",data,65000,true)
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        BLEAdvertiserModule.stopAllAdvertising()
        if(running==owned)running=null
        val current=status(this)
        if(current.optString("state")!="failed")publish(this,owned,"stopped","")
        if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
    companion object {
        @Volatile var running: String?=null
        fun canAdvertise(context: Context): Boolean = try {
            if(Build.VERSION.SDK_INT>=31&&ContextCompat.checkSelfPermission(context,Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED)false
            else (context.getSystemService(Context.BLUETOOTH_SERVICE) as android.bluetooth.BluetoothManager).adapter?.isMultipleAdvertisementSupported==true
        }catch(_:Exception){false}
        fun start(context: Context,id: String,expires: String,user: String): Boolean {
            try {
                require(Regex("[a-fA-F0-9-]{36}").matches(id))
                if(running==id)return true
                require(running==null)
                if(Build.VERSION.SDK_INT>=31)require(ContextCompat.checkSelfPermission(context,Manifest.permission.BLUETOOTH_ADVERTISE)==PackageManager.PERMISSION_GRANTED&&ContextCompat.checkSelfPermission(context,Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED)
                val intent=Intent(context,CampusBleService::class.java).putExtra("session_id",id).putExtra("expires_at",expires).putExtra("user_id",user)
                ContextCompat.startForegroundService(context,intent)
                return true
            }catch(_:Exception){publish(context,id,"failed","Open the app to start Bluetooth broadcasting. Check Bluetooth permissions.");return false}
        }
        fun stop(context: Context) {
            running=null;BLEAdvertiserModule.stopAllAdvertising()
            context.stopService(Intent(context,CampusBleService::class.java))
            publish(context,null,"stopped","")
        }
        fun publish(context: Context,id: String?,state: String,message: String) {
            require(state in listOf("starting","broadcasting","failed","stopped"))
            context.getSharedPreferences("campus_ble",Context.MODE_PRIVATE).edit().putString("status",JSONObject().put("session_id",id?:JSONObject.NULL).put("state",state).put("message",message).toString()).apply()
        }
        fun status(context: Context): JSONObject = try {
            JSONObject(context.getSharedPreferences("campus_ble",Context.MODE_PRIVATE).getString("status",null)?:"{\"session_id\":null,\"state\":\"stopped\",\"message\":\"\"}")
        }catch(_:Exception){JSONObject().put("state","stopped")}
    }
}
