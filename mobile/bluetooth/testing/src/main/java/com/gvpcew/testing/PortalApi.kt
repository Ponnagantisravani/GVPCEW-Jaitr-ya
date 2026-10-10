package com.gvpcew.testing

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** Coordinator credentials stay in memory and never cross Bluetooth. */
class PortalApi(val base: String, private val token: String = "") {
    init {
        val uri = URI(base)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null) {
            "Enter the college HTTPS API address, ending in /api."
        }
    }
    fun call(method: String, path: String, body: JSONObject? = null): JSONObject {
        val connection = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 25_000
            connection.setRequestProperty("Accept", "application/json")
            if (token.isNotEmpty()) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val result = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (code !in 200..299) throw PortalHttpException(code, result.optString("message", "College server unavailable ($code). Retry."))
            return result
        } finally { connection.disconnect() }
    }
}
class PortalHttpException(val status: Int, message: String) : IllegalStateException(message)
