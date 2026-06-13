import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { registerBackgroundTask } from '../lib/background';
import { setupNotifications } from '../lib/notifications';

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      await setupNotifications();
      await registerBackgroundTask();
    })();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#fafafa',
          tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#27272a' },
          tabBarActiveTintColor: '#ea580c',
          tabBarInactiveTintColor: '#71717a',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="grid" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="logs"
          options={{
            title: 'Logs',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="list" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="settings" size={size} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
