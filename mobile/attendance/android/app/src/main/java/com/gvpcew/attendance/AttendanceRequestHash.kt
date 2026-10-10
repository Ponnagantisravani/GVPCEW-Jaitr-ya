package com.gvpcew.attendance
import java.security.MessageDigest
object AttendanceRequestHash {
    fun digest(canonical: String): ByteArray=MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
}
