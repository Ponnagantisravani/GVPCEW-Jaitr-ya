package com.gvpcew.testing

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.*

/** Paired, authenticated RFCOMM connections; no network service or approval endpoint. */
object ReviewBluetooth {
    val SERVICE: UUID = UUID.fromString("a31f7203-8e9b-4b35-93f0-67ed21c409aa")
    private val timeouts = Executors.newSingleThreadScheduledExecutor()
    fun permissions(): Array<String> = if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_CONNECT) else emptyArray()
    @SuppressLint("MissingPermission")
    fun adapter(context: Context): BluetoothAdapter {
        check(permissions().all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) { "Allow Nearby devices in app permissions." }
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
        check(adapter != null && adapter.isEnabled) { "Turn on Bluetooth on both phones." }
        return adapter
    }
    fun deadline(socket: BluetoothSocket) = timeouts.schedule({ runCatching { socket.close() } }, 30, TimeUnit.SECONDS)
    @SuppressLint("MissingPermission")
    fun exchange(context: Context, address: String, request: ReviewRequest): ReviewReply {
        val adapter = adapter(context)
        val device = adapter.bondedDevices.firstOrNull { it.address == address }
            ?: error("Pair with the coordinator in Bluetooth settings, then choose her phone.")
        device.createRfcommSocketToServiceRecord(SERVICE).use { socket ->
            val deadline = deadline(socket)
            try {
                socket.connect()
                ReviewWire.writeRequest(DataOutputStream(socket.outputStream), request)
                return ReviewWire.readReply(DataInputStream(socket.inputStream))
            } catch (e: IOException) {
                throw IOException("Bluetooth transfer interrupted. Keep the coordinator screen open and retry. Attendance is not marked until accepted.", e)
            } finally { deadline.cancel(false) }
        }
    }
}

@SuppressLint("MissingPermission") // adapter() checks CONNECT; incoming sockets are authenticated paired peers.
class ReviewBluetoothServer(context: Context, private val ledger: ReviewLedger,
                            private val changed: () -> Unit, private val failed: (String) -> Unit) : AutoCloseable {
    @Volatile var accepting = true
    @Volatile private var closed = false
    private val sockets = ConcurrentHashMap.newKeySet<BluetoothSocket>()
    private val workers = Executors.newFixedThreadPool(3)
    private val slots = Semaphore(3)
    private val listener: BluetoothServerSocket = ReviewBluetooth.adapter(context)
        .listenUsingRfcommWithServiceRecord("GVPCEW attendance review", ReviewBluetooth.SERVICE)
    init {
        Thread({
            try {
                while (!closed) {
                    val socket = listener.accept()
                    if (closed || !slots.tryAcquire()) { socket.close(); continue }
                    sockets.add(socket)
                    try { workers.execute { serve(socket) } }
                    catch (_: RejectedExecutionException) { sockets.remove(socket); slots.release(); socket.close() }
                }
            } catch (_: IOException) {
                if (!closed) { close(); failed("Bluetooth listener stopped. Turn Bluetooth on and tap Open class.") }
            }
        }, "attendance-bluetooth-listener").start()
    }
    private fun serve(socket: BluetoothSocket) {
        val deadline = ReviewBluetooth.deadline(socket)
        try {
            socket.use {
                val out = DataOutputStream(it.outputStream)
                try {
                    val request = ReviewWire.readRequest(DataInputStream(it.inputStream))
                    val reply = when (request.operation) {
                        "JOIN" -> synchronized(ledger) {
                            check(accepting && !closed && ledger.classId.isNotEmpty()) { "The coordinator has closed submissions." }
                            ReviewReply(ledger.classId)
                        }
                        "SUBMIT" -> {
                            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(request.photo, 0, request.photo.size, bounds)
                            require(bounds.outWidth in 1..1280 && bounds.outHeight in 1..1280) { "Invalid photo. Capture again." }
                            val decoded = BitmapFactory.decodeByteArray(request.photo, 0, request.photo.size)
                            requireNotNull(decoded) { "Photo could not be read. Capture again." }
                            decoded.recycle()
                            val record = ledger.submit(request.requestId, request.classId, request.studentId,
                                it.remoteDevice.address, request.photo, accepting && !closed)
                            changed(); ReviewWire.reply(record)
                        }
                        "STATUS" -> ReviewWire.reply(ledger.receipt(request.requestId, it.remoteDevice.address))
                        else -> error("Unsupported request.")
                    }
                    ReviewWire.writeReply(out, reply)
                } catch (e: Exception) {
                    runCatching { ReviewWire.writeError(out, e.message ?: "Could not save submission. Retry.") }
                }
            }
        } catch (_: IOException) { /* A retry uses the same request ID. */ }
        finally { deadline.cancel(false); sockets.remove(socket); slots.release() }
    }
    override fun close() {
        closed = true; accepting = false
        runCatching { listener.close() }
        sockets.forEach { runCatching { it.close() } }; sockets.clear()
        workers.shutdownNow()
    }
}
