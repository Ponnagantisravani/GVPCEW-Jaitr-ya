package com.gvpcew.testing

import org.junit.Assert.*
import org.junit.Test

class FaceQualityPolicyTest {
    private val guide = FaceBox(0f, 0f, 200f, 280f)
    private val good = FaceSample(FaceBox(40f, 45f, 160f, 235f), 0f, 0f, 0f, true)
    private fun check(face: FaceSample) = FaceQualityPolicy.evaluate(listOf(face), guide, 128f)
    @Test fun centredSingleFaceAccepted() { assertEquals(FaceFeedback.READY, check(good)) }
    @Test fun absentFaceRejected() { assertEquals(FaceFeedback.NO_FACE, FaceQualityPolicy.evaluate(emptyList(), guide, 128f)) }
    @Test fun multipleFacesRejectedEvenInDarkness() {
        assertEquals(FaceFeedback.MULTIPLE, FaceQualityPolicy.evaluate(listOf(good, good), guide, 10f))
    }
    @Test fun distanceChecks() {
        assertEquals(FaceFeedback.FAR, check(good.copy(box = FaceBox(80f, 100f, 120f, 180f))))
        assertEquals(FaceFeedback.CLOSE, check(good.copy(box = FaceBox(0f, 0f, 200f, 280f))))
    }
    @Test fun faceInsideRectangleButOutsideOvalRejected() {
        assertEquals(FaceFeedback.OFF_CENTRE, check(good.copy(box = FaceBox(0f, 0f, 120f, 190f))))
    }
    @Test fun yawPitchAndRollRejected() {
        assertEquals(FaceFeedback.TURNED, check(good.copy(yaw = 30f)))
        assertEquals(FaceFeedback.TURNED, check(good.copy(pitch = -30f)))
        assertEquals(FaceFeedback.TURNED, check(good.copy(roll = 25f)))
    }
    @Test fun missingLandmarksRejected() { assertEquals(FaceFeedback.PARTIAL, check(good.copy(landmarksVisible = false))) }
    @Test fun lightingGuidance() {
        assertEquals(FaceFeedback.DARK, FaceQualityPolicy.evaluate(listOf(good), guide, 15f))
        assertEquals(FaceFeedback.BRIGHT, FaceQualityPolicy.evaluate(listOf(good), guide, 250f))
    }
    @Test fun geometryIsIndependentOfScreenScale() {
        val double = good.copy(box = FaceBox(80f, 90f, 320f, 470f))
        assertEquals(FaceFeedback.READY, FaceQualityPolicy.evaluate(listOf(double), FaceBox(0f, 0f, 400f, 560f), 128f))
    }
    @Test fun requiresContinuousStableFrames() {
        val gate = StableFaceGate()
        for (time in 0L..1000L step 200) assertFalse(gate.update(true, time, 1))
        assertTrue(gate.update(true, 1200L, 1))
        assertFalse(gate.update(false, 1300L, 1))
        assertFalse(gate.update(true, 1400L, 1))
    }
    @Test fun gapAndDifferentPersonResetHold() {
        val gate = StableFaceGate()
        gate.update(true, 0, 1); gate.update(true, 400, 1)
        assertFalse(gate.update(true, 1600, 1))
        gate.update(true, 2000, 1)
        assertFalse(gate.update(true, 2400, 2))
        assertFalse(gate.update(true, 2800, 2))
    }
}
