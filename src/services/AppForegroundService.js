import { NativeModules } from 'react-native';

const { AppForeground } = NativeModules;

const AppForegroundService = {
  bringToForeground: () => {
    try {
      if (AppForeground) {
        AppForeground.bringToForeground();
      }
    } catch (e) {
      console.error('BringToForeground error:', e);
    }
  },
};

export default AppForegroundService;

