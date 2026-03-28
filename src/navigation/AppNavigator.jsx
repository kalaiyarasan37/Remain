import React, { useEffect, useRef } from 'react';
import { ToastAndroid } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import notifee, { EventType } from '@notifee/react-native';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import AddReminderScreen from '../screens/AddReminderScreen';
import ReminderListScreen from '../screens/ReminderListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import Storage from '../utils/Storage';

const Stack = createStackNavigator();

const AppNavigator = () => {
   const navigationRef = useRef(null);

   useEffect(() => {
  // Just create the channel on app start — scheduling happens after login
  notifee.createChannel({
    id: 'reminders_channel',
    name: 'Reminders',
    importance: 4,      // AndroidImportance.HIGH
  });

  const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail;
    const reminderId = notification?.data?.reminderId;

    if (type === EventType.ACTION_PRESS) {
      if (pressAction?.id === 'mark_done') {
        try {
          const { getReminder, updateReminder } = require('../services/ApiService');
          const reminder = await getReminder(reminderId);
          await updateReminder(reminderId, {
            message: reminder.message,
            date: reminder.reminder_date,
            time: reminder.reminder_time,
            location: reminder.location,
            type: reminder.reminder_type || 'ONCE',
            closed: true,
          });
          await notifee.cancelNotification(notification.id);
          ToastAndroid.show('✅ Marked as done', ToastAndroid.SHORT);

          // Reschedule after marking done
          const userData = await Storage.get('user');
          if (userData?.id) {
            const NotificationService = require('../services/NotificationService').default;
            NotificationService.scheduleForUserId(userData.id).catch(() => {});
          }
        } catch (e) {
          console.error('Mark done error:', e);
        }
      }
    } else if (type === EventType.PRESS) {
      if (reminderId) {
        navigationRef.current?.navigate('Home', { openContextId: reminderId });
      }
    }
  });

  notifee.getInitialNotification().then(initialNotification => {
    if (initialNotification) {
      const reminderId = initialNotification.notification?.data?.reminderId;
      if (reminderId) {
        setTimeout(() => {
          navigationRef.current?.navigate('Home', { openContextId: reminderId });
        }, 1200);
      }
    }
  });

  return () => unsubscribe();
}, []);

   return (
      <NavigationContainer ref={navigationRef}>
         <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="AddReminder" component={AddReminderScreen} />
            <Stack.Screen name="ReminderList" component={ReminderListScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
         </Stack.Navigator>
      </NavigationContainer>
   );
};

export default AppNavigator;