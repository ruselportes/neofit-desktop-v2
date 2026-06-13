import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sms-failures', {
      name: 'SMS Failures',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function notifySmsFailed(recipient: string, error: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'SMS Failed',
      body: `To ${recipient}: ${error}`,
      data: { recipient, error },
    },
    trigger: null,
  });
}
