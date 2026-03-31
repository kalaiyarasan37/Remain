import {
   PermissionsAndroid,
   Platform,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Config from '../constants/Config';
import RNFS from 'react-native-fs';

const audioRecorderPlayer = new AudioRecorderPlayer();

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
      const path = `${RNFS.CachesDirectoryPath}/reminder_voice.mp4`;

      let silenceTimer = null;
      let hasSpokeOnce = false;

      const audioSet = {
         AudioEncoderAndroid: 3,
         AudioSourceAndroid: 1,
         OutputFormatAndroid: 2,
      };

      await audioRecorderPlayer.startRecorder(path, audioSet, true); // true = metering enabled

      audioRecorderPlayer.addRecordBackListener((e) => {
         const db = e.currentMetering ?? -160;
         console.log('Audio level:', db); // check this in console

         const isSilent = db < -9;

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
            }, 2000);
         }
      });

      return path;
   },

   stopRecording: async () => {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      return result;
   },

   transcribeAudio: async (filePath) => {
      const fileContent = await RNFS.readFile(filePath, 'base64');

      const formData = new FormData();
      formData.append('file', {
         uri: `file://${filePath}`,
         type: 'audio/mp4',
         name: 'reminder_voice.mp4',
      });
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'json');

      const response = await fetch(
         'https://api.groq.com/openai/v1/audio/transcriptions',
         {
            method: 'POST',
            headers: {
               Authorization: `Bearer ${Config.GROQ_API_KEY}`,
               'Content-Type': 'multipart/form-data',
            },
            body: formData,
         },
      );

      const data = await response.json();
      console.log('Whisper response:', JSON.stringify(data));

      if (!data.text) {
         throw new Error(data.error?.message || 'Transcription failed');
      }

      return data.text;
   },

   parseWithAI: async (text) => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const dayName = today.toLocaleDateString('en-IN', { weekday: 'long' });
      const timeStr = today.toLocaleTimeString('en-IN', {
         hour: '2-digit',
         minute: '2-digit',
         hour12: false,
      });

      const prompt = `You are a reminder assistant. Extract reminder details from this transcribed voice text.

Current date: ${todayStr} (${dayName})
Current time: ${timeStr}

Transcribed text: "${text}"

The text may be in English, Tamil, or Thanglish (Tamil+English mixed).
Extract and return ONLY a JSON object with these exact fields:
- message: the full transcribed text as the reminder message (required)
- location: location if mentioned (null if not mentioned)
- date: date in YYYY-MM-DD format (use today ${todayStr} if no date mentioned)
- time: time in HH:MM 24hr format (use current time ${timeStr} if no time mentioned)

Date rules:
- "tomorrow" or "naalai" = ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "today" or "indru" = ${todayStr}
- "next week" = ${new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]}

Time rules:
- "evening" or "maalai" = 18:00
- "morning" or "kaalai" = 09:00
- "afternoon" or "madhiyam" = 14:00
- "night" or "iravu" = 21:00

CRITICAL: Your ENTIRE response must be ONLY the JSON object. 
Start your response with { and end with }
No thinking. No explanation. No markdown. No text before or after JSON.
Example: {"message":"Meeting at office","location":"office","date":"2026-03-20","time":"15:00"}`;

      try {
         const response = await fetch(Config.GROQ_API_URL, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               Authorization: `Bearer ${Config.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
               model: Config.GROQ_MODEL_JSON,
               messages: [{ role: 'user', content: prompt }],
               temperature: 0.1,
               max_tokens: 200,
            }),
         });

         const data = await response.json();
         console.log('Groq response:', JSON.stringify(data));

         // Check for API errors
         if (data.error) {
            console.error('Groq API error:', data.error);
            // Return default with just the message
            return {
               message: text,
               location: null,
               date: todayStr,
               time: timeStr,
            };
         }

         // Check if choices exist
         if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Invalid Groq response structure:', data);
            return {
               message: text,
               location: null,
               date: todayStr,
               time: timeStr,
            };
         }

         const content = data.choices[0].message.content.trim();
         console.log('Groq content:', content);

         const cleaned = content
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

         try {
            const parsed = JSON.parse(cleaned);
            return {
               message: parsed.message || text,
               location: parsed.location || null,
               date: parsed.date || todayStr,
               time: parsed.time || timeStr,
            };
         } catch (parseErr) {
            console.error('JSON parse error:', parseErr, 'Content:', cleaned);
            // If JSON parsing fails, just use the transcribed text
            return {
               message: text,
               location: null,
               date: todayStr,
               time: timeStr,
            };
         }
      } catch (fetchErr) {
         console.error('Fetch error:', fetchErr);
         // Network error — just fill message with transcribed text
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
         await audioRecorderPlayer.stopRecorder();
      } catch (e) { }
   },
};

export default VoiceService;