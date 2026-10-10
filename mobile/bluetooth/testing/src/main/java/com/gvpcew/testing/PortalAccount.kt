package com.gvpcew.testing

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Passwords are never stored. The access token is encrypted with Android Keystore. */
class PortalAccount(private val context: Context) {
    private val prefs = context.getSharedPreferences("portal_account", 0)
    private fun key(): SecretKey {
        val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (keys.getKey("gvpcew_portal", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder("gvpcew_portal", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }
    fun save(base: String, response: JSONObject) {
        clear()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(response.getString("token").toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("base", base).putString("user", response.getJSONObject("user").toString())
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()) { "Could not save sign-in." }
    }
    fun user(): JSONObject? = prefs.getString("user", null)?.let { JSONObject(it) }
    fun api(): PortalApi? {
        val raw = prefs.getString("token", null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)))
        }
        return PortalApi(prefs.getString("base", "").orEmpty(), String(cipher.doFinal(Base64.decode(raw, Base64.NO_WRAP)), Charsets.UTF_8))
    }
    fun clear() {
        prefs.edit().clear().commit()
        val scheduler = ReminderScheduler(context)
        scheduler.reconcileSources(emptySet())
        context.getSharedPreferences("portal_delivery", 0).edit().clear().commit()
        context.getSystemService(android.app.NotificationManager::class.java).cancelAll()
    }
}
