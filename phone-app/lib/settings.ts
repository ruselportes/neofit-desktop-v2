import AsyncStorage from '@react-native-async-storage/async-storage';

const SEND_MODE_KEY = 'neofit_sms_send_mode';

export type SendMode = 'auto' | 'manual';

export async function getSendMode(): Promise<SendMode> {
  const mode = await AsyncStorage.getItem(SEND_MODE_KEY);
  if (mode === 'auto' || mode === 'manual') return mode;
  return 'auto';
}

export async function setSendMode(mode: SendMode): Promise<void> {
  await AsyncStorage.setItem(SEND_MODE_KEY, mode);
}
