package com.gvpcew.testing

import android.os.ParcelUuid
import java.util.UUID

/** Shared wire format. No GATT connection, device name, MAC identity or pairing needed. */
object BleProtocol {
    val SERVICE_UUID: ParcelUuid = ParcelUuid(UUID.fromString("a31f7201-8e9b-4b35-93f0-67ed21c409aa"))
    fun normalize(input: String): String = StudentId.normalize(input)
    fun isValid(id: String): Boolean = StudentId.valid(id)

    // 128-bit service-data AD field = 2-byte header + 16-byte UUID + ID.
    // Reserving 3 bytes for flags leaves 10 bytes for ID in a 31-byte legacy packet.
    // Do not add device name, TX power, or a separate service UUID AD field.
    fun encode(id: String): ByteArray {
        require(isValid(id))
        return id.toByteArray(Charsets.US_ASCII)
    }

    fun decode(bytes: ByteArray?): String? {
        if (bytes == null || bytes.size !in 1..10) return null
        val id = bytes.toString(Charsets.US_ASCII)
        return id.takeIf(::isValid)
    }
}

