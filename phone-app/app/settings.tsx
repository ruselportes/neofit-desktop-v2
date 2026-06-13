import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceId } from '../lib/device';
import { registerBackgroundTask, unregisterBackgroundTask } from '../lib/background';
import { supabase } from '../lib/supabase';
import { sendSms } from '../modules/sms-module';

export default function Settings() {
  const [deviceId, setDeviceId] = useState('');
  const [bgEnabled, setBgEnabled] = useState(true);
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  const toggleBg = async (value: boolean) => {
    setBgEnabled(value);
    if (value) {
      await registerBackgroundTask();
    } else {
      await unregisterBackgroundTask();
    }
  };

  const sendTest = async () => {
    if (!testNumber.trim() || !testMessage.trim()) {
      Alert.alert('Error', 'Enter a number and message.');
      return;
    }
    setSending(true);
    try {
      await supabase.from('sms_queue').insert({
        recipient: testNumber.trim(),
        message: testMessage.trim(),
        status: 'pending',
        member_name: 'Test',
      });
      Alert.alert('Queued', 'Test SMS queued in Supabase.');
    } catch {
      Alert.alert('Error', 'Failed to queue test SMS.');
    }
    setSending(false);
  };

  const sendDirect = async () => {
    if (!testNumber.trim() || !testMessage.trim()) {
      Alert.alert('Error', 'Enter a number and message.');
      return;
    }
    setSending(true);
    try {
      await sendSms(testNumber.trim(), testMessage.trim());
      Alert.alert('Sent', 'Direct SMS sent successfully.');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
    setSending(false);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Device ID</Text>
          <Text style={styles.value}>{deviceId}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Background Polling</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Enabled (every ~5 min)</Text>
          <Switch value={bgEnabled} onValueChange={toggleBg} trackColor={{ true: '#ea580c' }} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Send Test SMS</Text>
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor="#52525b"
          value={testNumber}
          onChangeText={setTestNumber}
          keyboardType="phone-pad"
          maxLength={11}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Message"
          placeholderTextColor="#52525b"
          value={testMessage}
          onChangeText={setTestMessage}
          multiline
          numberOfLines={3}
        />
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btn} onPress={sendTest} disabled={sending}>
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={styles.btnText}>{sending ? '...' : 'Queue via Supabase'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#1d4ed8' }]} onPress={sendDirect} disabled={sending}>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.btnText}>{sending ? '...' : 'Send Direct'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Supabase Config</Text>
        <View style={styles.row}>
          <Text style={styles.label}>URL</Text>
          <Text style={[styles.value, { fontSize: 12 }]}>{process.env.EXPO_PUBLIC_SUPABASE_URL}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Anon Key</Text>
          <Text style={[styles.value, { fontSize: 10 }]} selectable>{process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 30)}...</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  section: { backgroundColor: '#18181b', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { color: '#fafafa', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { color: '#a1a1aa', fontSize: 14 },
  value: { color: '#fafafa', fontSize: 13, fontFamily: 'monospace', maxWidth: '60%', textAlign: 'right' },
  input: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    color: '#fafafa',
    padding: 12,
    fontSize: 15,
    marginBottom: 8,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ea580c',
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
