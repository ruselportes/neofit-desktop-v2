package com.neofit.smsgateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class SmsGatewayService : Service() {

    companion object {
        const val CHANNEL_ID = "sms_gateway_channel"
        const val NOTIFICATION_ID = 1001
        var server: NanoHTTPD? = null
        var onStatusChange: ((String) -> Unit)? = null
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)

        val callback = object : NanoHTTPD.Callback {
            override fun onServerStart(url: String) {
                onStatusChange?.invoke("Running at $url")
            }
            override fun onServerStop() {
                onStatusChange?.invoke("Stopped")
            }
            override fun onError(message: String) {
                onStatusChange?.invoke("Error: $message")
            }
            override fun onSmsSent(to: String, success: Boolean) {
                val msg = if (success) "SMS sent to $to" else "SMS failed to $to"
                onStatusChange?.invoke(msg)
            }
        }

        server?.stop()
        server = NanoHTTPD(callback)
        server?.start()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        server?.stop()
        server = null
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Gateway Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the SMS gateway server running"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("NeoFit SMS Gateway")
            .setContentText("Server is running")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
}
