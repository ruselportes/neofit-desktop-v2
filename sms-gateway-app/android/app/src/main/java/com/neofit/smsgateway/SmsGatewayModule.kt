package com.neofit.smsgateway

import android.content.Intent
import android.telephony.SmsManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class SmsGatewayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SmsGatewayModule"

    @ReactMethod
    fun startServer(promise: Promise) {
        val context = reactApplicationContext
        try {
            val intent = Intent(context, SmsGatewayService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            SmsGatewayService.onStatusChange = { status ->
                if (SmsGatewayService.server?.isRunning == true) {
                    promise.resolve(SmsGatewayService.server!!.url)
                }
            }
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        try {
            val context = reactApplicationContext
            context.stopService(Intent(context, SmsGatewayService::class.java))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(SmsGatewayService.server?.isRunning == true)
    }

    @ReactMethod
    fun getServerUrl(promise: Promise) {
        val server = SmsGatewayService.server
        if (server != null && server.isRunning) {
            promise.resolve(server.url)
        } else {
            promise.resolve("")
        }
    }

    @ReactMethod
    fun sendSms(to: String, message: String, promise: Promise) {
        try {
            val smsManager = SmsManager.getDefault()
            smsManager.sendTextMessage(to, null, message, null, null)
            NanoHTTPD.addLogEntry(to, message, true, null)
            promise.resolve(true)
        } catch (e: Exception) {
            NanoHTTPD.addLogEntry(to, message, false, e.message)
            promise.reject("SMS_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearLogs(promise: Promise) {
        NanoHTTPD.clearLogs()
        promise.resolve(true)
    }

    @ReactMethod
    fun discoverDesktop(promise: Promise) {
        Thread {
            try {
                val socket = DatagramSocket()
                socket.broadcast = true
                socket.soTimeout = 2000
                val sendData = "NeoFitDiscover".toByteArray()
                val sendPacket = DatagramPacket(
                    sendData, sendData.size,
                    InetAddress.getByName("255.255.255.255"), 3002
                )
                socket.send(sendPacket)

                val recvBuf = ByteArray(256)
                val recvPacket = DatagramPacket(recvBuf, recvBuf.size)
                try {
                    socket.receive(recvPacket)
                    val response = String(recvPacket.data, 0, recvPacket.length).trim()
                    val prefix = "NeoFitResponse:"
                    if (response.startsWith(prefix)) {
                        promise.resolve(response.substring(prefix.length))
                    } else {
                        promise.resolve("")
                    }
                } catch (e: java.net.SocketTimeoutException) {
                    promise.resolve("")
                }
                socket.close()
            } catch (e: Exception) {
                promise.resolve("")
            }
        }.start()
    }
}
