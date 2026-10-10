package com.gvpcew.attendance
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Base64
class AttendanceRequestHashTest {
    @Test fun nativeDigestMatchesServerAndJavascriptSerializationFixture() {
        val canonical="[\"00000000-0000-4000-8000-000000000003\",\"00000000-0000-4000-8000-000000000001\",\"device_identifier_123\",\"00000000-0000-4000-8000-000000000002\",\"turn_left\",true,\"mobilefacenet-v1\",[1,-0.123456789,1.25e-7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],\"abcdef123456abcdef123456\",\"2026-10-10T00:00:01.000Z\",\"ble\"]"
        assertEquals("fPqCMHc76fny7-TGD2D7SDwL34mujHiKjzd7sthHkek",Base64.getUrlEncoder().withoutPadding().encodeToString(AttendanceRequestHash.digest(canonical)))
    }
}
