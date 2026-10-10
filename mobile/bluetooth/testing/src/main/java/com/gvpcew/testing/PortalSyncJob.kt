package com.gvpcew.testing

import android.app.job.*
import android.content.ComponentName
import android.content.Context
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.Future

object PortalSync {
    @Synchronized fun run(context: Context): String {
        val api = PortalAccount(context).api() ?: return "Sign in to sync your college account."
        val feed = api.call("GET", "/notifications/mobile-feed")
        val store = SettingsStorage(context)
        val delivered = context.getSharedPreferences("portal_delivery", 0)
        val service = NotificationService(context)
        val notifications = feed.getJSONArray("notifications")
        for (i in 0 until notifications.length()) {
            val item = notifications.getJSONObject(i)
            val id = item.getString("id")
            if (item.isNull("read_at") && !delivered.getBoolean(id, false) && store.enabled("notifications")) {
                if (service.send((id.hashCode() and 0x3fffffff) + 1_000_000, item.getString("title"), item.getString("body")))
                    delivered.edit().putBoolean(id, true).apply()
            }
        }
        val scheduler = ReminderScheduler(context)
        val reminders = feed.getJSONArray("reminders")
        val sources = (0 until reminders.length()).map { reminders.getJSONObject(it).getString("source") }.toSet()
        scheduler.reconcileSources(sources)
        if (!scheduler.available()) return "Notifications synced. Allow Alarms & reminders to schedule class reminders."
        for (i in 0 until reminders.length()) {
            val item = reminders.getJSONObject(i)
            val time = Instant.parse(item.getString("scheduled_for")).toEpochMilli()
            if (time > System.currentTimeMillis()) scheduler.schedule("reminder", time, item.getString("title"), item.getString("body"), item.getString("source"))
        }
        val message = "Synced ${reminders.length()} upcoming reminders. Classes alert 5 minutes before start (college time)."
        delivered.edit().putString("status", message).putLong("lastSync", System.currentTimeMillis()).apply()
        return message
    }
}

class PortalSyncJob : JobService() {
    private val worker = Executors.newSingleThreadExecutor()
    private var task: Future<*>? = null
    override fun onStartJob(params: JobParameters): Boolean {
        task = worker.submit {
            var retry = false
            try { PortalSync.run(this) }
            catch (e: Exception) {
                retry = true
                SettingsStorage(this).log("College sync: ${e.message}")
                getSharedPreferences("portal_delivery", 0).edit().putString("status", "Sync failed. Open College account and sign in again if your session expired.").apply()
            }
            jobFinished(params, retry)
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { task?.cancel(true); return true }
    override fun onDestroy() { worker.shutdownNow(); super.onDestroy() }
    companion object {
        fun schedule(context: Context) {
            if (PortalAccount(context).user() == null) return
            val scheduler = context.getSystemService(JobScheduler::class.java)
            if (scheduler.getPendingJob(4101) == null) scheduler.schedule(JobInfo.Builder(4101, ComponentName(context, PortalSyncJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15 * 60_000L).setPersisted(true).build())
        }
    }
}
