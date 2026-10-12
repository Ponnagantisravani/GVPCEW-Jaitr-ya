package com.gvpcew.attendance

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Size
import android.view.Gravity
import android.view.WindowManager
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

/** Attendance never creates a photo file, preview payload, or camera frame bridge event. */
class FaceAttendanceActivity : ComponentActivity() {
    private val executor=Executors.newSingleThreadExecutor()
    private val handler=Handler(Looper.getMainLooper())
    private var model: MobileFaceNet?=null
    private var detector: FaceDetector?=null
    private var provider: ProcessCameraProvider?=null
    private lateinit var guidance: TextView
    private lateinit var previewView: PreviewView
    private lateinit var policy: FaceLivenessPolicy
    private var ownTemplate: FloatArray?=null
    private var minimum=1.0
    private var baseline: FloatArray?=null
    private val samples=mutableListOf<FloatArray>()
    private var lastSample=0L
    private var captureTrack: Int?=null
    @Volatile private var active=true
    @Volatile private var processing=false
    private var closed=false
    private var deadline=0L
    private val expire=Runnable { cancel("Face challenge expired. Retry while your attendance window is open.") }
    private val cancelled=Runnable { cancel("Face verification cancelled.") }
    companion object { @Volatile private var current: FaceAttendanceActivity?=null
        fun cancelCurrent() { current?.let { it.handler.post(it.cancelled) } }
    }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        // Activity recreation must not continue a previous liveness sequence.
        val type=intent.getStringExtra("challenge_type") ?: ""
        deadline=intent.getLongExtra("deadline",0L)
        val left=deadline-SystemClock.elapsedRealtime()
        if(state!=null || type != "blink" || left<=0 || left>6000) { cancel("Face challenge expired. Retry attendance.");return }
        ownTemplate=intent.getFloatArrayExtra("own_template")
        minimum=intent.getDoubleExtra("similarity_threshold",1.0)
        if(ownTemplate?.size!=192 || ownTemplate?.all { it.isFinite() }!=true || ownTemplate?.any { it!=0f }!=true || !minimum.isFinite() || minimum<=0 || minimum>=1) { cancel("Your enrolled face template is unavailable.");return }
        current=this;policy=FaceLivenessPolicy(type,deadline)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(13,23,40));setPadding(20,20,20,20) }
        previewView=PreviewView(this).apply { scaleType=PreviewView.ScaleType.FILL_CENTER }
        layout.addView(previewView,LinearLayout.LayoutParams(-1,0,1f))
        guidance=TextView(this).apply { text="Starting face verification…";textSize=20f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setPadding(8,20,8,20) }
        layout.addView(guidance)
        layout.addView(TextView(this).apply { text="Blink once. Keep only your face in view.";setTextColor(Color.LTGRAY);gravity=Gravity.CENTER })
        setContentView(layout)
        ViewCompat.setOnApplyWindowInsetsListener(layout) { view,insets -> val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());view.setPadding(20+bars.left,20+bars.top,20+bars.right,20+bars.bottom);insets }
        onBackPressedDispatcher.addCallback(this,object: OnBackPressedCallback(true) { override fun handleOnBackPressed()=cancel("Face verification cancelled.") })
        handler.postDelayed(expire,left)
        detector=FaceDetection.getClient(FaceDetectorOptions.Builder().setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL).setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL).enableTracking().build())
        executor.execute { try { model=MobileFaceNet(this);runOnUiThread { if(active)startCamera() } }
            catch(_: Exception) { runOnUiThread { cancel("The approved face model could not load. Reinstall the campus app.") } } }
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
                val analyzer=ImageAnalysis.Builder().setTargetResolution(Size(640,480)).setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analyzer.setAnalyzer(executor,::analyze)
                provider!!.bindToLifecycle(this,CameraSelector.DEFAULT_FRONT_CAMERA,preview,analyzer)
                show(policy.instruction())
            } catch(_: Exception) { cancel("Front camera unavailable. Close other camera apps and retry.") }
        },ContextCompat.getMainExecutor(this))
    }
    private fun reset() { policy.reset();baseline?.fill(0f);baseline=null;samples.forEach { it.fill(0f) };samples.clear();captureTrack=null;lastSample=0 }
    private fun analyze(image: ImageProxy) {
        if(!active) { image.close();return }
        if(SystemClock.elapsedRealtime()>=deadline) { image.close();handler.post(expire);return }
        val bitmap: Bitmap
        try { val raw=image.toBitmap();val rotation=Matrix().apply { postRotate(image.imageInfo.rotationDegrees.toFloat()) }
            bitmap=Bitmap.createBitmap(raw,0,0,raw.width,raw.height,rotation,true);if(bitmap !== raw)raw.recycle()
        } catch(_: Exception) { image.close();reset();show("Hold the phone steady and retry in better light");return }
        processing=true
        detector!!.process(InputImage.fromBitmap(bitmap,0)).addOnCompleteListener(executor) { task ->
            try {
                if(!active)return@addOnCompleteListener
                if(!task.isSuccessful || task.result.size!=1) { reset();show("Keep exactly one face in view");return@addOnCompleteListener }
                val face=task.result[0];val box=face.boundingBox
                if(box.width()<120 || box.height()<120 || box.left<0 || box.top<0 || box.right>bitmap.width || box.bottom>bitmap.height) { reset();show("Move closer and keep your entire face in view");return@addOnCompleteListener }
                val before=policy.phase
                val phase=policy.accept(FaceLivenessPolicy.Frame(SystemClock.elapsedRealtime(),face.trackingId,face.headEulerAngleY,face.headEulerAngleX,face.headEulerAngleZ,face.leftEyeOpenProbability,face.rightEyeOpenProbability,face.smilingProbability))
                if(phase==FaceLivenessPolicy.Phase.EXPIRED) { handler.post(expire);return@addOnCompleteListener }
                if(phase==FaceLivenessPolicy.Phase.BASELINE && before!=phase) { baseline?.fill(0f);baseline=null;samples.forEach { it.fill(0f) };samples.clear();captureTrack=null }
                show(policy.instruction())
                if((before==FaceLivenessPolicy.Phase.BASELINE && phase==FaceLivenessPolicy.Phase.ACTION) || phase==FaceLivenessPolicy.Phase.PASSED) {
                    // The matching samples are always fresh, upright frontal frames after liveness.
                    if(kotlin.math.abs(face.headEulerAngleY)>10 || (face.leftEyeOpenProbability ?: 0f)<0.65f || (face.rightEyeOpenProbability ?: 0f)<0.65f)return@addOnCompleteListener
                    val aligned=model!!.align(bitmap,face)
                    try {
                        if(!FaceFrameQuality.accepts(aligned)) { reset();show("Use even lighting and hold still");return@addOnCompleteListener }
                        val vector=model!!.embed(aligned)
                        if(phase==FaceLivenessPolicy.Phase.ACTION) { baseline?.fill(0f);baseline=vector;captureTrack=face.trackingId }
                        else {
                            if(FaceTemplateMath.cosine(ownTemplate!!,vector)<=minimum) { vector.fill(0f);runOnUiThread { cancel("Face not recognized, try again","FACE_MISMATCH") };return@addOnCompleteListener }
                            if(baseline==null || captureTrack!=face.trackingId || FaceTemplateMath.cosine(baseline!!,vector)<0.50) { vector.fill(0f);reset();show("Keep the same face in view throughout the challenge");return@addOnCompleteListener }
                            if(SystemClock.elapsedRealtime()-lastSample<100) { vector.fill(0f);return@addOnCompleteListener }
                            samples.add(vector);lastSample=SystemClock.elapsedRealtime()
                            if(samples.size==3)complete()
                        }
                    } finally { aligned.recycle() }
                }
            } catch(_: Exception) { reset();show("Keep both eyes visible and follow the instruction") }
            finally { bitmap.recycle();image.close();processing=false;if(!active)closeResources() }
        }
    }
    private fun complete() {
        if(SystemClock.elapsedRealtime()>=deadline) { handler.post(expire);return }
        val embedding=FaceTemplateMath.average(samples)
        if(FaceTemplateMath.cosine(ownTemplate!!,embedding)<=minimum) { embedding.fill(0f);runOnUiThread { cancel("Face not recognized, try again","FACE_MISMATCH") };return }
        val data=JSONObject().put("embedding_model",MobileFaceNet.MODEL).put("model_sha256",MobileFaceNet.SHA256)
            .put("embedding",JSONArray(embedding.map { it.toDouble() })).put("sample_count",samples.size).put("liveness_result",true).put("challenge_type",policy.type)
        embedding.fill(0f);active=false
        runOnUiThread { handler.removeCallbacks(expire);setResult(Activity.RESULT_OK,Intent().putExtra("attendance",data.toString()));finish() }
    }
    private fun cancel(message: String,code: String="CAPTURE_CANCELLED") { if(!active)return;active=false;setResult(Activity.RESULT_CANCELED,Intent().putExtra("error",message).putExtra("error_code",code));finish() }
    override fun onStop() { super.onStop();if(active)cancel("Face verification paused. Retry when the app is open.") }
    private fun closeResources() { if(closed)return;closed=true;model?.close();detector?.close();ownTemplate?.fill(0f);ownTemplate=null;intent.removeExtra("own_template");baseline?.fill(0f);baseline=null;samples.forEach { it.fill(0f) };samples.clear();executor.shutdown() }
    override fun onDestroy() { active=false;if(current===this)current=null;handler.removeCallbacksAndMessages(null);provider?.unbindAll();if(!executor.isShutdown)executor.execute { if(!processing)closeResources() };super.onDestroy() }
}
