package com.gvpcew.attendance
import org.junit.Assert.*
import org.junit.Test
class FaceLivenessPolicyTest {
    private fun frame(t: Long,y: Float=0f,eye: Float=1f,smile: Float=0f,id: Int?=1)=FaceLivenessPolicy.Frame(t,id,y,0f,0f,eye,eye,smile)
    private fun baseline(p: FaceLivenessPolicy) { p.accept(frame(0));p.accept(frame(100));p.accept(frame(200));assertEquals(FaceLivenessPolicy.Phase.ACTION,p.phase) }
    @Test fun blinkRequiresOpenClosedOpenSequence() {
        val p=FaceLivenessPolicy("blink",6000);baseline(p)
        p.accept(frame(300,eye=0f));assertEquals(FaceLivenessPolicy.Phase.ACTION,p.phase)
        p.accept(frame(380,eye=0f));assertEquals(FaceLivenessPolicy.Phase.RETURN,p.phase)
        p.accept(frame(500));p.accept(frame(650));assertEquals(FaceLivenessPolicy.Phase.PASSED,p.phase)
    }
    @Test fun stillImageAndClosedEyesNeverPass() {
        for(type in listOf("blink")) {
            val p=FaceLivenessPolicy(type,6000);for(t in 0L..5000L step 100)p.accept(frame(t))
            assertNotEquals(FaceLivenessPolicy.Phase.PASSED,p.phase)
        }
        val p=FaceLivenessPolicy("blink",6000);for(t in 0L..5000L step 100)p.accept(frame(t,eye=0f))
        assertEquals(FaceLivenessPolicy.Phase.BASELINE,p.phase)
    }
    @Test fun otherActionsAreRejectedAndTrackingMustStayContinuous() {
        for(type in listOf("turn_left","turn_right","smile")) {
            try { FaceLivenessPolicy(type,6000);fail("Only blink is allowed") } catch(_: IllegalArgumentException) { }
        }
        val switched=FaceLivenessPolicy("blink",6000);baseline(switched);switched.accept(frame(300,eye=0f,id=2));assertEquals(FaceLivenessPolicy.Phase.BASELINE,switched.phase)
        val unknown=FaceLivenessPolicy("blink",6000);unknown.accept(frame(0,id=null));assertEquals(FaceLivenessPolicy.Phase.BASELINE,unknown.phase)
    }
    @Test fun oneClosedEyeAndMissingEyeProbabilitiesCannotPassBlink() {
        val p=FaceLivenessPolicy("blink",6000);baseline(p)
        for(t in 300L..900L step 100)p.accept(frame(t,eye=0f).copy(rightEye=1f))
        assertEquals(FaceLivenessPolicy.Phase.ACTION,p.phase)
        for(t in 1000L..1500L step 100)p.accept(frame(t,eye=0f).copy(rightEye=null))
        assertEquals(FaceLivenessPolicy.Phase.ACTION,p.phase)
    }
    @Test fun missingFramesInvalidPoseAndExpiryResetOrReject() {
        val p=FaceLivenessPolicy("blink",2000);baseline(p);p.accept(frame(900,eye=0f));assertEquals(FaceLivenessPolicy.Phase.BASELINE,p.phase)
        p.accept(frame(1000).copy(pitch=30f));assertEquals(FaceLivenessPolicy.Phase.BASELINE,p.phase)
        assertEquals(FaceLivenessPolicy.Phase.EXPIRED,p.accept(frame(2000)))
    }
}
