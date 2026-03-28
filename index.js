import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import notifee, { EventType } from '@notifee/react-native';
import ReminderService from './src/services/ReminderService';

import { DeviceEventEmitter } from 'react-native';

// Helper to copy OTP to clipboard
const handleCopyOtp = async (notification) => {
  const otp = notification?.data?.otp;
  if (otp) {
    try {
      const Clipboard = require('@react-native-clipboard/clipboard').default;
      Clipboard.setString(String(otp));
      console.log('✅ OTP copied to clipboard:', otp);
    } catch (err) {
      console.error('❌ Failed to copy OTP:', err);
    }
  }
};

notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  const reminderId = notification?.data?.reminderId;

  if (type === EventType.ACTION_PRESS) {
    if (pressAction?.id === 'mark_done') {
      await ReminderService.complete(reminderId);
      await notifee.cancelNotification(notification.id);
    } else if (pressAction?.id === 'copy_otp') {
      await handleCopyOtp(notification);
      await notifee.cancelNotification(notification.id);
    }
  } else if (type === EventType.PRESS) {
    if (notification?.id) {
      if (reminderId) {
        DeviceEventEmitter.emit('NOTIFICATION_PRESSED', reminderId);
      }
      await notifee.cancelNotification(notification.id);
    }
  }
});

// Also handle foreground events so it works while app is open
notifee.onForegroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  if (type === EventType.ACTION_PRESS && pressAction?.id === 'copy_otp') {
    await handleCopyOtp(notification);
    await notifee.cancelNotification(notification.id);
  }
});

AppRegistry.registerComponent(appName, () => App);