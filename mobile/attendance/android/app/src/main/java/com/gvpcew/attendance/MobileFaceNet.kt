package com.gvpcew.attendance

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceLandmark
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/** Shared by enrollment and attendance. Never substitute a different model under this identifier. */
class MobileFaceNet(context: Context) : AutoCloseable {
    companion object {
        const val MODEL = "mobilefacenet-v1"
        const val SHA256 = "be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854"
        const val SIDE = 112
    }
    private val interpreter: Interpreter
    init {
        val bytes = context.assets.open("mobilefacenet-v1.tflite").use { it.readBytes() }
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
        require(digest == SHA256) { "Face model checksum mismatch. Install the approved app." }
        val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes)
        model.rewind()
        interpreter = Interpreter(model, Interpreter.Options().setNumThreads(2))
        require(interpreter.getInputTensor(0).shape().contentEquals(intArrayOf(1,112,112,3))) { "Unexpected face model input" }
        require(interpreter.getOutputTensor(0).shape().contentEquals(intArrayOf(1,192))) { "Unexpected face model output" }
        require(interpreter.getInputTensor(0).dataType() == DataType.FLOAT32 && interpreter.getOutputTensor(0).dataType() == DataType.FLOAT32)
    }
    fun align(bitmap: Bitmap, face: Face): Bitmap {
        val first = requireNotNull(face.getLandmark(FaceLandmark.LEFT_EYE)?.position) { "Both eyes must be visible" }
        val second = requireNotNull(face.getLandmark(FaceLandmark.RIGHT_EYE)?.position) { "Both eyes must be visible" }
        val left = if (first.x < second.x) first else second
        val right = if (first.x < second.x) second else first
        require(right.x - left.x > 12f) { "Move closer to the camera" }
        val transform = Matrix()
        require(transform.setPolyToPoly(floatArrayOf(left.x,left.y,right.x,right.y),0,floatArrayOf(34f,44f,78f,44f),0,2))
        val aligned = Bitmap.createBitmap(SIDE,SIDE,Bitmap.Config.ARGB_8888)
        val canvas = Canvas(aligned)
        canvas.drawColor(android.graphics.Color.rgb(127,127,127))
        canvas.drawBitmap(bitmap, transform, Paint(Paint.FILTER_BITMAP_FLAG))
        return aligned
    }
    /** RGB FLOAT32, (channel - 127.5) / 128.0; input is upright and unmirrored. */
    @Synchronized fun embed(aligned: Bitmap): FloatArray {
        require(aligned.width == SIDE && aligned.height == SIDE)
        val pixels = IntArray(SIDE*SIDE); aligned.getPixels(pixels,0,SIDE,0,0,SIDE,SIDE)
        val input = ByteBuffer.allocateDirect(SIDE*SIDE*3*4).order(ByteOrder.nativeOrder())
        for(pixel in pixels) {
            input.putFloat((((pixel shr 16) and 255)-127.5f)/128f)
            input.putFloat((((pixel shr 8) and 255)-127.5f)/128f)
            input.putFloat(((pixel and 255)-127.5f)/128f)
        }
        input.rewind(); val output = arrayOf(FloatArray(192))
        interpreter.run(input,output)
        return FaceTemplateMath.normalize(output[0])
    }
    override fun close() = interpreter.close()
}
