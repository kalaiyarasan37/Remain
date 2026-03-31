import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import notifee, { EventType } from '@notifee/react-native';
import ReminderService from './src/services/ReminderService';
import Tts from 'react-native-tts';
import Sound from 'react-native-sound';
import Storage from './src/utils/Storage';

import { DeviceEventEmitter } from 'react-native';

Sound.setCategory('Playback');

let currentAlarm = null;
let notificationTtsPlaying = false;
let alarmTrimInterval = null;

const playAlarm = async () => {
  if (currentAlarm) {
    currentAlarm.stop(() => {
      currentAlarm.release();
    });
  }

  let alarmSoundPath = 'alarm.ogg';
  try {
    const savedSound = await Storage.get('alarm_sound');
    if (savedSound) {
      alarmSoundPath = savedSound;
    }
  } catch (e) {
    console.error('Failed to get alarm_sound preference', e);
  }

  const isBundled = alarmSoundPath === 'alarm.ogg' || alarmSoundPath === 'chime.ogg' || alarmSoundPath === 'beep.ogg';
  const basePath = isBundled ? Sound.MAIN_BUNDLE : '';
  
  // Load the selected sound file
  currentAlarm = new Sound(alarmSoundPath, basePath, (error) => {
    if (error) {
      console.log('Failed to load the alarm sound, falling back to default', error);
      currentAlarm = new Sound('alarm.ogg', Sound.MAIN_BUNDLE, (defaultErr) => {
        if (!defaultErr) {
           currentAlarm.setNumberOfLoops(-1);
           currentAlarm.play();
        }
      });
      return;
    }

    const duration = currentAlarm.getDuration();
    if (duration > 30) {
      // Fake trim: Restrict looping to the first 30 seconds
      currentAlarm.play();
      alarmTrimInterval = setInterval(() => {
         if (currentAlarm && currentAlarm.isLoaded()) {
            currentAlarm.setCurrentTime(0);
         } else {
            clearInterval(alarmTrimInterval);
         }
      }, 30000);
    } else {
      currentAlarm.setNumberOfLoops(-1); // infinite loop
      currentAlarm.play((success) => {
        if (!success) {
          console.log('playback failed due to audio decoding errors');
        }
      });
    }
  });
};

const stopAlarmAndTts = () => {
  notificationTtsPlaying = false;
  global.activeAlarmNotification = null;
  Tts.stop();
  if (alarmTrimInterval) {
    clearInterval(alarmTrimInterval);
    alarmTrimInterval = null;
  }
  if (currentAlarm) {
    currentAlarm.stop(() => {
      currentAlarm.release();
      currentAlarm = null;
    });
  }
};

Tts.addEventListener('tts-finish', () => {
  if (notificationTtsPlaying) {
    notificationTtsPlaying = false;
    playAlarm();
  }
});

Tts.addEventListener('tts-cancel', () => {
  if (notificationTtsPlaying) {
    notificationTtsPlaying = false;
  }
});

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

const speakNotification = (notification) => {
  if (notification?.data?.otp) {
    Tts.speak(`Your Remain App OTP is ${notification.data.otp}`);
    return;
  }
  
  const titleToSpeak = notification?.data?.reminderTitle || notification?.title || 'You have a reminder';
  const cleanTitle = titleToSpeak.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[✅✓📊📋💪☀️📌📅💡🌅🎉✨🔴🟡🟢🔔⏰📍]/gu, '').trim();
  
  const bodyToSpeak = notification?.body ? notification.body.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[✅✓📊📋💪☀️📌📅💡🌅🎉✨🔴🟡🟢🔔⏰📍]/gu, '').trim() : '';

  let speechText = `Reminder: ${cleanTitle}`;
  if (bodyToSpeak && bodyToSpeak.toLowerCase() !== 'tap to view details' && !bodyToSpeak.includes('Next:')) {
    speechText += `. ${bodyToSpeak}`;
  }

  // Repeat it two times
  let fullSpeech = `${speechText}. ${speechText}.`;

  // Append next reminder if available
  try {
    const nextRaw = notification?.data?.nextReminders;
    if (nextRaw) {
      const nextList = JSON.parse(nextRaw);
      if (Array.isArray(nextList) && nextList.length > 0) {
        const next = nextList[0];
        const d = new Date(next.dateTime);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const nextClean = (next.title || '').replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[✅✓📊📋💪☀️📌📅💡🌅🎉✨🔴🟡🟢🔔⏰📍]/gu, '').trim();
        fullSpeech += ` Next reminder at ${hh}:${mm}: ${nextClean}.`;
      }
    }
  } catch (e) {
    // ignore
  }

  // Flag that a notification TTS is playing, so 'tts-finish' can trigger the alarm
  notificationTtsPlaying = true;
  Tts.speak(fullSpeech);
};

// UI Listener for Alarm Stop
DeviceEventEmitter.addListener('STOP_ALARM_FROM_UI', async (notification) => {
   stopAlarmAndTts();
   if (notification) {
      const reminderId = notification.data?.reminderId;
      const isOtp = !!notification.data?.otp;
      // Only mark complete for real reminders (not OTP, and only when logged in)
      if (reminderId && !isOtp) {
         try {
            await ReminderService.complete(reminderId);
         } catch (e) {
            console.warn('Could not mark reminder complete:', e.message);
         }
      }
      if (notification.id) {
         await notifee.cancelNotification(notification.id);
      }
   }
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  const reminderId = notification?.data?.reminderId;

  if (type === EventType.DELIVERED) {
    // Only trigger alarm screen for actual reminder notifications (not OTP)
    if (!notification?.data?.otp) {
      global.activeAlarmNotification = notification;
      DeviceEventEmitter.emit('SHOW_ALARM', notification);
    }
    speakNotification(notification);
  } else if (type === EventType.ACTION_PRESS) {
    if (pressAction?.id === 'mark_done') {
      stopAlarmAndTts();
      await ReminderService.complete(reminderId);
      await notifee.cancelNotification(notification.id);
    } else if (pressAction?.id === 'copy_otp') {
      await handleCopyOtp(notification);
      await notifee.cancelNotification(notification.id);
    }
  } else if (type === EventType.PRESS) {
    stopAlarmAndTts();
    if (notification?.id) {
      if (reminderId) {
        DeviceEventEmitter.emit('NOTIFICATION_PRESSED', reminderId);
      }
      await notifee.cancelNotification(notification.id);
    }
  } else if (type === EventType.DISMISSED) {
    stopAlarmAndTts();
  }
});

// Also handle foreground events so it works while app is open
notifee.onForegroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  
  if (type === EventType.DELIVERED) {
    // Only trigger alarm screen for actual reminder notifications (not OTP)
    if (!notification?.data?.otp) {
      global.activeAlarmNotification = notification;
      DeviceEventEmitter.emit('SHOW_ALARM', notification);
    }
    speakNotification(notification);
  } else if (type === EventType.ACTION_PRESS) {
    if (pressAction?.id === 'mark_done') {
      stopAlarmAndTts();
      const reminderId = notification?.data?.reminderId;
      if (reminderId) {
        await ReminderService.complete(reminderId);
      }
      await notifee.cancelNotification(notification.id);
    } else if (pressAction?.id === 'copy_otp') {
      await handleCopyOtp(notification);
      await notifee.cancelNotification(notification.id);
    }
  } else if (type === EventType.PRESS || type === EventType.DISMISSED) {
    stopAlarmAndTts();
    await notifee.cancelNotification(notification?.id);
  }
});

AppRegistry.registerComponent(appName, () => App);