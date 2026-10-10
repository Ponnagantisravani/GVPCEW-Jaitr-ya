package com.gvpcew.testing

import kotlin.math.abs

data class FaceBox(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width get() = right - left
    val height get() = bottom - top
    val centerX get() = (left + right) / 2f
    val centerY get() = (top + bottom) / 2f
}
data class FaceSample(val box: FaceBox, val yaw: Float, val pitch: Float, val roll: Float, val landmarksVisible: Boolean)
enum class FaceFeedback(val message: String) {
    STARTING("Preparing camera…"), NO_FACE("No face detected. Look at the camera."),
    MULTIPLE("Only one person should be visible."), FAR("Move closer to the camera."),
    CLOSE("Move a little farther away."), OFF_CENTRE("Move your face to the centre of the oval."),
    TURNED("Look straight at the camera and keep your head upright."),
    PARTIAL("Keep your whole face visible and uncovered."),
    DARK("More light is needed. Face a light source."), BRIGHT("Move away from strong light or glare."),
    READY("Face detected. Hold still…")
}

/** All coordinates are in PreviewView space, not raw sensor space. */
object FaceQualityPolicy {
    fun evaluate(faces: List<FaceSample>, guide: FaceBox, luma: Float): FaceFeedback {
        if (faces.size > 1) return FaceFeedback.MULTIPLE
        if (luma < 38f) return FaceFeedback.DARK
        if (luma > 242f) return FaceFeedback.BRIGHT
        if (faces.isEmpty()) return FaceFeedback.NO_FACE
        if (guide.width <= 0 || guide.height <= 0) return FaceFeedback.STARTING
        val face = faces.single()
        val box = face.box
        if (box.width > guide.width * .92f || box.height > guide.height * .94f) return FaceFeedback.CLOSE
        if (box.width < guide.width * .48f || box.height < guide.height * .42f) return FaceFeedback.FAR
        if (abs(face.yaw) > 20 || abs(face.pitch) > 20 || abs(face.roll) > 15) return FaceFeedback.TURNED
        // Check the face envelope against the actual ellipse, including diagonal points.
        val samples = listOf(
            box.left to box.centerY, box.right to box.centerY,
            box.centerX to box.top, box.centerX to box.bottom,
            box.left + box.width * .15f to box.top + box.height * .15f,
            box.right - box.width * .15f to box.top + box.height * .15f,
            box.left + box.width * .15f to box.bottom - box.height * .15f,
            box.right - box.width * .15f to box.bottom - box.height * .15f
        )
        if (samples.any { (x, y) ->
                val dx = (x - guide.centerX) / (guide.width / 2)
                val dy = (y - guide.centerY) / (guide.height / 2)
                dx * dx + dy * dy > 1f
            }) return FaceFeedback.OFF_CENTRE
        if (!face.landmarksVisible) return FaceFeedback.PARTIAL
        return FaceFeedback.READY
    }
}

/** Require continuous acceptable frames, not one lucky detection or a stale callback. */
class StableFaceGate {
    private var began = -1L
    private var last = -1L
    private var trackingId: Int? = null
    fun reset() { began = -1; last = -1; trackingId = null }
    fun update(ready: Boolean, now: Long, id: Int?): Boolean {
        if (!ready) { reset(); return false }
        if (began < 0 || now - last > 650 || now < last || trackingId != id) began = now
        last = now; trackingId = id
        return now - began >= 1200
    }
}
