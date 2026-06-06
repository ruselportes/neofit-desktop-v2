package com.neofit.smsgateway;

import android.telephony.SmsManager;
import android.util.Log;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;
import java.util.Enumeration;

public class NanoHTTPD {
    private static final String TAG = "NanoHTTPD";
    private static final int PORT = 8080;

    private ServerSocket serverSocket;
    private boolean running = false;
    private String ipAddress;
    private final SmsManager smsManager = SmsManager.getDefault();

    public interface Callback {
        void onServerStart(String url);
        void onServerStop();
        void onError(String message);
        void onSmsSent(String to, boolean success);
    }

    private final Callback callback;

    public NanoHTTPD(Callback callback) {
        this.callback = callback;
        this.ipAddress = getLocalIpAddress();
    }

    public String getUrl() {
        return "http://" + ipAddress + ":" + PORT;
    }

    public int getPort() {
        return PORT;
    }

    public boolean isRunning() {
        return running;
    }

    public void start() {
        if (running) return;
        running = true;
        new Thread(() -> {
            try {
                serverSocket = new ServerSocket(PORT, 50, InetAddress.getByName("0.0.0.0"));
                callback.onServerStart(getUrl());
                while (running) {
                    try {
                        Socket client = serverSocket.accept();
                        new Thread(() -> handleClient(client)).start();
                    } catch (IOException e) {
                        if (running) Log.e(TAG, "Accept error: " + e.getMessage());
                    }
                }
            } catch (IOException e) {
                running = false;
                callback.onError("Failed to start server: " + e.getMessage());
            }
        }).start();
    }

    public void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {}
        callback.onServerStop();
    }

    private void handleClient(Socket client) {
        try {
            BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream()));
            PrintWriter out = new PrintWriter(client.getOutputStream());

            String requestLine = in.readLine();
            if (requestLine == null) { client.close(); return; }

            String[] parts = requestLine.split(" ");
            String method = parts[0];
            String path = parts.length > 1 ? parts[1] : "/";

            int contentLength = 0;
            String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("content-length:")) {
                    contentLength = Integer.parseInt(line.substring(15).trim());
                }
            }

            String body = "";
            if (contentLength > 0) {
                char[] buf = new char[contentLength];
                in.read(buf, 0, contentLength);
                body = new String(buf);
            }

            if (method.equals("GET") && path.equals("/health")) {
                sendJson(out, 200, "{\"status\":\"ok\",\"url\":\"" + getUrl() + "\"}");
            } else if (method.equals("POST") && path.equals("/send-sms")) {
                handleSendSms(out, body);
            } else {
                sendJson(out, 404, "{\"error\":\"Not found\"}");
            }

            out.flush();
            client.close();
        } catch (Exception e) {
            Log.e(TAG, "Client error: " + e.getMessage());
        }
    }

    private void handleSendSms(PrintWriter out, String body) {
        try {
            org.json.JSONObject json = new org.json.JSONObject(body);
            String to = json.optString("to", "");
            String message = json.optString("message", "");

            if (to.isEmpty() || message.isEmpty()) {
                sendJson(out, 400, "{\"success\":false,\"error\":\"Missing 'to' or 'message'\"}");
                return;
            }

            smsManager.sendTextMessage(to, null, message, null, null);
            Log.i(TAG, "SMS sent to " + to);
            callback.onSmsSent(to, true);
            sendJson(out, 200, "{\"success\":true}");
        } catch (Exception e) {
            Log.e(TAG, "SMS send error: " + e.getMessage());
            callback.onSmsSent("", false);
            sendJson(out, 500, "{\"success\":false,\"error\":\"" + e.getMessage().replace("\"", "\\\"") + "\"}");
        }
    }

    private void sendJson(PrintWriter out, int statusCode, String json) {
        String status = statusCode == 200 ? "OK" : statusCode == 400 ? "Bad Request" : "Not Found";
        out.print("HTTP/1.1 " + statusCode + " " + status + "\r\n");
        out.print("Content-Type: application/json\r\n");
        out.print("Content-Length: " + json.length() + "\r\n");
        out.print("Connection: close\r\n");
        out.print("\r\n");
        out.print(json);
    }

    private String getLocalIpAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) return "127.0.0.1";
            for (NetworkInterface intf : Collections.list(interfaces)) {
                for (InetAddress addr : Collections.list(intf.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "IP detection error: " + e.getMessage());
        }
        return "127.0.0.1";
    }
}
