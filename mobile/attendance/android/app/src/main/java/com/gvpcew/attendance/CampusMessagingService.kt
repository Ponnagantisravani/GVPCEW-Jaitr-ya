package com.gvpcew.attendance

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class CampusMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {CampusPush.register(this,token)}
    override fun onMessageReceived(message: RemoteMessage) {
        try {
            val data=message.data
            if(!CampusPush.save(this,data))return
            val manager=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("attendance","Class attendance",NotificationManager.IMPORTANCE_HIGH))
            if(data["broadcast"]=="true"&&message.priority==RemoteMessage.PRIORITY_HIGH)CampusBleService.start(this,data.getValue("session_id"),data.getValue("expires_at"),data.getValue("user_id"))
            if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
            val id=data.getValue("session_id").hashCode()
            val intent=Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            data.forEach { (key,value) -> intent.putExtra(key,value) }
            val tap=PendingIntent.getActivity(this,id,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val remaining=java.time.Instant.parse(data.getValue("expires_at")).toEpochMilli()-System.currentTimeMillis()
            val notification=NotificationCompat.Builder(this,"attendance").setSmallIcon(R.drawable.ic_attendance_notification)
                .setContentTitle("Attendance is open").setContentText("Tap to open your class attendance.")
                .setPriority(NotificationCompat.PRIORITY_HIGH).setContentIntent(tap).setAutoCancel(true).setTimeoutAfter(remaining.coerceAtLeast(1)).build()
            NotificationManagerCompat.from(this).notify(id,notification)
            // Push never opens the camera; server authorizes the broadcaster token request.
        }catch(_:Exception){ /* Reject malformed/expired messages without logging account data. */ }
    }
}
