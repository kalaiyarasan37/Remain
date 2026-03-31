import notifee, {
   AndroidImportance,
   AndroidVisibility,
   TriggerType,
} from '@notifee/react-native';
import Storage from '../utils/Storage';
import { getAllReminders } from '../services/ApiService';

// Helper: fetch next upcoming reminders after a given timestamp
const getNextReminders = async (afterTimestamp, limit = 3) => {
   try {
      const userData = await Storage.get('user');
      const userId = userData?.id;
      if (!userId) return [];
      const data = await getAllReminders(userId);
      const pendingRaw = [
         ...(data.reminders.today    || []),
         ...(data.reminders.upcoming || []),
      ];
      const unique = Array.from(new Map(pendingRaw.map(r => [r.id, r])).values());
      return unique
         .filter(r => {
            if (r.closed || r.deleted) return false;
            const dt = r.reminder_date && r.reminder_time
               ? new Date(`${r.reminder_date}T${r.reminder_time}`).getTime()
               : 0;
            return dt > afterTimestamp;
         })
         .sort((a, b) => {
            const ta = new Date(`${a.reminder_date}T${a.reminder_time}`).getTime();
            const tb = new Date(`${b.reminder_date}T${b.reminder_time}`).getTime();
            return ta - tb;
         })
         .slice(0, limit)
         .map(r => ({
            id: String(r.id),
            title: r.message || '',
            dateTime: `${r.reminder_date}T${r.reminder_time}`,
            location: r.location || '',
         }));
   } catch (e) {
      return [];
   }
};

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

      // Fetch next reminders after this one fires
      const nextReminders = await getNextReminders(reminderTime);
      const nextRemindersJson = JSON.stringify(nextReminders);

      // Build a body hint based on next reminder
      let bodyText = reminder.location ? `📍 ${reminder.location}` : 'Tap to view details';
      if (nextReminders.length > 0) {
         const next = nextReminders[0];
         const nextDate = new Date(next.dateTime);
         const hh = String(nextDate.getHours()).padStart(2, '0');
         const mm = String(nextDate.getMinutes()).padStart(2, '0');
         bodyText += `  •  Next: ${next.title} at ${hh}:${mm}`;
      }

      await notifee.createTriggerNotification(
         {
            id: `${reminder.id}_exact`,
            title: '🔔 ' + title,
            body: bodyText,
            android: {
               channelId: CHANNEL_ID,
               importance: AndroidImportance.HIGH,
               visibility: AndroidVisibility.PUBLIC,
               smallIcon: 'ic_launcher',
               pressAction: { id: 'default' },
               fullScreenAction: { id: 'default' },
               showTimestamp: true,
               actions: [
                  { title: '✅ Done', pressAction: { id: 'mark_done' } },
               ],
            },
            data: {
               reminderId: String(reminder.id),
               reminderTitle: title,
               nextReminders: nextRemindersJson,
            },
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
         const pendingRaw = [
            ...(data.reminders.today || []),
            ...(data.reminders.upcoming || []),
         ];
         const uniquePending = Array.from(new Map(pendingRaw.map(item => [item.id, item])).values());
         const pending = uniquePending.map(r => ({
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
         const pendingRaw = [
            ...(data.reminders.today || []),
            ...(data.reminders.upcoming || []),
         ];
         const uniquePending = Array.from(new Map(pendingRaw.map(item => [item.id, item])).values());
         const pending = uniquePending.map(r => ({
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