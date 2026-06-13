import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { supabase } from './supabase';
import { getDeviceId } from './device';
import { sendSms } from '../modules/sms-module';
import { notifySmsFailed } from './notifications';

const BACKGROUND_TASK = 'neofit-sms-poll';

TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    const deviceId = await getDeviceId();

    const { data: pending, error } = await supabase
      .from('sms_queue')
      .select('*')
      .eq('status', 'pending')
      .is('device_id', null)
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) throw error;
    if (!pending || pending.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    for (const item of pending) {
      await supabase
        .from('sms_queue')
        .update({ device_id: deviceId })
        .eq('id', item.id)
        .is('device_id', null);

      try {
        await sendSms(item.recipient, item.message);
        await supabase
          .from('sms_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('device_id', deviceId);
      } catch (sendErr) {
        await supabase
          .from('sms_queue')
          .update({ status: 'failed', error: (sendErr as Error).message })
          .eq('id', item.id)
          .eq('device_id', deviceId);

        await notifySmsFailed(item.recipient, (sendErr as Error).message);
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask() {
  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Denied) return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK, {
      minimumInterval: 5 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}

export async function unregisterBackgroundTask() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK);
  }
}

export async function runNow() {
  await TaskManager.executeTask(BACKGROUND_TASK, { data: {} });
}
