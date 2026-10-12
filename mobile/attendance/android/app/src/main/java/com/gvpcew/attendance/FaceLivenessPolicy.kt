package com.gvpcew.attendance

/** A timed eye-open -> eye-closed -> eye-open sequence, never a single probability flag. */
class FaceLivenessPolicy(val type: String, private val deadline: Long) {
    data class Frame(val time: Long, val tracking: Int?, val yaw: Float, val pitch: Float, val roll: Float,
                     val leftEye: Float?, val rightEye: Float?, val smile: Float?)
    enum class Phase { BASELINE, ACTION, RETURN, PASSED, EXPIRED }
    var phase = Phase.BASELINE; private set
    private var track: Int? = null
    private var previous = -1L
    private var since = -1L
    private var count = 0
    init { require(type == "blink") }
    fun reset() { if(phase != Phase.EXPIRED) { phase=Phase.BASELINE;track=null;since=-1;count=0 } }
    fun instruction(): String = when(phase) {
        Phase.BASELINE -> "Look straight ahead with both eyes open"
        Phase.ACTION -> "Blink once now"
        Phase.RETURN -> "Open both eyes"
        Phase.PASSED -> "Hold still while your face is checked"
        Phase.EXPIRED -> "Face challenge expired. Try again."
    }
    private fun held(ok: Boolean,time: Long,minimum: Long,frames: Int): Boolean {
        if(!ok) { since=-1;count=0;return false }
        if(since<0)since=time
        count++
        return count>=frames && time-since>=minimum
    }
    private fun next(value: Phase) { phase=value;since=-1;count=0 }
    fun accept(f: Frame): Phase {
        if(f.time>=deadline) { phase=Phase.EXPIRED;return phase }
        if(f.time<=previous)return phase
        if(previous>=0 && f.time-previous>500)reset()
        previous=f.time
        if(f.tracking==null || !f.yaw.isFinite() || !f.pitch.isFinite() || !f.roll.isFinite() ||
            kotlin.math.abs(f.pitch)>18 || kotlin.math.abs(f.roll)>18 || kotlin.math.abs(f.yaw)>32) { reset();return phase }
        if(track!=null && track!=f.tracking)reset()
        track=f.tracking
        val frontal=kotlin.math.abs(f.yaw)<=10
        val eyes=(f.leftEye ?: -1f)>=0.65f && (f.rightEye ?: -1f)>=0.65f
        when(phase) {
            Phase.BASELINE -> if(held(frontal && eyes,f.time,200,3))next(Phase.ACTION)
            Phase.ACTION -> {
                val action=frontal && (f.leftEye ?: 1f)<=0.25f && (f.rightEye ?: 1f)<=0.25f
                if(held(action,f.time,60,2))next(Phase.RETURN)
            }
            Phase.RETURN -> if(held(frontal && eyes,f.time,120,2))next(Phase.PASSED)
            else -> Unit
        }
        return phase
    }
}
