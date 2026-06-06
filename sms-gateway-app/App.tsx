import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeModules } from 'react-native';

const { SmsGatewayModule } = NativeModules;
const POLL_INTERVAL = 3000;

interface LogEntry {
  id: number;
  to: string;
  message: string;
  success: boolean;
  timestamp: string;
  error: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('server');
  const [status, setStatus] = useState('Idle');
  const [serverUrl, setServerUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [desktopUrl, setDesktopUrl] = useState('');
  const [discovering, setDiscovering] = useState(false);

  const [manualTo, setManualTo] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [autoSending, setAutoSending] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    requestSmsPermission();
    SmsGatewayModule.isRunning().then((isRunning: boolean) => {
      if (isRunning) {
        setRunning(true);
        SmsGatewayModule.getServerUrl().then((url: string) => {
          setServerUrl(url);
          setStatus(`Running at ${url}`);
        });
      } else {
        setStatus('Idle — tap Start to begin');
      }
    });
    autoDiscover();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
      pollRef.current = setInterval(fetchLogs, POLL_INTERVAL);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeTab]);

  const requestSmsPermission = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
          {
            title: 'SMS Permission',
            message: 'NeoFit SMS Gateway needs SMS permission to send expiry notifications.',
            buttonPositive: 'Grant',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setStatus('SMS permission denied');
        }
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const autoDiscover = async () => {
    setDiscovering(true);
    try {
      const url = await SmsGatewayModule.discoverDesktop();
      if (url) setDesktopUrl(url);
    } catch (e) {
    } finally {
      setDiscovering(false);
    }
  };

  const fetchLogs = useCallback(async () => {
    if (!serverUrl && !running) return;
    setLoadingLogs(true);
    try {
      const host = serverUrl || 'http://127.0.0.1:8080';
      const res = await fetch(`${host}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
    } finally {
      setLoadingLogs(false);
    }
  }, [serverUrl, running]);

  const handleStart = async () => {
    try {
      setStatus('Starting server...');
      const url = await SmsGatewayModule.startServer();
      setServerUrl(url);
      setRunning(true);
      setStatus(`Running at ${url}`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await SmsGatewayModule.stopServer();
      setRunning(false);
      setServerUrl('');
      setStatus('Stopped');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const handleSendSms = async () => {
    if (!manualTo.trim() || !manualMessage.trim()) {
      setSendResult('Please enter both number and message');
      return;
    }
    setSending(true);
    setSendResult('');
    try {
      await SmsGatewayModule.sendSms(manualTo.trim(), manualMessage.trim());
      setSendResult('SMS sent successfully');
      setManualMessage('');
    } catch (e: any) {
      setSendResult(`Failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleAutoSend = async () => {
    if (!desktopUrl.trim()) {
      Alert.alert('No Desktop URL', 'Enter or discover the desktop server URL first.');
      return;
    }
    setAutoSending(true);
    try {
      const baseUrl = desktopUrl.replace(/\/+$/, '');
      const secret = 'neofit-default';
      const res = await fetch(`${baseUrl}/api/notify/run-from-phone?secret=${secret}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        Alert.alert('Auto-Send', `Desktop processed ${data.sent} notification(s).`);
      } else {
        Alert.alert('Auto-Send Failed', `Desktop returned ${res.status}`);
      }
    } catch (e: any) {
      Alert.alert('Connection Error', `Could not reach desktop: ${e.message}`);
    }
    try {
      const host = serverUrl || 'http://127.0.0.1:8080';
      const res = await fetch(`${host}/logs`);
      if (res.ok) {
        const data: LogEntry[] = await res.json();
        const failed = data.filter(e => !e.success);
        for (const entry of failed) {
          try {
            await SmsGatewayModule.sendSms(entry.to, entry.message);
          } catch (e) {}
        }
        if (failed.length > 0) {
          Alert.alert('Retry', `Retried ${failed.length} failed message(s).`);
        }
      }
    } catch (e) {
    } finally {
      setAutoSending(false);
      fetchLogs();
    }
  };

  const handleClearLogs = async () => {
    try {
      await SmsGatewayModule.clearLogs();
      setLogs([]);
    } catch (e) {
    }
  };

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString();
  };

  const truncate = (s: string, len: number) =>
    s.length > len ? s.substring(0, len) + '...' : s;

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {[
        { key: 'server', label: 'Server' },
        { key: 'send', label: 'Manual Send' },
        { key: 'logs', label: 'Logs' },
      ].map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          onPress={() => setActiveTab(tab.key)}>
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderServerTab = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.title}>NeoFit SMS Gateway</Text>
        <Text style={styles.subtitle}>Android SMS Server</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Server Status</Text>
          <Text style={[styles.badge, running ? styles.badgeGreen : styles.badgeGray]}>
            {running ? 'Online' : 'Offline'}
          </Text>
        </View>
        <Text style={[styles.statusText, running ? styles.textGreen : styles.textMuted]}>
          {status}
        </Text>

        {serverUrl ? (
          <View style={styles.urlBox}>
            <Text style={styles.label}>Server URL</Text>
            <Text style={styles.urlText} selectable>{serverUrl}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, running ? styles.btnGray : styles.btnRed]}
          onPress={running ? handleStop : handleStart}>
          <Text style={styles.btnText}>
            {running ? 'Stop Server' : 'Start Server'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Desktop Connection</Text>
        <Text style={styles.hint}>
          Enter the NeoFit desktop server URL or tap Discover to find it automatically.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="http://192.168.1.100:3001"
            placeholderTextColor="#556"
            value={desktopUrl}
            onChangeText={setDesktopUrl}
          />
          <TouchableOpacity style={styles.btnSmall} onPress={autoDiscover} disabled={discovering}>
            <Text style={styles.btnSmallText}>{discovering ? '...' : 'Scan'}</Text>
          </TouchableOpacity>
        </View>
        {desktopUrl ? (
          <Text style={styles.textGreen}>Connected to desktop</Text>
        ) : (
          <Text style={styles.textMuted}>No desktop configured</Text>
        )}

        <TouchableOpacity
          style={[styles.btn, styles.btnBlue, { marginTop: 12 }]}
          onPress={handleAutoSend}
          disabled={autoSending || !running}>
          <Text style={styles.btnText}>
            {autoSending ? 'Sending...' : 'Auto-Send Notifications'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSendTab = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.label}>Manual SMS</Text>
        <Text style={styles.hint}>Send an SMS directly through the phone's SIM card.</Text>

        {!running && (
          <Text style={[styles.textMuted, { marginBottom: 12 }]}>
            Start the server first to enable SMS sending.
          </Text>
        )}

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholder="+639123456789"
          placeholderTextColor="#556"
          value={manualTo}
          onChangeText={setManualTo}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Type your message here..."
          placeholderTextColor="#556"
          value={manualMessage}
          onChangeText={setManualMessage}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.btn, styles.btnGreen, { marginTop: 8 }]}
          onPress={handleSendSms}
          disabled={sending || !running}>
          <Text style={styles.btnText}>
            {sending ? 'Sending...' : 'Send SMS'}
          </Text>
        </TouchableOpacity>

        {sendResult ? (
          <Text style={[styles.result, sendResult.startsWith('SMS sent') ? styles.textGreen : styles.textRed]}>
            {sendResult}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const renderLogItem = ({ item }: { item: LogEntry }) => (
    <View style={styles.logItem}>
      <View style={styles.logIcon}>
        <Text style={item.success ? styles.textGreen : styles.textRed}>
          {item.success ? '✓' : '✗'}
        </Text>
      </View>
      <View style={styles.logContent}>
        <Text style={styles.logTo}>{item.to || '(unknown)'}</Text>
        <Text style={styles.logMessage}>{truncate(item.message, 60)}</Text>
        {item.error ? <Text style={styles.logError}>{item.error}</Text> : null}
      </View>
      <Text style={styles.logTime}>{formatTime(item.timestamp)}</Text>
    </View>
  );

  const renderLogsTab = () => (
    <View style={styles.section}>
      <View style={styles.logHeader}>
        <Text style={styles.label}>SMS Logs ({logs.length})</Text>
        <View style={styles.logActions}>
          <TouchableOpacity style={styles.btnSmall} onPress={fetchLogs} disabled={loadingLogs}>
            <Text style={styles.btnSmallText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSmall, styles.btnSmallDanger]}
            onPress={handleClearLogs}>
            <Text style={styles.btnSmallText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!running && (
        <Text style={[styles.textMuted, { padding: 16, textAlign: 'center' }]}>
          Start the server to view SMS logs.
        </Text>
      )}

      <FlatList
        data={logs}
        keyExtractor={item => String(item.id)}
        renderItem={renderLogItem}
        style={styles.logList}
        ListEmptyComponent={
          running ? (
            <Text style={[styles.textMuted, { padding: 32, textAlign: 'center' }]}>
              No SMS logs yet.
            </Text>
          ) : null
        }
        refreshing={loadingLogs}
        onRefresh={fetchLogs}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderTabBar()}
      {activeTab === 'server' && renderServerTab()}
      {activeTab === 'send' && renderSendTab()}
      {activeTab === 'logs' && renderLogsTab()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#e94560',
  },
  tabText: {
    fontSize: 14,
    color: '#667788',
  },
  tabTextActive: {
    color: '#e94560',
    fontWeight: 'bold',
  },
  section: {
    flex: 1,
    padding: 12,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#8899aa',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: '#8899aa',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  badge: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badgeGreen: {
    backgroundColor: '#1b4332',
    color: '#52b788',
  },
  badgeGray: {
    backgroundColor: '#2d2d44',
    color: '#8899aa',
  },
  statusText: {
    fontSize: 14,
    marginBottom: 12,
  },
  urlBox: {
    backgroundColor: '#0d1b2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  urlText: {
    fontSize: 16,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    color: '#4fc3f7',
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 12,
    color: '#667788',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#0d1b2a',
    borderRadius: 8,
    padding: 12,
    color: '#eee',
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1a2a44',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnRed: { backgroundColor: '#e94560' },
  btnGreen: { backgroundColor: '#2d8a4e' },
  btnBlue: { backgroundColor: '#1a5276' },
  btnGray: { backgroundColor: '#333355' },
  btnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  btnSmall: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 6,
  },
  btnSmallDanger: {
    backgroundColor: '#4a1a1a',
  },
  btnSmallText: {
    fontSize: 12,
    color: '#ccc',
  },
  result: {
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  textGreen: { color: '#52b788' },
  textRed: { color: '#e94560' },
  textMuted: { color: '#667788' },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logActions: {
    flexDirection: 'row',
  },
  logList: {
    flex: 1,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  logIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logContent: {
    flex: 1,
  },
  logTo: {
    fontSize: 13,
    color: '#ddd',
    fontWeight: 'bold',
  },
  logMessage: {
    fontSize: 12,
    color: '#8899aa',
    marginTop: 2,
  },
  logError: {
    fontSize: 11,
    color: '#e94560',
    marginTop: 2,
  },
  logTime: {
    fontSize: 11,
    color: '#556',
    marginLeft: 8,
  },
});
