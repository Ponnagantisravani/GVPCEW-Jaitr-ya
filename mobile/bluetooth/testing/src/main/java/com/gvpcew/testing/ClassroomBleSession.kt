package com.gvpcew.testing

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.*
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.util.UUID

sealed interface ClassroomState {
    data object Searching : ClassroomState
    data object Starting : ClassroomState
    data object Found : ClassroomState
    data object Broadcasting : ClassroomState
    data class Failed(val message: String) : ClassroomState
}

/** Separate UUID leaves the original student-advertises/coordinator-scans experiment intact. */
@SuppressLint("MissingPermission") // Each start checks the complete runtime permission set.
class ClassroomBleSession(context: Context, private val onState: (ClassroomState) -> Unit) : AutoCloseable {
    private val context = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private var scanner: BluetoothLeScanner? = null
    private var scan: ScanCallback? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advert: AdvertiseCallback? = null
    private var closed = false
    private var generation = 0
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED && (scan != null || advert != null) &&
                intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1) != BluetoothAdapter.STATE_ON)
                fail("Bluetooth was turned off. Turn it on and try again.")
        }
    }
    init {
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= 33) this.context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        else { @Suppress("DEPRECATION") this.context.registerReceiver(receiver, filter) }
    }
    companion object {
        private val UUID_DATA = ParcelUuid(UUID.fromString("a31f7202-8e9b-4b35-93f0-67ed21c409aa"))
        fun permissions(advertising: Boolean): Array<String> = buildList {
            if (Build.VERSION.SDK_INT >= 31) {
                add(Manifest.permission.BLUETOOTH_CONNECT)
                add(if (advertising) Manifest.permission.BLUETOOTH_ADVERTISE else Manifest.permission.BLUETOOTH_SCAN)
            }
            if (!advertising) {
                add(Manifest.permission.ACCESS_COARSE_LOCATION)
                add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }.toTypedArray()
    }
    private fun adapter(advertising: Boolean): BluetoothAdapter? {
        if (closed) return null
        if (permissions(advertising).any { context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }) {
            fail("Allow Nearby devices${if (!advertising) " and precise Location" else ""} in app settings, then try again."); return null
        }
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null || !context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            fail("This phone does not support Bluetooth attendance. Please use another phone."); return null
        }
        if (!adapter.isEnabled) { fail("Bluetooth is off. Turn it on and try again."); return null }
        if (!advertising) {
            val location = context.getSystemService(LocationManager::class.java)
            if (!location.isProviderEnabled(LocationManager.GPS_PROVIDER) && !location.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                fail("Turn on Location in your phone settings so nearby classroom signals can be found."); return null
            }
        }
        return adapter
    }
    // A single non-connectable advertisement can be received by all student phones.
    fun searchClassroom() = search("CLASSROOM", true)
    fun broadcastClassroom() = broadcast("CLASSROOM", true)
    fun search(studentId: String, shared: Boolean = false) {
        stop()
        try {
            if (!StudentId.valid(studentId)) { fail("Enter a valid student ID before searching."); return }
            val adapter = adapter(false) ?: return
            val scanner = adapter.bluetoothLeScanner ?: run { fail("Bluetooth scanning is unavailable. Turn Bluetooth off and on, then retry."); return }
            val token = generation
            val callback = object : ScanCallback() {
                private fun accept(result: ScanResult) {
                    val bytes = result.scanRecord?.getServiceData(UUID_DATA)
                    if (!(if (shared) ClassroomSignal.isClassroom(bytes) else ClassroomSignal.matches(bytes, studentId))) return
                    handler.post {
                        if (!closed && generation == token) { stop(); onState(ClassroomState.Found) }
                    }
                }
                override fun onScanResult(callbackType: Int, result: ScanResult) = accept(result)
                override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::accept)
                override fun onScanFailed(errorCode: Int) {
                    handler.post { if (!closed && generation == token)
                        fail("The classroom search could not start. Wait 30 seconds before trying again.") }
                }
            }
            this.scanner = scanner; scan = callback
            onState(ClassroomState.Searching)
            scanner.startScan(listOf(ScanFilter.Builder().setServiceData(UUID_DATA,
                if (shared) ClassroomSignal.classroomPayload() else ClassroomSignal.encode(studentId)).build()),
                ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), callback)
            handler.postDelayed({ if (!closed && generation == token)
                fail("Coordinator not detected. Move closer and ask her to open the class.") }, 20_000)
        } catch (_: SecurityException) { fail("Bluetooth permission changed. Allow Nearby devices and precise Location, then retry.") }
        catch (_: Exception) { fail("Bluetooth is unavailable. Turn it off and on, then try again.") }
    }
    fun broadcast(studentId: String, shared: Boolean = false) {
        stop()
        try {
            if (!StudentId.valid(studentId)) { fail("Enter a valid student ID before opening a session."); return }
            val adapter = adapter(true) ?: return
            val advertiser = adapter.bluetoothLeAdvertiser
            if (!adapter.isMultipleAdvertisementSupported || advertiser == null) {
                fail("This phone cannot host a classroom session. Use another phone as coordinator."); return
            }
            val token = generation
            val startupTimeout = Runnable { if (!closed && generation == token)
                fail("Bluetooth did not open the session. Turn Bluetooth off and on, then retry.") }
            val callback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    handler.post {
                        if (!closed && generation == token) {
                            handler.removeCallbacks(startupTimeout)
                            onState(ClassroomState.Broadcasting)
                        }
                    }
                }
                override fun onStartFailure(errorCode: Int) {
                    handler.post { if (!closed && generation == token)
                        fail("The classroom session could not open. Close other Bluetooth apps and try again.") }
                }
            }
            this.advertiser = advertiser; advert = callback
            onState(ClassroomState.Starting)
            handler.postDelayed(startupTimeout, 10_000)
            advertiser.startAdvertising(AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).setConnectable(false).build(),
                AdvertiseData.Builder().setIncludeDeviceName(false).setIncludeTxPowerLevel(false)
                    .addServiceData(UUID_DATA, if (shared) ClassroomSignal.classroomPayload() else ClassroomSignal.encode(studentId)).build(), callback)
            handler.postDelayed({ if (!closed && generation == token)
                fail("The five-minute session has ended. Open another session if needed.") }, 300_000)
        } catch (_: SecurityException) { fail("Bluetooth permission changed. Allow Nearby devices, then retry.") }
        catch (_: Exception) { fail("Bluetooth is unavailable. Turn it off and on, then try again.") }
    }
    private fun fail(message: String) { stop(); if (!closed) onState(ClassroomState.Failed(message)) }
    fun stop() {
        generation++; handler.removeCallbacksAndMessages(null)
        val oldScan = scan; val oldAdvert = advert
        scan = null; advert = null
        try { oldScan?.let { scanner?.stopScan(it) } } catch (_: SecurityException) { } catch (_: IllegalStateException) { }
        try { oldAdvert?.let { advertiser?.stopAdvertising(it) } } catch (_: SecurityException) { } catch (_: IllegalStateException) { }
        scanner = null; advertiser = null
    }
    override fun close() {
        if (closed) return
        closed = true; stop(); context.unregisterReceiver(receiver)
    }
}
