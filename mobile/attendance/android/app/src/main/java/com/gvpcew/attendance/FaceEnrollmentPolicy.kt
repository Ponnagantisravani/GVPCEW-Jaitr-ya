package com.gvpcew.attendance

import kotlin.math.abs

object FaceEnrollmentPolicy {
    val poses = listOf("front","left","right","front","front")
    fun accepts(index: Int,yaw: Float,pitch: Float,roll: Float,eyeLeft: Float?,eyeRight: Float?): Boolean {
        if(index !in poses.indices || abs(pitch)>12 || abs(roll)>12 || (eyeLeft?:0f)<0.65f || (eyeRight?:0f)<0.65f) return false
        return when(poses[index]) { "left" -> yaw in 10f..17f; "right" -> yaw in -17f..-10f; else -> abs(yaw)<=7 }
    }
    fun instruction(index: Int) = when(poses[index.coerceIn(0,poses.lastIndex)]) {
        "left" -> "Turn your head slightly to your left"
        "right" -> "Turn your head slightly to your right"
        else -> "Look straight at the camera"
    }
}
