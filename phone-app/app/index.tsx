import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { runNow, sendAllPending } from '../lib/background';
import { getSendMode, setSendMode, type SendMode } from '../lib/settings';
import { useFocusEffect } from 'expo-router';

export default function Dashboard() {
  const [pendingCount, setPendingCount] = useState(0);
  const [sentToday, setSentToday] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sendMode, setSendModeState] = useState<SendMode>('auto');
  const [modeLoaded, setModeLoaded] = useState(false);

  const fetchStats = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const [pending, sent, failed] = await Promise.all([
      supabase.from('sms_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('sms_queue').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', today),
      supabase.from('sms_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);

    setPendingCount(pending.count || 0);
    setSentToday(sent.count || 0);
    setFailedCount(failed.count || 0);
    setLastSync(new Date().toLocaleTimeString());
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await fetchStats();
        const mode = await getSendMode();
        setSendModeState(mode);
        setModeLoaded(true);
      })();
    }, [fetchStats])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await runNow();
    await fetchStats();
    setRefreshing(false);
  };

  const toggleMode = async () => {
    const next: SendMode = sendMode === 'auto' ? 'manual' : 'auto';
    await setSendMode(next);
    setSendModeState(next);
  };

  const onSendAll = async () => {
    setRefreshing(true);
    await sendAllPending();
    await fetchStats();
    setRefreshing(false);
  };

  const syncColor = pendingCount > 0 ? '#f59e0b' : '#10b981';
  const isManual = modeLoaded && sendMode === 'manual';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ea580c" />}
    >
      <View style={styles.grid}>
        <View style={[styles.card, { borderLeftColor: syncColor }]}>
          <Ionicons name="hourglass" size={28} color={syncColor} />
          <Text style={styles.number}>{pendingCount}</Text>
          <Text style={styles.label}>Pending</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: '#10b981' }]}>
          <Ionicons name="checkmark-circle" size={28} color="#10b981" />
          <Text style={styles.number}>{sentToday}</Text>
          <Text style={styles.label}>Sent Today</Text>
        </View>
      </View>
      <View style={styles.grid}>
        <View style={[styles.card, { borderLeftColor: failedCount > 0 ? '#ef4444' : '#71717a' }]}>
          <Ionicons name="close-circle" size={28} color={failedCount > 0 ? '#ef4444' : '#71717a'} />
          <Text style={styles.number}>{failedCount}</Text>
          <Text style={styles.label}>Failed</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: '#71717a' }]}>
          <Ionicons name="time" size={28} color="#71717a" />
          <Text style={[styles.number, { fontSize: 16 }]}>{lastSync || '--'}</Text>
          <Text style={styles.label}>Last Sync</Text>
        </View>
      </View>

      {/* Mode Toggle */}
      <TouchableOpacity
        style={[styles.modeBtn, isManual ? styles.modeBtnManual : styles.modeBtnAuto]}
        onPress={toggleMode}
        disabled={!modeLoaded}
      >
        <Ionicons
          name={isManual ? 'hand-left' : 'flash'}
          size={20}
          color="#fff"
        />
        <Text style={styles.modeBtnText}>
          {isManual ? 'Manual Send' : 'Auto Send'}
        </Text>
        <Ionicons name="swap-horizontal" size={16} color="#ffffffaa" />
      </TouchableOpacity>

      {isManual && pendingCount > 0 && (
        <TouchableOpacity style={styles.sendAllBtn} onPress={onSendAll}>
          <Ionicons name="send" size={20} color="#fff" />
          <Text style={styles.sendAllText}>Send All Pending ({pendingCount})</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.syncBtn} onPress={onRefresh}>
        <Ionicons name="sync" size={20} color="#fff" />
        <Text style={styles.syncText}>Sync Now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
  },
  number: { fontSize: 32, fontWeight: '700', color: '#fafafa', marginTop: 8 },
  label: { fontSize: 13, color: '#a1a1aa', marginTop: 4 },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 8,
  },
  modeBtnAuto: {
    backgroundColor: '#2563eb',
  },
  modeBtnManual: {
    backgroundColor: '#7c3aed',
  },
  modeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sendAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ea580c',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 8,
  },
  sendAllText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ea580c',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  syncText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
