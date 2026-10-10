package com.gvpcew.testing

import android.app.*
import android.content.*
import android.os.Build
import org.json.JSONObject

class ReminderScheduler(private val context: Context) {
    private val store = SettingsStorage(context)
    private val manager = context.getSystemService(AlarmManager::class.java)
    fun available() = Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms()
    fun restore() {
        if (!available()) return
        for ((key, value) in store.prefs.all.filterKeys { it.startsWith("job_") }) {
            runCatching {
                val data = JSONObject(value as String)
                val time = data.getLong("time")
                if (time <= System.currentTimeMillis()) store.prefs.edit().remove(key).apply()
                else manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pending(key.removePrefix("job_").toInt()))
            }.onFailure { store.log("Could not restore reminder: ${it.message}") }
        }
    }
    private fun pending(id: Int) = PendingIntent.getBroadcast(context, id,
        Intent(context, ReminderReceiver::class.java).putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun schedule(kind: String, time: Long, title: String, message: String, source: String = "") {
        synchronized(store.prefs) {
        val outputs = ReminderPolicy.outputs(kind, store.enabled("notifications"), store.enabled("alarms"))
        if (!outputs.first && !outputs.second) { store.log("$kind skipped: switches OFF"); return }
        require(time > System.currentTimeMillis()) { "Choose a future date and time" }
        check(available()) { "Allow Alarms & reminders in Android settings first" }
        val existing = if (source.isEmpty()) null else store.prefs.all.entries.firstOrNull { it.key.startsWith("job_") && runCatching { JSONObject(it.value as String).optString("source") == source }.getOrDefault(false) }
        if (existing != null) {
            val previous = JSONObject(existing.value as String)
            if (previous.optLong("time") == time && previous.optString("title") == title && previous.optString("message") == message) return
            manager.cancel(pending(existing.key.removePrefix("job_").toInt()))
            store.prefs.edit().remove(existing.key).commit()
        }
        val id = store.prefs.getInt("nextId", 1)
        val data = JSONObject().put("kind", kind).put("time", time).put("title", title).put("message", message).put("source", source)
        store.prefs.edit().putInt("nextId", id + 1).putString("job_$id", data.toString()).commit()
        try {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pending(id))
            store.log("Scheduled $kind #$id for ${java.util.Date(time)}")
        } catch (e: Exception) {
            store.prefs.edit().remove("job_$id").apply()
            throw e
        }
        }
    }
    fun count(kind: String) = store.prefs.all.count { it.key.startsWith("job_") && JSONObject(it.value as String).getString("kind") == kind }
    fun reconcileSources(sources: Set<String>) {
        store.prefs.all.filterKeys { it.startsWith("job_") }.forEach { (key, value) ->
            val source = JSONObject(value as String).optString("source")
            if ((source.startsWith("timetable:") || source.startsWith("personal:")) && source !in sources) {
                manager.cancel(pending(key.removePrefix("job_").toInt()))
                store.prefs.edit().remove(key).apply()
            }
        }
    }
    fun cancel(kind: String) {
        store.prefs.all.filter { it.key.startsWith("job_") && JSONObject(it.value as String).getString("kind") == kind }.forEach {
            manager.cancel(pending(it.key.removePrefix("job_").toInt()))
            store.prefs.edit().remove(it.key).apply()
        }
        store.log("Cancelled pending $kind tests")
    }
}

class ReminderRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        ReminderScheduler(context).restore()
        PortalSyncJob.schedule(context)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = SettingsStorage(context)
        val id = intent.getIntExtra("id", -1)
        val raw = store.prefs.getString("job_$id", null) ?: return
        store.prefs.edit().remove("job_$id").commit()
        val job = JSONObject(raw)
        val kind = job.getString("kind")
        val title = job.getString("title")
        val message = job.getString("message")
        val outputs = ReminderPolicy.outputs(kind, store.enabled("notifications"), store.enabled("alarms"))
        try {
            if (outputs.first) {
                val source = job.optString("source")
                val notificationId = if (source.startsWith("personal:")) (source.removePrefix("personal:").hashCode() and 0x3fffffff) + 1_000_000 else id
                if (NotificationService(context).send(notificationId, title, message) && source.startsWith("personal:"))
                    context.getSharedPreferences("portal_delivery", 0).edit().putBoolean(source.removePrefix("personal:"), true).apply()
            }
            if (outputs.second) context.startForegroundService(
                Intent(context, AlarmService::class.java).putExtra("title", title))
            store.log("Processed $kind #$id with current switches")
        } catch (e: Exception) { store.log("Delivery error: ${e.message}") }
    }
}
