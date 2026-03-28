import notifee, {
   AndroidImportance,
   AndroidVisibility,
   TriggerType,
} from '@notifee/react-native';
import Storage from '../utils/Storage';
import { getAllReminders } from '../services/ApiService';

const CHANNEL_ID = 'reminders_channel';

const NotificationService = {

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

   requestPermission: async () => {
      const settings = await notifee.requestPermission();
      return settings;
   },

   showOtpNotification: async (otp) => {
      await NotificationService.createChannel();
      await notifee.displayNotification({
         title: 'Your RemainApp OTP',
         body: `Your OTP is ${otp}. Do not share this with anyone.`,
         android: {
            channelId: CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            smallIcon: 'ic_launcher',
            actions: [
               { title: '📋 Copy OTP', pressAction: { id: 'copy_otp' } },
            ],
         },
         data: { otp },
      });
   },

   scheduleForReminder: async (reminder) => {
      const title = reminder.title || reminder.message || 'Reminder';

      if (reminder.isCompleted || reminder.isDeleted) return;
      if (!reminder.dateTime) return;

      const reminderTime = new Date(reminder.dateTime).getTime();
      const now = Date.now();
      if (reminderTime <= now) return;

      const timeDiff = reminderTime - now;
      const oneHour = 60 * 60 * 1000;
      const fiveMin = 5 * 60 * 1000;

      await NotificationService.createChannel();
      await NotificationService.cancelForReminder(reminder.id);

      let earlyTime;
      if (timeDiff <= oneHour) {
         earlyTime = reminderTime - fiveMin;
      } else {
         earlyTime = reminderTime - oneHour;
      }

      if (earlyTime > now) {
         await notifee.createTriggerNotification(
            {
               id: `${reminder.id}_early`,
               title: '⏰ Reminder Coming Up',
               body: title,
               android: {
                  channelId: CHANNEL_ID,
                  importance: AndroidImportance.HIGH,
                  visibility: AndroidVisibility.PUBLIC,
                  smallIcon: 'ic_launcher',
                  pressAction: { id: 'default' },
                  showTimestamp: true,
               },
               data: { reminderId: String(reminder.id) },
            },
            {
               type: TriggerType.TIMESTAMP,
               timestamp: earlyTime,
            },
         );
      }

      await notifee.createTriggerNotification(
         {
            id: `${reminder.id}_exact`,
            title: '🔔 ' + title,
            body: reminder.location
               ? `📍 ${reminder.location}`
               : 'Tap to view details',
            android: {
               channelId: CHANNEL_ID,
               importance: AndroidImportance.HIGH,
               visibility: AndroidVisibility.PUBLIC,
               smallIcon: 'ic_launcher',
               pressAction: { id: 'default' },
               showTimestamp: true,
               actions: [
                  { title: '✅ Done', pressAction: { id: 'mark_done' } },
               ],
            },
            data: { reminderId: String(reminder.id), reminderTitle: title },
         },
         {
            type: TriggerType.TIMESTAMP,
            timestamp: reminderTime,
         },
      );

      console.log(`Notifications scheduled for: ${title}`);
   },

   cancelForReminder: async (reminderId) => {
      try {
         await notifee.cancelNotification(`${reminderId}_early`);
         await notifee.cancelNotification(`${reminderId}_exact`);
      } catch (e) { }
   },

   // ── Now fetches from backend instead of local storage ──
   scheduleAllReminders: async () => {
      try {
         const userData = await Storage.get('user');
         const userId = userData?.id;

         // No user logged in yet — skip silently
         if (!userId) {
            console.log('Scheduled notifications for 0 reminders');
            return;
         }

         const data = await getAllReminders(userId);
         const pending = [
            ...(data.reminders.today || []),
            ...(data.reminders.upcoming || []),
         ].map(r => ({
            id: r.id,
            title: r.message || '',
            location: r.location || '',
            dateTime: r.reminder_date && r.reminder_time
               ? `${r.reminder_date}T${r.reminder_time}`
               : null,
            isCompleted: r.closed || false,
            isDeleted: r.deleted || false,
         }));

         for (const reminder of pending) {
            await NotificationService.scheduleForReminder(reminder);
         }
         console.log(`Scheduled notifications for ${pending.length} reminders`);
      } catch (e) {
         console.log('Scheduled notifications for 0 reminders');
      }
   },

   cancelAll: async () => {
      await notifee.cancelAllNotifications();
   },

   // Schedule notifications for reminders fetched fresh from backend
   scheduleForUserId: async (userId) => {
      try {
         const { getAllReminders } = require('../services/ApiService');
         const data = await getAllReminders(userId);
         const pending = [
            ...(data.reminders.today || []),
            ...(data.reminders.upcoming || []),
         ].map(r => ({
            id: r.id,
            title: r.message || '',
            location: r.location || '',
            dateTime: r.reminder_date && r.reminder_time
               ? `${r.reminder_date}T${r.reminder_time}`
               : null,
            isCompleted: r.closed || false,
            isDeleted: r.deleted || false,
         }));

         await notifee.cancelAllNotifications();

         for (const reminder of pending) {
            await NotificationService.scheduleForReminder(reminder);
         }
         console.log(`Rescheduled notifications for ${pending.length} reminders`);
      } catch (e) {
         console.error('scheduleForUserId error:', e);
      }
   },

   init: async () => {
      await NotificationService.createChannel();
      await NotificationService.requestPermission();
      await NotificationService.scheduleAllReminders();
   },
};

export default NotificationService;