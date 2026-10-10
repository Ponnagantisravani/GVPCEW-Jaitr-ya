package com.gvpcew.testing

import android.app.*
import android.content.*
import android.media.*
import android.os.*

class NotificationService(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    init {
        manager.createNotificationChannel(NotificationChannel("reminders", "College notifications & reminders", NotificationManager.IMPORTANCE_HIGH))
        manager.createNotificationChannel(NotificationChannel("alarm_service", "Alarm playback", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
    }
    fun available() = manager.areNotificationsEnabled() && manager.getNotificationChannel("reminders").importance != NotificationManager.IMPORTANCE_NONE
    fun build(title: String, message: String): Notification = Notification.Builder(context, "reminders")
        .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(message)
        .setContentIntent(PendingIntent.getActivity(context, 0, Intent(context, DashboardActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
        .setAutoCancel(true).build()
    fun send(id: Int, title: String, message: String): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            SettingsStorage(context).log("Notification permission denied")
            return false
        }
        if (!available()) { SettingsStorage(context).log("Notification blocked by permission/channel"); return false }
        manager.notify(id, build(title, message))
        SettingsStorage(context).log("Notification #$id posted to Android")
        return true
    }
}

class AlarmService : Service() {
    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private val timeout = Runnable { stopSelf() }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { stopSelf(); return START_NOT_STICKY }
        NotificationService(this)
        val stop = PendingIntent.getService(this, 0, Intent(this, AlarmService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "alarm_service").setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(intent?.getStringExtra("title") ?: "Test alarm")
            .setContentText("Alarm playing; stops after 30 seconds").setOngoing(true)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause, "Stop alarm", stop).build()).build()
        startForeground(900000, notification)
        if (!SettingsStorage(this).enabled("alarms")) { stopSelf(); return START_NOT_STICKY }
        try {
            player?.release()
            player = MediaPlayer().apply {
                setWakeMode(this@AlarmService, PowerManager.PARTIAL_WAKE_LOCK)
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(this@AlarmService, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                isLooping = true
                prepare()
                start()
            }
            SettingsStorage(this).log("Alarm playback started")
            handler.removeCallbacks(timeout)
            handler.postDelayed(timeout, 30000)
        } catch (e: Exception) { SettingsStorage(this).log("Alarm failed: ${e.message}"); stopSelf() }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        player?.release()
        stopForeground(STOP_FOREGROUND_REMOVE)
        SettingsStorage(this).log("Alarm playback stopped")
        super.onDestroy()
    }
}

