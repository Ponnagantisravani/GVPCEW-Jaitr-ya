package com.gvpcew.attendance

import android.content.Context
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureCampusStorage(private val context: Context) {
    private val preferences = context.getSharedPreferences("campus_private",Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey("campus_session_v1",null) as? SecretKey
        if(existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder("campus_session_v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        return generator.generateKey()
    }
    @Synchronized fun saveSession(value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        check(preferences.edit().putString("iv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP))
            .putString("session",Base64.encodeToString(encrypted,Base64.NO_WRAP)).commit())
    }
    @Synchronized fun session(): String? {
        val value = preferences.getString("session",null) ?: return null
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(preferences.getString("iv",null),Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)),Charsets.UTF_8)
        } catch (_: Exception) { clearSession(); null }
    }
    @Synchronized fun clearSession() { check(preferences.edit().remove("iv").remove("session").commit()) }
    fun prompted() = preferences.getBoolean("permissions_prompted",false)
    fun markPrompted() { check(preferences.edit().putBoolean("permissions_prompted",true).commit()) }
    fun deviceId(): String {
        val androidId = Settings.Secure.getString(context.contentResolver,Settings.Secure.ANDROID_ID)
        require(!androidId.isNullOrBlank()) { "Device identifier unavailable" }
        return MessageDigest.getInstance("SHA-256").digest((context.packageName+":"+androidId).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 255) }
    }
}
