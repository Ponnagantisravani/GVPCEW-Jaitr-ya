package com.gvpcew.testing

import android.annotation.SuppressLint
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Context
import org.json.JSONObject
import java.io.DataInputStream
import java.io.DataOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

object PortalWire {
    val service: UUID = UUID.fromString("a31f7204-8e9b-4b35-93f0-67ed21c409aa")
    const val MAX_BYTES = 2_100_000
    private val timer = Executors.newSingleThreadScheduledExecutor()
    fun write(out: DataOutputStream, data: JSONObject) {
        val bytes = data.toString().toByteArray(Charsets.UTF_8)
        require(bytes.size in 1..MAX_BYTES) { "Capture is too large. Capture again." }
        out.writeInt(1);out.writeInt(bytes.size);out.write(bytes);out.flush()
    }
    fun read(input: DataInputStream): JSONObject {
        require(input.readInt() == 1) { "Update both phones to the same portal app." }
        val size = input.readInt()
        require(size in 1..MAX_BYTES) { "Invalid Bluetooth message size." }
        val bytes = ByteArray(size);input.readFully(bytes)
        return JSONObject(String(bytes, Charsets.UTF_8))
    }
    fun deadline(socket: BluetoothSocket) = timer.schedule({ runCatching { socket.close() } }, 40, TimeUnit.SECONDS)
    @SuppressLint("MissingPermission")
    fun exchange(context: Context, address: String, request: JSONObject): JSONObject {
        val device = ReviewBluetooth.adapter(context).bondedDevices.firstOrNull { it.address == address }
            ?: error("Pair with the coordinator's phone first.")
        device.createRfcommSocketToServiceRecord(service).use { socket ->
            val timeout = deadline(socket)
            try {
                socket.connect();write(DataOutputStream(socket.outputStream), request)
                val reply = read(DataInputStream(socket.inputStream))
                check(!reply.has("error")) { reply.getString("error") }
                return reply
            } finally { timeout.cancel(false) }
        }
    }
}

@SuppressLint("MissingPermission")
class PortalBluetoothServer(context: Context, private val handle: (JSONObject, String) -> JSONObject,
                            private val failed: (String) -> Unit) : AutoCloseable {
    @Volatile private var closed = false
    private val workers = Executors.newFixedThreadPool(3)
    private val slots = Semaphore(3)
    private val sockets = ConcurrentHashMap.newKeySet<BluetoothSocket>()
    private val listener: BluetoothServerSocket = ReviewBluetooth.adapter(context)
        .listenUsingRfcommWithServiceRecord("GVPCEW portal attendance", PortalWire.service)
    init {
        Thread({
            try {
                while (!closed) {
                    val socket = listener.accept()
                    if (closed || !slots.tryAcquire()) { socket.close();continue }
                    sockets.add(socket)
                    try { workers.execute { serve(socket) } }
                    catch (_: Exception) { sockets.remove(socket);slots.release();socket.close() }
                }
            } catch (_: Exception) { if (!closed) { close();failed("Bluetooth stopped. Reopen the class connection.") } }
        }, "portal-bluetooth").start()
    }
    private fun serve(socket: BluetoothSocket) {
        val timeout = PortalWire.deadline(socket)
        try {
            socket.use {
                val reply = try { handle(PortalWire.read(DataInputStream(it.inputStream)), it.remoteDevice.address) }
                    catch (e: Exception) { JSONObject().put("error", e.message ?: "Verification failed. Attendance is not confirmed.") }
                PortalWire.write(DataOutputStream(it.outputStream), reply)
            }
        } catch (_: Exception) { /* Student retries the same challenge to recover a committed receipt. */ }
        finally { timeout.cancel(false);sockets.remove(socket);slots.release() }
    }
    override fun close() {
        closed = true;runCatching { listener.close() }
        sockets.forEach { runCatching { it.close() } };workers.shutdownNow()
    }
}
