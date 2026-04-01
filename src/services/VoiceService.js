import {
   PermissionsAndroid,
   Platform,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import { transcribeAudio, parseWithAI } from './ApiService';

const audioRecorderPlayer = new AudioRecorderPlayer();
let isTaskRunning = false;
let isRecordingActive = false;

const VoiceService = {

   requestPermission: async () => {
      if (Platform.OS === 'android') {
         try {
            const granted = await PermissionsAndroid.request(
               PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
               {
                  title: 'Microphone Permission',
                  message: 'RemainApp needs microphone to record voice.',
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

   startRecording: async (onSilenceDetected) => {
      if (isTaskRunning) {
         console.log('VoiceService: A recording task is already in transition.');
         return null;
      }
      isTaskRunning = true;

      try {
         // Fix "startRecorder has already been called" error
         if (isRecordingActive) {
            try {
               await audioRecorderPlayer.stopRecorder();
               audioRecorderPlayer.removeRecordBackListener();
               await new Promise(resolve => setTimeout(resolve, 350));
            } catch (e) { }
         }

         isRecordingActive = true;

         // Use M4A — Whisper fully supports AAC/M4A and it's a proven working format
         const path = `${RNFS.CachesDirectoryPath}/reminder_voice.m4a`;

         let silenceTimer = null;
         let hasSpokeOnce = false;

         const audioSet = {
            // AudioSourceAndroid 7 = VOICE_COMMUNICATION
            // Android automatically applies hardware:
            //   ✅ Acoustic Echo Canceller (AEC)
            //   ✅ Noise Suppressor (NS)
            //   ✅ Automatic Gain Control (AGC)
            AudioSourceAndroid: 7,
            AudioEncoderAndroid: 3,   // AAC — proven Whisper-compatible
            OutputFormatAndroid: 2,   // MPEG_4 — produces valid .m4a file
            SampleRateAndroid: 16000, // 16 kHz — optimal for Whisper speech recognition
            ChannelsAndroid: 1,       // Mono — reduces noise and file size
         };

         await audioRecorderPlayer.startRecorder(path, audioSet, true);

         audioRecorderPlayer.addRecordBackListener((e) => {
            const db = e.currentMetering ?? -160;
            // -160 is silence, 0 is max. VOICE_COMMUNICATION source has AGC
            // so -30 is a good threshold for actual speech vs background noise
            const isSilent = db < -30;

            if (!isSilent) {
               hasSpokeOnce = true;
               if (silenceTimer) {
                  clearTimeout(silenceTimer);
                  silenceTimer = null;
               }
            } else if (hasSpokeOnce && isSilent && !silenceTimer) {
               silenceTimer = setTimeout(() => {
                  if (onSilenceDetected) {
                     onSilenceDetected();
                  }
               }, 2200);
            }
         });

         return path;
      } catch (err) {
         console.error('startRecording error:', err);
         isRecordingActive = false;
         throw err;
      } finally {
         isTaskRunning = false;
      }
   },

   stopRecording: async () => {
      if (!isRecordingActive || isTaskRunning) return null;
      isTaskRunning = true;
      let result = null;
      try {
         result = await audioRecorderPlayer.stopRecorder();
         audioRecorderPlayer.removeRecordBackListener();
         console.log('Recording stopped, path:', result);
         // Small delay to let OS release file/mic
         await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
         console.log('stopRecording caught error (usually already stopped):', e.message);
      } finally {
         isRecordingActive = false;
         isTaskRunning = false;
      }
      return result;
   },

   transcribeAudio: async (filePath) => {
      if (!filePath) throw new Error('No recording path found');
      const exists = await RNFS.exists(filePath);
      if (!exists) throw new Error('Audio file does not exist');

      const fileContent = await RNFS.readFile(filePath, 'base64');
      if (!fileContent || fileContent.length < 100) {
         throw new Error('Recording is too short or empty');
      }

      console.log('Uploading audio for transcription, size:', fileContent.length);
      const data = await transcribeAudio(fileContent);
      return data.text;
   },

   /**
    * Call this only when you need to parse structured reminder data
    * (task / date / time) from a confirmed creation intent.
    * Do NOT call this for general voice queries.
    */
   parseWithAI: async (text) => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const timeStr = today.toLocaleTimeString('en-IN', {
         hour: '2-digit',
         minute: '2-digit',
         hour12: false,
      });

      try {
         const data = await parseWithAI(text);
         if (data) return data;

         // Fallback if parsing returns null
         return {
            message: text,
            location: null,
            date: todayStr,
            time: timeStr,
         };
      } catch (e) {
         console.error('Parse with AI error:', e);
         return {
            message: text,
            location: null,
            date: todayStr,
            time: timeStr,
         };
      }
   },

   destroy: async () => {
      try {
         if (isRecordingActive) {
            await VoiceService.stopRecording();
         }
      } catch (e) { }
   },
};

export default VoiceService;