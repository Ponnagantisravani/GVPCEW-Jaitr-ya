package com.gvpcew.testing

object ReminderPolicy {
    /** The switches are evaluated again at delivery, so OFF suppresses queued work. */
    fun outputs(kind: String, notifications: Boolean, alarms: Boolean): Pair<Boolean, Boolean> {
        require(kind in setOf("notification", "alarm", "reminder"))
        return Pair(kind != "alarm" && notifications, kind != "notification" && alarms)
    }
}
