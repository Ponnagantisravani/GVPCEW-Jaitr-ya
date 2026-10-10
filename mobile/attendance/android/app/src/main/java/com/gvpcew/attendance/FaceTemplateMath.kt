package com.gvpcew.attendance

import kotlin.math.sqrt

object FaceTemplateMath {
    const val DIMENSIONS = 192
    fun normalize(values: FloatArray): FloatArray {
        require(values.size == DIMENSIONS && values.all { it.isFinite() }) { "Invalid face template" }
        val norm = sqrt(values.sumOf { it.toDouble() * it.toDouble() })
        require(norm > 1e-8) { "Empty face template" }
        return FloatArray(DIMENSIONS) { (values[it] / norm).toFloat() }
    }
    fun average(samples: List<FloatArray>): FloatArray {
        require(samples.size in 3..5) { "Capture three to five samples" }
        val normalized = samples.map(::normalize)
        return normalize(FloatArray(DIMENSIONS) { i -> normalized.sumOf { it[i].toDouble() }.toFloat() / samples.size })
    }
    fun cosine(a: FloatArray, b: FloatArray): Double {
        val na = normalize(a); val nb = normalize(b)
        return na.indices.sumOf { na[it].toDouble() * nb[it].toDouble() }
    }
}
