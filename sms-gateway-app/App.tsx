import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  StyleSheet,
} from 'react-native';
import { NativeModules, NativeEventEmitter } from 'react-native';

const { SmsGatewayModule } = NativeModules;

export default function App() {
  const [status, setStatus] = useState('Idle');
  const [serverUrl, setServerUrl] = useState('');
  const [running, setRunning] = useState(false);

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
  }, []);

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
          setStatus('⚠️ SMS permission denied');
        }
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const handleStart = async () => {
    try {
      setStatus('Starting server...');
      const url = await SmsGatewayModule.startServer();
      setServerUrl(url);
      setRunning(true);
      setStatus(`✅ Running at ${url}`);
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await SmsGatewayModule.stopServer();
      setRunning(false);
      setServerUrl('');
      setStatus('Stopped');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>NeoFit SMS Gateway</Text>
        <Text style={styles.subtitle}>Android SMS Server</Text>

        <View style={styles.statusContainer}>
          <Text style={styles.label}>Server Status</Text>
          <Text style={[styles.status, running ? styles.statusRunning : styles.statusIdle]}>
            {status}
          </Text>
        </View>

        {serverUrl ? (
          <View style={styles.urlContainer}>
            <Text style={styles.label}>Server URL</Text>
            <Text style={styles.url} selectable>{serverUrl}</Text>
          </View>
        ) : null}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Enter this URL in the NeoFit Desktop app → Settings → SMS Gateway to connect.
          </Text>
          <Text style={styles.infoText}>
            Make sure both devices are on the same Wi-Fi network.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, running ? styles.buttonStop : styles.buttonStart]}
          onPress={running ? handleStop : handleStart}>
          <Text style={styles.buttonText}>
            {running ? 'Stop Server' : 'Start Server'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8899aa',
    marginBottom: 24,
  },
  statusContainer: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: '#8899aa',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  status: {
    fontSize: 16,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
  },
  statusRunning: {
    backgroundColor: '#1b4332',
    color: '#52b788',
  },
  statusIdle: {
    backgroundColor: '#2d2d44',
    color: '#8899aa',
  },
  urlContainer: {
    width: '100%',
    marginBottom: 16,
  },
  url: {
    fontSize: 18,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    color: '#4fc3f7',
    backgroundColor: '#0d1b2a',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#1a2332',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    width: '100%',
  },
  infoText: {
    fontSize: 12,
    color: '#667788',
    marginBottom: 4,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#e94560',
  },
  buttonStop: {
    backgroundColor: '#333355',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
