import notifee, {
  AndroidImportance,
  AndroidVisibility,
  TriggerType,
} from '@notifee/react-native';
import ReminderService from './ReminderService';

const CHANNEL_ID = 'reminders_channel';

const NotificationService = {

  // Create notification channel
  createChannel: async () => {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      vibration: true,
      sound: 'default',
    });
  },

  // Request permission
  requestPermission: async () => {
    const settings = await notifee.requestPermission();
    return settings;
  },

  // Schedule notifications for a single reminder
  scheduleForReminder: async (reminder) => {
    if (reminder.isCompleted || reminder.isDeleted) return;

    const reminderTime = new Date(reminder.dateTime).getTime();
    const now = Date.now();

    // Skip if reminder is in the past
    if (reminderTime <= now) return;

    const timeDiff = reminderTime - now; // ms until reminder
    const oneHour = 60 * 60 * 1000;
    const fiveMin = 5 * 60 * 1000;

    await NotificationService.createChannel();

    // Cancel existing notifications for this reminder
    await NotificationService.cancelForReminder(reminder.id);

    // Determine early notification time
    let earlyTime;
    if (timeDiff <= oneHour) {
      // Reminder within 1 hour → notify 5 min before
      earlyTime = reminderTime - fiveMin;
    } else {
      // Reminder more than 1 hour away → notify 1 hour before
      earlyTime = reminderTime - oneHour;
    }

    // Schedule early notification (only if still in future)
    if (earlyTime > now) {
      await notifee.createTriggerNotification(
        {
          id: `${reminder.id}_early`,
          title: '⏰ Reminder Coming Up',
          body: reminder.title,
          android: {
            channelId: CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            smallIcon: 'ic_launcher',
            pressAction: {id: 'default'},
            showTimestamp: true,
          },
          data: {reminderId: reminder.id},
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: earlyTime,
        },
      );
    }

    // Schedule exact time notification
    await notifee.createTriggerNotification(
      {
        id: `${reminder.id}_exact`,
        title: '🔔 ' + reminder.title,
        body: reminder.location
          ? `📍 ${reminder.location}`
          : 'Tap to view details',
        android: {
          channelId: CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          smallIcon: 'ic_launcher',
          pressAction: {id: 'default'},
          showTimestamp: true,
        },
        data: {reminderId: reminder.id},
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: reminderTime,
      },
    );

    console.log(`Notifications scheduled for reminder: ${reminder.title}`);
  },

  // Cancel notifications for a reminder
  cancelForReminder: async (reminderId) => {
    try {
      await notifee.cancelNotification(`${reminderId}_early`);
      await notifee.cancelNotification(`${reminderId}_exact`);
    } catch (e) {
      // Ignore if not found
    }
  },

  // Schedule notifications for ALL pending reminders
  scheduleAllReminders: async () => {
    try {
      const all = await ReminderService.getAll();
      const pending = all.filter(r => !r.isCompleted && !r.isDeleted);
      for (const reminder of pending) {
        await NotificationService.scheduleForReminder(reminder);
      }
      console.log(`Scheduled notifications for ${pending.length} reminders`);
    } catch (e) {
      console.error('Error scheduling all reminders:', e);
    }
  },

  // Cancel all notifications
  cancelAll: async () => {
    await notifee.cancelAllNotifications();
  },

  // Initialize - call on app start
  init: async () => {
    await NotificationService.createChannel();
    await NotificationService.requestPermission();
    await NotificationService.scheduleAllReminders();
  },
};

export default NotificationService;
