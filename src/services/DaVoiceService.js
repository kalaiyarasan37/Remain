// DaVoice Wake Word Service - DISABLED
// Wake word detection is currently disabled.
// To enable, install react-native-wakeword and uncomment the implementation.
// See: https://github.com/frymanofer/ReactNative_WakeWordDetection

// Stub export to prevent import errors
const DaVoiceService = {
   init: async () => {
      console.log('DaVoice WakeWord: disabled (stub)');
      return false;
   },
   start: async () => false,
   stop: async () => false,
   pause: async () => false,
   resume: async () => false,
   requestPermission: async () => true,
};

export default DaVoiceService;
