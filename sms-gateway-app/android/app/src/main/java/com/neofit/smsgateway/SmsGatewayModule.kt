package com.neofit.smsgateway

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

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
}
