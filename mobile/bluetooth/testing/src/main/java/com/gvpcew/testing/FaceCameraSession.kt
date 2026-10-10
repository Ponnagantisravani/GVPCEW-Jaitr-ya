package com.gvpcew.testing

import android.content.Context
import android.graphics.Matrix
import android.os.SystemClock
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import java.io.File
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Camera lifetime and frame processing are isolated from navigation and attendance. */
class FaceCameraSession(
    context: Context,
    private val preview: PreviewView,
    private val guide: FaceGuideView,
    private val onFeedback: (FaceFeedback, Boolean) -> Unit,
    private val onError: (String) -> Unit
) : AutoCloseable {
    private val main = ContextCompat.getMainExecutor(context)
    private val worker = Executors.newSingleThreadExecutor()
    private val closed = AtomicBoolean(false)
    private val gate = StableFaceGate()
    var targetAction: String = "look_straight"
        set(value) { field = value; gate.reset() }
    private val detector = FaceDetection.getClient(FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
        .setMinFaceSize(.10f).enableTracking().build())
    private val controller = LifecycleCameraController(context)
    @Volatile private var luminance = 128f
    @Volatile private var transformReady = false
    private var lastFrame = 0L
    private var errors = 0
    private val delegate = MlKitAnalyzer(listOf(detector), ImageAnalysis.COORDINATE_SYSTEM_VIEW_REFERENCED, main) { result ->
        if (!closed.get()) {
            if (result.getThrowable(detector) != null) {
                gate.reset()
                errors++
                if (errors >= 3) onError("Face detection could not start. Close the camera and try again.")
            } else {
                errors = 0
                val faces = result.getValue(detector).orEmpty()
                val samples = faces.map { face ->
                    val box = face.boundingBox
                    FaceSample(FaceBox(box.left.toFloat(), box.top.toFloat(), box.right.toFloat(), box.bottom.toFloat()),
                        face.headEulerAngleY, face.headEulerAngleX, face.headEulerAngleZ,
                        listOf(FaceLandmark.LEFT_EYE, FaceLandmark.RIGHT_EYE, FaceLandmark.NOSE_BASE, FaceLandmark.MOUTH_BOTTOM)
                            .all { face.getLandmark(it) != null })
                }
                val pose = samples.singleOrNull()?.yaw
                val poseReady = when(targetAction) {
                    "turn_left" -> pose != null && pose in -30f..-12f
                    "turn_right" -> pose != null && pose in 12f..30f
                    else -> pose != null && kotlin.math.abs(pose) < 10f
                }
                val qualitySamples = if(targetAction == "look_straight") samples else samples.map { it.copy(yaw = 0f) }
                val quality = FaceQualityPolicy.evaluate(qualitySamples, guide.guide, luminance)
                val feedback = if(quality == FaceFeedback.READY && !poseReady) FaceFeedback.TURNED else quality
                onFeedback(feedback, gate.update(feedback == FaceFeedback.READY, SystemClock.elapsedRealtime(), faces.singleOrNull()?.trackingId))
            }
        }
    }
    private val analyzer = object : ImageAnalysis.Analyzer {
        override fun getTargetCoordinateSystem() = ImageAnalysis.COORDINATE_SYSTEM_VIEW_REFERENCED
        override fun getDefaultTargetResolution() = Size(640, 480)
        override fun updateTransform(matrix: Matrix?) {
            transformReady = matrix != null
            delegate.updateTransform(matrix)
        }
        override fun analyze(image: ImageProxy) {
            val now = SystemClock.elapsedRealtime()
            if (closed.get() || !transformReady || now - lastFrame < 160) { image.close(); return }
            lastFrame = now
            try {
                val plane = image.planes.first()
                val buffer = plane.buffer.duplicate()
                var sum = 0L; var count = 0
                // Sample the central region of the Y plane without allocating a bitmap.
                for (y in image.height / 4 until image.height * 3 / 4 step 16) {
                    for (x in image.width / 4 until image.width * 3 / 4 step 16) {
                        val index = buffer.position() + y * plane.rowStride + x * plane.pixelStride
                        if (index < buffer.limit()) { sum += buffer.get(index).toInt() and 255; count++ }
                    }
                }
                luminance = if (count > 0) sum.toFloat() / count else 128f
                // MlKitAnalyzer owns ImageProxy from here and closes it after ML Kit completes,
                // including detector failures. Rejected/throttled frames above are closed by us.
                delegate.analyze(image)
            } catch (_: Exception) {
                image.close()
                main.execute { if (!closed.get()) onError("The camera frame could not be read. Try reopening the camera.") }
            }
        }
    }
    fun start(owner: LifecycleOwner) {
        try {
            controller.cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA
            controller.setEnabledUseCases(CameraController.IMAGE_ANALYSIS or CameraController.IMAGE_CAPTURE)
            controller.imageAnalysisBackpressureStrategy = ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
            controller.setImageAnalysisAnalyzer(worker, analyzer)
            preview.controller = controller
            controller.bindToLifecycle(owner)
            controller.initializationFuture.addListener({
                if (!closed.get()) try {
                    controller.initializationFuture.get()
                    if (!controller.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA))
                        onError("This device has no available front camera. Please use another phone.")
                    controller.cameraInfo?.cameraState?.observe(owner) { state ->
                        if (!closed.get() && state.error != null)
                            onError("The camera is unavailable. Close other camera apps and try again.")
                    }
                } catch (_: Exception) {
                    onError("The front camera could not open. Close other camera apps and try again.")
                }
            }, main)
        } catch (_: SecurityException) {
            onError("Camera permission is required. Allow it in app settings and try again.")
        } catch (_: Exception) {
            onError("The front camera could not open. Close other camera apps and try again.")
        }
    }
    fun capture(file: File, onSaved: () -> Unit, onFailure: () -> Unit) {
        if (closed.get()) { onFailure(); return }
        try {
            controller.takePicture(ImageCapture.OutputFileOptions.Builder(file).build(), main,
                object : ImageCapture.OnImageSavedCallback {
                    override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                        if (closed.get()) { file.delete(); return }
                        onSaved()
                    }
                    override fun onError(exception: ImageCaptureException) { file.delete(); if (!closed.get()) onFailure() }
                })
        } catch (_: Exception) { file.delete(); onFailure() }
    }
    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        controller.clearImageAnalysisAnalyzer()
        controller.unbind()
        preview.controller = null
        detector.close()
        worker.shutdown()
        gate.reset()
    }
}
