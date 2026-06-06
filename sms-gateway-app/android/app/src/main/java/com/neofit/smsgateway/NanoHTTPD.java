package com.neofit.smsgateway;

import android.content.Context;
import android.telephony.SmsManager;
import android.util.Log;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;

import org.json.JSONArray;
import org.json.JSONObject;

public class NanoHTTPD {
    private static final String TAG = "NanoHTTPD";
    private static final int PORT = 8080;
    private static final String LOG_FILE = "sms_logs.json";

    private ServerSocket serverSocket;
    private boolean running = false;
    private String ipAddress;
    private final SmsManager smsManager = SmsManager.getDefault();
    private Context context;

    private static final List<SmsLogEntry> smsLog = new ArrayList<>();
    private static long logIdCounter = 0;
    private static final Object logLock = new Object();
    private static Context staticContext;

    public static class SmsLogEntry {
        public final long id;
        public final String to;
        public final String message;
        public final boolean success;
        public final String timestamp;
        public final String error;

        public SmsLogEntry(long id, String to, String message, boolean success, String timestamp, String error) {
            this.id = id;
            this.to = to;
            this.message = message;
            this.success = success;
            this.timestamp = timestamp;
            this.error = error;
        }
    }

    public interface Callback {
        void onServerStart(String url);
        void onServerStop();
        void onError(String message);
        void onSmsSent(String to, boolean success);
    }

    private final Callback callback;

    public NanoHTTPD(Callback callback, Context context) {
        this.callback = callback;
        this.context = context;
        staticContext = context;
        this.ipAddress = getLocalIpAddress();
        loadLogsFromFile();
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

    public static void addLogEntry(String to, String message, boolean success, String error) {
        synchronized (logLock) {
            String ts = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(new Date());
            smsLog.add(new SmsLogEntry(logIdCounter++, to, message, success, ts, error != null ? error : ""));
            saveLogsToFile();
        }
    }

    public static String getLogsAsJson() {
        synchronized (logLock) {
            JSONArray arr = new JSONArray();
            for (SmsLogEntry entry : smsLog) {
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("id", entry.id);
                    obj.put("to", entry.to);
                    obj.put("message", entry.message);
                    obj.put("success", entry.success);
                    obj.put("timestamp", entry.timestamp);
                    obj.put("error", entry.error);
                    arr.put(obj);
                } catch (Exception ignored) {}
            }
            return arr.toString();
        }
    }

    public static void clearLogs() {
        synchronized (logLock) {
            smsLog.clear();
            logIdCounter = 0;
            saveLogsToFile();
        }
    }

    private static void loadLogsFromFile() {
        if (staticContext == null) return;
        synchronized (logLock) {
            try {
                File file = new File(staticContext.getFilesDir(), LOG_FILE);
                if (file.exists()) {
                    FileInputStream fis = new FileInputStream(file);
                    BufferedReader reader = new BufferedReader(new InputStreamReader(fis));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    JSONArray arr = new JSONArray(sb.toString());
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject obj = arr.getJSONObject(i);
                        smsLog.add(new SmsLogEntry(
                            obj.getLong("id"),
                            obj.optString("to", ""),
                            obj.optString("message", ""),
                            obj.optBoolean("success", false),
                            obj.optString("timestamp", ""),
                            obj.optString("error", "")
                        ));
                        long eid = obj.getLong("id");
                        if (eid >= logIdCounter) logIdCounter = eid + 1;
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to load logs: " + e.getMessage());
            }
        }
    }

    private static void saveLogsToFile() {
        if (staticContext == null) return;
        synchronized (logLock) {
            try {
                JSONArray arr = new JSONArray();
                for (SmsLogEntry entry : smsLog) {
                    JSONObject obj = new JSONObject();
                    obj.put("id", entry.id);
                    obj.put("to", entry.to);
                    obj.put("message", entry.message);
                    obj.put("success", entry.success);
                    obj.put("timestamp", entry.timestamp);
                    obj.put("error", entry.error);
                    arr.put(obj);
                }
                FileOutputStream fos = staticContext.openFileOutput(LOG_FILE, Context.MODE_PRIVATE);
                fos.write(arr.toString().getBytes());
                fos.close();
            } catch (Exception e) {
                Log.e(TAG, "Failed to save logs: " + e.getMessage());
            }
        }
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
                StringBuilder sb = new StringBuilder(contentLength);
                char[] buf = new char[4096];
                int total = 0;
                while (total < contentLength) {
                    int n = in.read(buf, 0, Math.min(buf.length, contentLength - total));
                    if (n == -1) break;
                    sb.append(buf, 0, n);
                    total += n;
                }
                body = sb.toString();
            }

            if (method.equals("GET") && path.equals("/health")) {
                sendJson(out, 200, "{\"status\":\"ok\",\"url\":\"" + getUrl() + "\"}");
            } else if (method.equals("POST") && path.equals("/send-sms")) {
                handleSendSms(out, body);
            } else if (method.equals("GET") && path.equals("/logs")) {
                sendJson(out, 200, getLogsAsJson());
            } else if (method.equals("POST") && path.equals("/clear-logs")) {
                clearLogs();
                sendJson(out, 200, "{\"success\":true}");
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
            addLogEntry(to, message, true, null);
            callback.onSmsSent(to, true);
            sendJson(out, 200, "{\"success\":true}");
        } catch (Exception e) {
            Log.e(TAG, "SMS send error: " + e.getMessage());
            addLogEntry("", "", false, e.getMessage());
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
