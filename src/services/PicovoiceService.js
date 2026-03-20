import {
   PermissionsAndroid,
   Platform,
} from 'react-native';
import {
   PorcupineManager,
} from '@picovoice/porcupine-react-native';
import Config from '../constants/Config';

let porcupineManager = null;

const PicovoiceService = {

   init: async (onWakeWord) => {
      try {
         console.log('Porcupine init starting...');
         console.log('Access key:', Config.PICOVOICE_ACCESS_KEY ? 'present' : 'missing');
         console.log('Wake word file:', Config.WAKE_WORD_FILE);
         const hasPermission = await PicovoiceService.requestPermission();
         if (!hasPermission) {
            console.warn('Microphone permission denied for Picovoice');
            return false;
         }

         // Stop existing instance first
         await PicovoiceService.stop();

         // Create PorcupineManager with custom wake word file
         porcupineManager = await PorcupineManager.fromKeywordPaths(
            Config.PICOVOICE_ACCESS_KEY,
            [Config.WAKE_WORD_FILE],
            (keywordIndex) => {
               console.log('Wake word detected! Index:', keywordIndex);
               if (onWakeWord) {
                  onWakeWord();
               }
            },
            (error) => {
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