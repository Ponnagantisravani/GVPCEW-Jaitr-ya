package com.gvpcew.attendance

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.os.Bundle
import android.os.SystemClock
import android.util.Size
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Camera frames stay in RAM. Only the averaged numeric template leaves this activity. */
class FaceEnrollmentActivity : ComponentActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private var model: MobileFaceNet? = null
    private lateinit var detector: FaceDetector
    private lateinit var guidance: TextView
    private lateinit var previewView: PreviewView
    private var provider: ProcessCameraProvider? = null
    private val samples = mutableListOf<FloatArray>()
    private var tracked: Int? = null
    private var stable = 0
    private var lastSample = 0L
    @Volatile private var active = true
    @Volatile private var processing = false
    private var closed = false
    private var started = 0L

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val layout = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(13,23,40));setPadding(20,20,20,20) }
        previewView=PreviewView(this).apply { scaleType=PreviewView.ScaleType.FILL_CENTER }
        layout.addView(previewView,LinearLayout.LayoutParams(-1,0,1f))
        guidance=TextView(this).apply { text="Starting secure face camera…";textSize=20f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setPadding(8,20,8,20) }
        layout.addView(guidance)
        val note=TextView(this).apply { text="Keep only your face in view. Five samples are processed on this phone.";setTextColor(Color.LTGRAY);gravity=Gravity.CENTER }
        layout.addView(note)
        layout.addView(Button(this).apply { text="Cancel";setOnClickListener { cancel("Face registration cancelled.") } })
        setContentView(layout)
        ViewCompat.setOnApplyWindowInsetsListener(layout) { view,insets -> val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());view.setPadding(20+bars.left,20+bars.top,20+bars.right,20+bars.bottom);insets }
        onBackPressedDispatcher.addCallback(this,object: OnBackPressedCallback(true) { override fun handleOnBackPressed()=cancel("Face registration cancelled.") })
        detector=FaceDetection.getClient(FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL).enableTracking().build())
        executor.execute {
            try { model=MobileFaceNet(this);runOnUiThread { if(active) startCamera() } }
            catch(_: Exception) { runOnUiThread { cancel("The approved face model could not load. Reinstall the campus app.") } }
        }
    }
    private fun show(message: String) { runOnUiThread { if(active)guidance.text=message } }
    private fun startCamera() {
        val future=ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                if(!active)return@addListener
                provider=future.get()
                if(!provider!!.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) { cancel("A front camera is required.");return@addListener }
                val preview=Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                val analyzer=ImageAnalysis.Builder().setTargetResolution(Size(640,480))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analyzer.setAnalyzer(executor,::analyze)
                provider!!.bindToLifecycle(this,CameraSelector.DEFAULT_FRONT_CAMERA,preview,analyzer)
                started=SystemClock.elapsedRealtime();show(FaceEnrollmentPolicy.instruction(0)+" · 0/5")
            } catch(_: Exception) { cancel("Front camera unavailable. Close other camera apps and retry.") }
        },ContextCompat.getMainExecutor(this))
    }
    private fun analyze(image: ImageProxy) {
        if(!active || samples.size>=5) { image.close();return }
        if(SystemClock.elapsedRealtime()-started>90000) { image.close();runOnUiThread { cancel("Capture timed out. Move to better light and try again.") };return }
        val bitmap: Bitmap
        try {
            val raw=image.toBitmap()
            val rotation=Matrix().apply { postRotate(image.imageInfo.rotationDegrees.toFloat()) }
            bitmap=Bitmap.createBitmap(raw,0,0,raw.width,raw.height,rotation,true)
            if(bitmap !== raw)raw.recycle()
        } catch(_: Exception) { image.close();show("Camera frame unavailable. Hold still.");return }
        processing = true
        detector.process(InputImage.fromBitmap(bitmap,0))
            .addOnCompleteListener(executor) { task ->
                try {
                    if(!active)return@addOnCompleteListener
                    if(!task.isSuccessful) { show("Face detection unavailable. Hold still or retry.");return@addOnCompleteListener }
                    val faces = task.result
                    if(faces.size!=1) { stable=0;show("Keep exactly one face in view");return@addOnCompleteListener }
                    val face=faces[0];val box=face.boundingBox
                    if(box.width()<120||box.height()<120||box.left<0||box.top<0||box.right>bitmap.width||box.bottom>bitmap.height) { stable=0;show("Move closer and keep your entire face in view");return@addOnCompleteListener }
                    if(tracked != null && face.trackingId != null && tracked != face.trackingId) {
                        samples.forEach { it.fill(0f) };samples.clear();stable=0;tracked=face.trackingId
                        show("Face changed. Starting the five samples again");return@addOnCompleteListener
                    }
                    if(!FaceEnrollmentPolicy.accepts(samples.size,face.headEulerAngleY,face.headEulerAngleX,face.headEulerAngleZ,face.leftEyeOpenProbability,face.rightEyeOpenProbability)) {
                        stable=0;show(FaceEnrollmentPolicy.instruction(samples.size)+" · "+samples.size+"/5");return@addOnCompleteListener
                    }
                    stable++;if(stable<3||SystemClock.elapsedRealtime()-lastSample<700)return@addOnCompleteListener
                    val aligned=model!!.align(bitmap,face)
                    try {
                        if(!FaceFrameQuality.accepts(aligned)) { stable=0;show("Use even lighting and hold the phone steady");return@addOnCompleteListener }
                        val vector=model!!.embed(aligned)
                        if(samples.isNotEmpty()&&FaceTemplateMath.cosine(samples[0],vector)<0.50) { vector.fill(0f);stable=0;show("Keep the same face in view and turn only slightly");return@addOnCompleteListener }
                        if(samples.isEmpty()) {
                            tracked=face.trackingId
                        }
                        samples.add(vector);lastSample=SystemClock.elapsedRealtime();stable=0
                        if(samples.size==5)complete() else show(FaceEnrollmentPolicy.instruction(samples.size)+" · "+samples.size+"/5")
                    } finally { aligned.recycle() }
                } catch(_: Exception) { stable=0;show("Both eyes must be visible. Hold still and try again.") }
                finally { bitmap.recycle();image.close();processing=false;if(!active)closeResources() }
            }
    }
    private fun complete() {
        val embedding=FaceTemplateMath.average(samples)
        val data=JSONObject().put("embedding_model",MobileFaceNet.MODEL).put("model_sha256",MobileFaceNet.SHA256)
            .put("embedding",JSONArray(embedding.map { it.toDouble() })).put("sample_count",samples.size)
        embedding.fill(0f);active=false
        runOnUiThread { setResult(Activity.RESULT_OK,Intent().putExtra("enrollment",data.toString()));finish() }
    }
    private fun cancel(message: String) { active=false;setResult(Activity.RESULT_CANCELED,Intent().putExtra("error",message));finish() }
    override fun onStop() { super.onStop();if(active)cancel("Face capture paused. Reopen registration to continue.") }
    private fun closeResources() {
        if(closed)return;closed=true
        model?.close();detector.close();samples.forEach { it.fill(0f) };samples.clear()
        executor.shutdown()
    }
    override fun onDestroy() {
        active=false;provider?.unbindAll()
        if(!executor.isShutdown)executor.execute { if(!processing)closeResources() }
        super.onDestroy()
    }
}
