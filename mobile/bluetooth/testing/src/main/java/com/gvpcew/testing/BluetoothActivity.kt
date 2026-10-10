package com.gvpcew.testing

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.*

/** Foreground-only experiment. Every BLE operation is gated by runtime permissions. */
@SuppressLint("MissingPermission", "SetTextI18n")
class BluetoothActivity : Activity() {
    private lateinit var modes: RadioGroup
    private lateinit var idInput: EditText
    private lateinit var start: Button
    private lateinit var stop: Button
    private lateinit var status: TextView
    private lateinit var students: ListView
    private lateinit var empty: TextView
    private lateinit var rows: ArrayAdapter<String>
    private val detected = linkedSetOf<String>()
    private val handler = Handler(Looper.getMainLooper())
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertisingCallback: AdvertiseCallback? = null
    private var scanner: BluetoothLeScanner? = null
    private var scanningCallback: ScanCallback? = null
    private var permissionPending = false
    private var visible = false
    private val studentMode: Boolean get() = modes.checkedRadioButtonId == R.id.studentMode
    private val active: Boolean get() = advertisingCallback != null || scanningCallback != null
    private val scanTimeout = Runnable { stopBle("Scan finished after 60 seconds. Results retained.") }

    private val bluetoothState = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED &&
                intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1) != BluetoothAdapter.STATE_ON && active) {
                stopBle("Bluetooth turned off. Enable it in Settings, then press Start.")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // Respect status/navigation bars with target SDK 35's edge-to-edge behavior.
        val root = findViewById<View>(R.id.root)
        val padding = root.paddingLeft
        root.setOnApplyWindowInsetsListener { view, insets ->
            @Suppress("DEPRECATION")
            view.setPadding(padding + insets.systemWindowInsetLeft,
                padding + insets.systemWindowInsetTop, padding + insets.systemWindowInsetRight,
                padding + insets.systemWindowInsetBottom)
            insets
        }
        modes = findViewById(R.id.modes)
        idInput = findViewById(R.id.studentId)
        start = findViewById(R.id.start)
        stop = findViewById(R.id.stop)
        status = findViewById(R.id.status)
        students = findViewById(R.id.students)
        empty = findViewById(R.id.empty)
        rows = ArrayAdapter(this, android.R.layout.simple_list_item_1, mutableListOf<String>())
        students.adapter = rows
        modes.setOnCheckedChangeListener { _, _ ->
            stopBle("Mode selected. Press Start when ready.")
        }
        start.setOnClickListener { requestStart() }
        stop.setOnClickListener { stopBle("Stopped. Scan results retained until the next scan.") }
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= 33) {
            // Bluetooth broadcasts can originate from the privileged Bluetooth process.
            registerReceiver(bluetoothState, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(bluetoothState, filter)
        }
        render()
    }

    override fun onStart() {
        super.onStart()
        visible = true
    }

    override fun onStop() {
        visible = false
        if (active) stopBle("Stopped because the app left the foreground. Press Start to resume.")
        super.onStop()
    }

    override fun onDestroy() {
        stopBle("Stopped.")
        unregisterReceiver(bluetoothState)
        super.onDestroy()
    }

    private fun requiredPermissions(): Array<String> = buildList {
        if (Build.VERSION.SDK_INT >= 31) {
            add(Manifest.permission.BLUETOOTH_CONNECT)
            add(if (studentMode) Manifest.permission.BLUETOOTH_ADVERTISE else Manifest.permission.BLUETOOTH_SCAN)
        }
        if (!studentMode) {
            // Nearby attendance implies presence. Request location instead of declaring
            // neverForLocation (which can also filter some BLE advertisements).
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }.toTypedArray()

    private fun requestStart() {
        if (active || permissionPending) return
        if (studentMode && !BleProtocol.isValid(BleProtocol.normalize(idInput.text.toString()))) {
            idInput.error = "Use 1â€“10 letters, digits, underscores or hyphens (e.g. 23CSE001)."
            return
        }
        val permissions = requiredPermissions()
        if (permissions.any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }) {
            permissionPending = true
            render()
            requestPermissions(permissions, 100)
        } else startBle()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 100) return
        permissionPending = false
        render()
        if (requiredPermissions().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) {
            if (visible) startBle() else status.text = "Permissions granted. Press Start to begin."
        } else {
            status.text = "Permission denied. Allow Nearby devices and, for scanning, precise Location " +
                "while using the app. Press Start to retry; if no prompt appears, open Settings > Apps > BLE Attendance Prototype > Permissions."
        }
    }

    private fun startBle() {
        if (!visible || active) return
        try {
            val adapter = getSystemService(BluetoothManager::class.java)?.adapter
            if (!packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) || adapter == null) {
                status.text = "This phone does not support BLE."
                return
            }
            if (!adapter.isEnabled) {
                status.text = "Turn Bluetooth on in Quick Settings, then press Start again. No pairing needed."
                return
            }
            if (studentMode) startAdvertising(adapter) else {
                val location = getSystemService(LocationManager::class.java)
                if (!location.isProviderEnabled(LocationManager.GPS_PROVIDER) &&
                    !location.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    status.text = "Turn Location on in phone Settings, then press Start Scan again."
                    return
                }
                startScanning(adapter)
            }
        } catch (e: SecurityException) {
            stopBle("Permission unavailable. Check this app's Nearby devices / Location permissions.")
        } catch (e: IllegalStateException) {
            stopBle("Bluetooth unavailable. Turn Bluetooth on and retry.")
        } catch (e: IllegalArgumentException) {
            stopBle("BLE configuration rejected: ${e.message}")
        }
    }

    private fun startAdvertising(adapter: BluetoothAdapter) {
        val bleAdvertiser = adapter.bluetoothLeAdvertiser
        if (!adapter.isMultipleAdvertisementSupported || bleAdvertiser == null) {
            status.text = "BLE advertising is not supported on this phone. Try it as Coordinator or use another Student phone."
            return
        }
        val id = BleProtocol.normalize(idInput.text.toString())
        idInput.setText(id)
        // Put the complete ID in the primary advertisement. A custom 128-bit UUID
        // identifies our protocol without borrowing a Bluetooth SIG assigned UUID.
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceData(BleProtocol.SERVICE_UUID, BleProtocol.encode(id))
            .build()
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .setTimeout(0) // Continue until Stop or Activity.onStop().
            .build()
        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                runOnUiThread {
                    if (advertisingCallback === this) status.text = "Advertising Student ID: $id. Keep this app open."
                }
            }
            override fun onStartFailure(errorCode: Int) {
                runOnUiThread {
                    if (advertisingCallback !== this) return@runOnUiThread
                    val reason = when (errorCode) {
                        ADVERTISE_FAILED_DATA_TOO_LARGE -> "Advertisement exceeds the phone's packet limit."
                        ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "No advertising slots available. Close other BLE apps."
                        ADVERTISE_FAILED_ALREADY_STARTED -> "Advertising was already started."
                        ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Phone does not support BLE advertising."
                        else -> "Bluetooth internal error; toggle Bluetooth and retry."
                    }
                    stopBle("Advertising failed ($errorCode): $reason")
                }
            }
        }
        advertiser = bleAdvertiser
        advertisingCallback = callback
        status.text = "Starting advertisementâ€¦"
        render()
        bleAdvertiser.startAdvertising(settings, data, callback)
    }

    private fun startScanning(adapter: BluetoothAdapter) {
        val bleScanner = adapter.bluetoothLeScanner
        if (bleScanner == null) {
            status.text = "BLE scanner unavailable. Toggle Bluetooth and retry."
            return
        }
        detected.clear()
        rows.clear()
        // Match the service-DATA UUID, not setServiceUuid(): we do not advertise
        // a separate service UUID list. Empty data matches any payload for this UUID.
        val filter = ScanFilter.Builder()
            .setServiceData(BleProtocol.SERVICE_UUID, byteArrayOf())
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)
            .build()
        val callback = object : ScanCallback() {
            private fun accept(result: ScanResult) {
                val id = BleProtocol.decode(result.scanRecord?.getServiceData(BleProtocol.SERVICE_UUID)) ?: return
                runOnUiThread {
                    // Ignore late callbacks from stopped/previous scans. Deduplicate by
                    // Student ID, since BLE MAC addresses can change and packets repeat.
                    if (scanningCallback !== this) return@runOnUiThread
                    if (detected.add(id)) {
                        rows.add(id)
                        empty.visibility = View.GONE
                        status.text = "Scanningâ€¦ ${detected.size} unique student(s) detected."
                    }
                }
            }
            override fun onScanResult(callbackType: Int, result: ScanResult) = accept(result)
            override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::accept)
            override fun onScanFailed(errorCode: Int) {
                runOnUiThread {
                    if (scanningCallback === this) stopBle("Scan failed ($errorCode). Wait 30 seconds before retrying; close other BLE scanning apps.")
                }
            }
        }
        scanner = bleScanner
        scanningCallback = callback
        status.text = "Scanning for 60 secondsâ€¦ Keep the Student app advertising nearby."
        render()
        bleScanner.startScan(listOf(filter), settings, callback)
        // Bound each scan to avoid draining the battery or scanning indefinitely.
        handler.postDelayed(scanTimeout, 60_000)
    }

    private fun stopBle(message: String) {
        handler.removeCallbacks(scanTimeout)
        val oldAdvertising = advertisingCallback
        val oldScanning = scanningCallback
        // Invalidate callbacks before stopping, so queued results cannot alter the UI.
        advertisingCallback = null
        scanningCallback = null
        try { oldAdvertising?.let { advertiser?.stopAdvertising(it) } }
        catch (_: SecurityException) { /* Permission may have been revoked. */ }
        catch (_: IllegalStateException) { /* Bluetooth may already be off. */ }
        try { oldScanning?.let { scanner?.stopScan(it) } }
        catch (_: SecurityException) { /* Permission may have been revoked. */ }
        catch (_: IllegalStateException) { /* Bluetooth may already be off. */ }
        advertiser = null
        scanner = null
        status.text = message
        render()
    }

    private fun render() {
        val busy = active || permissionPending
        start.isEnabled = !busy
        stop.isEnabled = active
        idInput.isEnabled = !busy
        for (i in 0 until modes.childCount) modes.getChildAt(i).isEnabled = !permissionPending
        idInput.visibility = if (studentMode) View.VISIBLE else View.GONE
        start.setText(if (studentMode) R.string.start_attendance else R.string.start_scan)
        students.visibility = if (studentMode) View.GONE else View.VISIBLE
        findViewById<View>(R.id.listTitle).visibility = if (studentMode) View.GONE else View.VISIBLE
        empty.visibility = if (!studentMode && detected.isEmpty()) View.VISIBLE else View.GONE
        if (active) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}

