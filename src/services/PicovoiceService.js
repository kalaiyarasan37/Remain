import { Platform, PermissionsAndroid } from 'react-native';
import { PorcupineManager, BuiltInKeyword } from '@picovoice/porcupine-react-native';
import { navigate } from '../navigation/NavigationService';

// To use a custom "Hey Reminder" wake word instead of the default "Porcupine", 
// you must upload your keyword at console.picovoice.ai, download the .ppn file, 
// and use `fromKeywordPaths` instead of `fromBuiltInKeywords`.
const PICOVOICE_ACCESS_KEY = "YOUR_PICOVOICE_ACCESS_KEY_HERE";

let porcupineManager = null;
let isListening = false;

const PicovoiceService = {
  start: async () => {
    if (isListening || PICOVOICE_ACCESS_KEY === "YOUR_PICOVOICE_ACCESS_KEY_HERE") {
       console.log("Picovoice: Skipping start (already listening or no valid key provided)");
       return;
    }

    try {
      const hasPermission = await PicovoiceService.requestPermission();
      if (!hasPermission) return;

      // Using built-in PORCUPINE keyword as placeholder for 'Hey Reminder'
      porcupineManager = await PorcupineManager.fromBuiltInKeywords(
        PICOVOICE_ACCESS_KEY,
        [BuiltInKeyword.PORCUPINE], // "Porcupine"
        (keywordIndex) => {
          console.log("Wake word detected! Index:", keywordIndex);
          // Pause wake word detection while interacting
          PicovoiceService.pauseForVoiceInput();
          
          // Trigger Voice Assistant and auto listen
          navigate('VoiceAssistant', { autoListen: true });
        }
      );

      await porcupineManager.start();
      isListening = true;
      console.log('Picovoice wake word listener started. Say "Porcupine" to wake.');
    } catch (e) {
      console.warn("Picovoice initialization failed:", e.message);
    }
  },

  pauseForVoiceInput: async () => {
    if (porcupineManager && isListening) {
      try {
        await porcupineManager.stop();
        isListening = false;
        console.log('Picovoice paused for voice input');
      } catch (e) {
        console.error('Picovoice pause error:', e.message);
      }
    }
  },

  resumeAfterVoiceInput: async () => {
    if (porcupineManager && !isListening) {
      try {
        await porcupineManager.start();
        isListening = true;
        console.log('Picovoice resumed after voice input');
      } catch (e) {
        console.error('Picovoice resume error:', e.message);
      }
    }
  },

  stop: async () => {
    if (porcupineManager) {
      try {
        await porcupineManager.stop();
        await porcupineManager.delete();
        porcupineManager = null;
        isListening = false;
        console.log('Picovoice stopped entirely');
      } catch (e) {
        console.error('Picovoice stop error:', e.message);
      }
    }
  },

  requestPermission: async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Wake Word Permission',
            message: 'App needs microphone to listen for the wake word.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        return false;
      }
    }
    return true;
  },
};

export default PicovoiceService;