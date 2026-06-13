import { requireNativeModule } from 'expo-modules-core';

interface SmsModule {
  sendSms(phoneNumber: string, message: string): Promise<boolean>;
}

const module = requireNativeModule<SmsModule>('SmsModule');

export function sendSms(phoneNumber: string, message: string): Promise<boolean> {
  return module.sendSms(phoneNumber, message);
}
