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
        for(type in listOf("blink","turn_left","turn_right","smile")) {
            val p=FaceLivenessPolicy(type,6000);for(t in 0L..5000L step 100)p.accept(frame(t))
            assertNotEquals(FaceLivenessPolicy.Phase.PASSED,p.phase)
        }
        val p=FaceLivenessPolicy("blink",6000);for(t in 0L..5000L step 100)p.accept(frame(t,eye=0f))
        assertEquals(FaceLivenessPolicy.Phase.BASELINE,p.phase)
    }
    @Test fun randomTurnDirectionAndReturnAreRequired() {
        for(type in listOf("turn_left","turn_right")) {
            val p=FaceLivenessPolicy(type,6000);baseline(p);val target=if(type=="turn_left")20f else -20f
            p.accept(frame(300,y=-target));p.accept(frame(450,y=-target));assertEquals(FaceLivenessPolicy.Phase.ACTION,p.phase)
            p.accept(frame(550,y=target));p.accept(frame(700,y=target));assertEquals(FaceLivenessPolicy.Phase.RETURN,p.phase)
            p.accept(frame(800));p.accept(frame(950));assertEquals(FaceLivenessPolicy.Phase.PASSED,p.phase)
        }
    }
    @Test fun smileRequiresRelaxedSmileRelaxedAndValidTracking() {
        val p=FaceLivenessPolicy("smile",6000);baseline(p);p.accept(frame(300,smile=1f));p.accept(frame(450,smile=1f));assertEquals(FaceLivenessPolicy.Phase.RETURN,p.phase)
        p.accept(frame(550));p.accept(frame(700));assertEquals(FaceLivenessPolicy.Phase.PASSED,p.phase)
        val switched=FaceLivenessPolicy("blink",6000);baseline(switched);switched.accept(frame(300,eye=0f,id=2));assertEquals(FaceLivenessPolicy.Phase.BASELINE,switched.phase)
        val unknown=FaceLivenessPolicy("blink",6000);unknown.accept(frame(0,id=null));assertEquals(FaceLivenessPolicy.Phase.BASELINE,unknown.phase)
    }
    @Test fun missingFramesInvalidPoseAndExpiryResetOrReject() {
        val p=FaceLivenessPolicy("blink",2000);baseline(p);p.accept(frame(900,eye=0f));assertEquals(FaceLivenessPolicy.Phase.BASELINE,p.phase)
        p.accept(frame(1000).copy(pitch=30f));assertEquals(FaceLivenessPolicy.Phase.BASELINE,p.phase)
        assertEquals(FaceLivenessPolicy.Phase.EXPIRED,p.accept(frame(2000)))
    }
}
