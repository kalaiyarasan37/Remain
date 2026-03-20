import AsyncStorage from '@react-native-async-storage/async-storage';

const Storage = {
  set: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage set error:', e);
    }
  },

  get: async (key) => {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },

  remove: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Storage remove error:', e);
    }
  },

  clear: async () => {
    try {
      await AsyncStorage.clear();
    } catch (e) {
      console.error('Storage clear error:', e);
    }
  },
};

export default Storage;