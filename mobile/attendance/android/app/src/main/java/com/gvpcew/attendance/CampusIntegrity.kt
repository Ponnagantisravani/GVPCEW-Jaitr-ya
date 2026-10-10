package com.gvpcew.attendance

import android.content.Context
import android.os.SystemClock
import android.util.Base64
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityException
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.google.android.play.core.integrity.model.StandardIntegrityErrorCode

/** Provider in memory only. Server decodes the opaque token; the app never accepts its own verdict. */
class CampusIntegrity(context: Context) {
    private val manager=IntegrityManagerFactory.createStandard(context.applicationContext)
    private var project=0L
    private var readyAt=0L
    private var provider: StandardIntegrityManager.StandardIntegrityTokenProvider?=null
    private var preparing: Task<StandardIntegrityManager.StandardIntegrityTokenProvider>?=null
    @Synchronized fun clear() { project=0;readyAt=0;provider=null;preparing=null }
    @Synchronized fun prepare(number: String): Task<StandardIntegrityManager.StandardIntegrityTokenProvider> {
        require(number.matches(Regex("[1-9][0-9]{5,17}"))) { "Integrity project is not configured." }
        val value=number.toLong()
        if(project==value && provider!=null && SystemClock.elapsedRealtime()-readyAt<300000)return Tasks.forResult(provider!!)
        if(project==value && preparing!=null)return preparing!!
        provider=null;project=value
        val task=manager.prepareIntegrityToken(StandardIntegrityManager.PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(value).build())
        preparing=task
        task.addOnCompleteListener { result -> synchronized(this) {
            if(preparing===task) { preparing=null;if(result.isSuccessful && project==value) { provider=result.result;readyAt=SystemClock.elapsedRealtime() } }
        } }
        return task
    }
    fun request(canonical: String): Task<StandardIntegrityManager.StandardIntegrityToken> {
        require(canonical.toByteArray(Charsets.UTF_8).size in 1..20000)
        val hash=Base64.encodeToString(AttendanceRequestHash.digest(canonical),Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        val snapshot=synchronized(this) { Pair(provider,project) }
        val current=requireNotNull(snapshot.first) { "Prepare Play Integrity before attendance." }
        val request=StandardIntegrityManager.StandardIntegrityTokenRequest.builder().setRequestHash(hash).build()
        return current.request(request).continueWithTask { result ->
            val error=result.exception
            if(!result.isSuccessful && error is StandardIntegrityException && error.errorCode==StandardIntegrityErrorCode.INTEGRITY_TOKEN_PROVIDER_INVALID) {
                synchronized(this) { if(provider===current) { provider=null;readyAt=0 } }
                prepare(snapshot.second.toString()).onSuccessTask { fresh -> fresh.request(request) }
            } else if(result.isSuccessful) Tasks.forResult(result.result) else Tasks.forException(error ?: IllegalStateException("Integrity unavailable"))
        }
    }
}
