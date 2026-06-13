import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from 'expo-router';

type SmsItem = {
  id: number;
  recipient: string;
  message: string;
  status: string;
  error?: string;
  created_at: string;
};

const statusConfig: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pending: { icon: 'time', color: '#f59e0b' },
  sent: { icon: 'checkmark-circle', color: '#10b981' },
  failed: { icon: 'close-circle', color: '#ef4444' },
};

export default function Logs() {
  const [logs, setLogs] = useState<SmsItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('sms_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  const renderItem = ({ item }: { item: SmsItem }) => {
    const cfg = statusConfig[item.status] || statusConfig.pending;
    return (
      <View style={styles.item}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        <View style={styles.itemContent}>
          <Text style={styles.recipient}>{item.recipient}</Text>
          <Text style={styles.message} numberOfLines={1}>{item.message}</Text>
          {item.error && <Text style={styles.error}>{item.error}</Text>}
          <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: cfg.color + '20' }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{item.status}</Text>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      data={logs}
      keyExtractor={item => String(item.id)}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLogs().finally(() => setRefreshing(false)); }} tintColor="#ea580c" />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="ban" size={40} color="#52525b" />
          <Text style={styles.emptyText}>No SMS records</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    gap: 10,
  },
  itemContent: { flex: 1 },
  recipient: { color: '#fafafa', fontWeight: '600', fontSize: 15 },
  message: { color: '#a1a1aa', fontSize: 13, marginTop: 2 },
  error: { color: '#ef4444', fontSize: 12, marginTop: 2 },
  time: { color: '#52525b', fontSize: 11, marginTop: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#52525b', marginTop: 8, fontSize: 15 },
});
