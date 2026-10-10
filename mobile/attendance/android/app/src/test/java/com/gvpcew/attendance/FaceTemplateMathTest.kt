package com.gvpcew.attendance

import org.junit.Assert.*
import org.junit.Test

class FaceTemplateMathTest {
    private fun vector(i: Int)=FloatArray(192) { if(it==i)1f else 0f }
    @Test fun averageIsNormalizedAndUsesEverySample() {
        val result=FaceTemplateMath.average(listOf(vector(0),vector(0),vector(1)))
        assertEquals(2.0/Math.sqrt(5.0),result[0].toDouble(),0.00001)
        assertEquals(1.0/Math.sqrt(5.0),result[1].toDouble(),0.00001)
        assertEquals(1.0,FaceTemplateMath.cosine(result,result),0.00001)
    }
    @Test(expected=IllegalArgumentException::class) fun rejectsZeroTemplate() {FaceTemplateMath.normalize(FloatArray(192))}
    @Test(expected=IllegalArgumentException::class) fun rejectsWrongModelDimension() {FaceTemplateMath.normalize(FloatArray(128){1f})}
    @Test(expected=IllegalArgumentException::class) fun rejectsTooFewSamples() {FaceTemplateMath.average(listOf(vector(0),vector(1)))}
    @Test fun guidedPosesIncludeFrontLeftRight() {
        assertTrue(FaceEnrollmentPolicy.accepts(0,0f,0f,0f,1f,1f))
        assertTrue(FaceEnrollmentPolicy.accepts(1,15f,0f,0f,1f,1f))
        assertTrue(FaceEnrollmentPolicy.accepts(2,-15f,0f,0f,1f,1f))
        assertFalse(FaceEnrollmentPolicy.accepts(1,-15f,0f,0f,1f,1f))
        assertFalse(FaceEnrollmentPolicy.accepts(0,0f,20f,0f,1f,1f))
        assertFalse(FaceEnrollmentPolicy.accepts(0,0f,0f,0f,0f,1f))
    }
}
