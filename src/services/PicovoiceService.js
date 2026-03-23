import {
   PermissionsAndroid,
   Platform,
   AppState,
} from 'react-native';
import { PorcupineManager } from '@picovoice/porcupine-react-native';
import Config from '../constants/Config';
import AppForegroundService from './AppForegroundService';

let porcupineManager = null;
let onWakeWordCallback = null;

const PicovoiceService = {

   init: async onWakeWord => {
      try {
         console.log('Porcupine init starting...');
         onWakeWordCallback = onWakeWord;

         if (!PorcupineManager) {
            console.warn('PorcupineManager not available');
            return false;
         }

         await new Promise(resolve => setTimeout(resolve, 2000));
         const hasPermission = await PicovoiceService.requestPermission();

         if (!hasPermission) {
            console.warn('Microphone permission denied for Picovoice');
            return false;
         }

         await PicovoiceService.stop();

         porcupineManager = await PorcupineManager.fromKeywordPaths(
            Config.PICOVOICE_ACCESS_KEY,
            [Config.WAKE_WORD_FILE],
            (keywordIndex) => {
               console.log('Wake word detected! Index:', keywordIndex);
               // Bring app to foreground first
               AppForegroundService.bringToForeground();
               // Longer delay to let app fully come to foreground
               setTimeout(() => {
                  if (onWakeWordCallback) {
                     onWakeWordCallback();
                  }
               }, 1000);
            },
            error => {
               console.error('Porcupine error:', error);
            },
         );

         await porcupineManager.start();
         console.log('PorcupineManager started - listening for Hey RemainApp');
         return true;
      } catch (e) {
         console.error('Porcupine init error:', e);
         return false;
      }
   },

   pauseForVoiceInput: async () => {
      try {
         if (porcupineManager) {
            await porcupineManager.stop();
            console.log('Porcupine paused for voice input');
         }
      } catch (e) {
         console.error('Porcupine pause error:', e);
      }
   },

   resumeAfterVoiceInput: async () => {
      try {
         if (porcupineManager) {
            await porcupineManager.start();
            console.log('Porcupine resumed after voice input');
         }
      } catch (e) {
         console.error('Porcupine resume error:', e);
      }
   },

   stop: async () => {
      try {
         if (porcupineManager) {
            await porcupineManager.stop();
            await porcupineManager.delete();
            porcupineManager = null;
            console.log('PorcupineManager stopped');
         }
      } catch (e) {
         console.error('Porcupine stop error:', e);
      }
   },

   requestPermission: async () => {
      if (Platform.OS === 'android') {
         const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
               title: 'Wake Word Permission',
               message: 'RemainApp needs microphone to listen for "Hey RemainApp"',
               buttonPositive: 'Allow',
               buttonNegative: 'Deny',
            },
         );
         return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
   },
};

export default PicovoiceService;