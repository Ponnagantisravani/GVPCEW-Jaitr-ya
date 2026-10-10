plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    val cameraVersion = "1.4.2"
    implementation("androidx.camera:camera-camera2:$cameraVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraVersion")
    implementation("androidx.camera:camera-view:$cameraVersion")
    implementation("androidx.camera:camera-mlkit-vision:$cameraVersion")
    // Bundle the model so first launch does not wait for a model download.
    implementation("com.google.mlkit:face-detection:16.1.7")
    testImplementation("junit:junit:4.13.2")
}
android {
    namespace = "com.gvpcew.testing"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.gvpcew.testing"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
