import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee, {EventType} from '@notifee/react-native';

// Handle notification tap when app is in background/killed
notifee.onBackgroundEvent(async ({type, detail}) => {
  const {notification} = detail;
  
  if (type === EventType.PRESS) {
    console.log('Notification tapped:', notification?.title);
    // Mark notification as read
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
  }
});

AppRegistry.registerComponent(appName, () => App);