package com.gvpcew.testing

import org.junit.Assert.assertEquals
import org.junit.Test

class ReminderPolicyTest {
    @Test fun combinedReminderRespectsAllFourSwitchCombinations() {
        for (notifications in listOf(false, true)) for (alarms in listOf(false, true)) {
            assertEquals(Pair(notifications, alarms), ReminderPolicy.outputs("reminder", notifications, alarms))
        }
    }
    @Test fun individualTestsNeverTriggerTheOtherFeature() {
        assertEquals(Pair(true, false), ReminderPolicy.outputs("notification", true, true))
        assertEquals(Pair(false, true), ReminderPolicy.outputs("alarm", true, true))
        assertEquals(Pair(false, false), ReminderPolicy.outputs("alarm", true, false))
        assertEquals(Pair(false, false), ReminderPolicy.outputs("notification", false, true))
    }
}

