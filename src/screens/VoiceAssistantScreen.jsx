import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
   View,
   Text,
   StyleSheet,
   TouchableOpacity,
   TextInput,
   ScrollView,
   Animated,
   ActivityIndicator,
   StatusBar,
   KeyboardAvoidingView,
   Platform,
   Keyboard,
} from 'react-native';
import Colors from '../constants/Colors';
import RNFS from 'react-native-fs';
import Tts from 'react-native-tts';
import NotificationService from '../services/NotificationService';
import VoiceService from '../services/VoiceService';
import IntentService from '../services/IntentService';
import DaVoiceService from '../services/DaVoiceService';
import PicovoiceService from '../services/PicovoiceService';
import Storage from '../utils/Storage';
import {
   createReminder,
   updateReminder,
   deleteReminder,
   filterReminders,
   getReminder,
   findSimilar,
} from '../services/ApiService';

const CHAT_STORAGE_KEY = 'voice_assistant_chat_history';
const MAX_CHAT_MESSAGES = 50;

const VoiceAssistantScreen = ({ navigation, route }) => {
   const [messages, setMessages] = useState([]);
   const [inputText, setInputText] = useState('');
   const [isRecording, setIsRecording] = useState(false);
   const [isProcessing, setIsProcessing] = useState(false);
   const [isSpeaking, setIsSpeaking] = useState(false);
   const [pendingAction, setPendingAction] = useState(null); // For CRUD confirmation flow

   // ── Clarification / Validation state ──────────────────
   const [awaitingClarification, setAwaitingClarification] = useState(null);
   // awaitingClarification = { type, parsedData, clarificationMessage, missingField }
   const clarificationAttemptsRef = useRef(0);
   const MAX_CLARIFICATION_RETRIES = 2;
   // Tracks the last query so follow-ups like "show those" work correctly
   const lastQueryContextRef = useRef({ query_type: 'today', date: null, location: null });

   const scrollViewRef = useRef(null);
   const pulseAnim = useRef(new Animated.Value(1)).current;
   const pulseLoop = useRef(null);
   const recordingRef = useRef(false);
   const autoListenRef = useRef(false);
   const handleMicPressRef = useRef(null);

   // ── Load chat history on mount ──────────────────────
   useEffect(() => {
      loadChatHistory();
      DaVoiceService.pause();
      PicovoiceService.pauseForVoiceInput();
      
      Tts.setDefaultRate(0.5);
      Tts.setDefaultPitch(1.0);
      
      const ttsStart = Tts.addListener('tts-start', () => setIsSpeaking(true));
      const ttsFinish = Tts.addListener('tts-finish', () => {
         setIsSpeaking(false);
         if (autoListenRef.current) {
            autoListenRef.current = false;
            setTimeout(() => {
               if (handleMicPressRef.current) handleMicPressRef.current();
            }, 600); // Wait 600ms to avoid audio focus overlap
         }
      });
      const ttsCancel = Tts.addListener('tts-cancel', () => setIsSpeaking(false));

      // Auto listen directly if requested by navigation params
      if (route.params?.autoListen) {
         setTimeout(() => {
            if (handleMicPressRef.current) handleMicPressRef.current();
         }, 800); 
      }

      return () => {
         DaVoiceService.resume();
         PicovoiceService.resumeAfterVoiceInput();
         cleanupRecording();
         ttsStart.remove();
         ttsFinish.remove();
         ttsCancel.remove();
         Tts.stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [route.params?.autoListen]);

   // ── Auto scroll to bottom on new message ────────────
   useEffect(() => {
      setTimeout(() => {
         scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
   }, [messages]);

   // ── Chat history persistence ────────────────────────
   const loadChatHistory = async () => {
      const saved = await Storage.get(CHAT_STORAGE_KEY);
      if (saved && saved.length > 0) {
         setMessages(saved);
      } else {
         // Welcome message
         setMessages([{
            id: 'welcome',
            type: 'ai',
            content: 'Hey! 👋 I\'m your AI Assistant. You can ask me anything about your reminders — create, update, delete, or just query them. Type or tap the mic to start!',
            timestamp: new Date().toISOString(),
         }]);
      }
   };

   const saveChatHistory = useCallback(async (msgs) => {
      const trimmed = msgs.slice(-MAX_CHAT_MESSAGES);
      await Storage.set(CHAT_STORAGE_KEY, trimmed);
   }, []);

   // ── Pulse animation for recording ──────────────────
   const startPulse = () => {
      pulseLoop.current = Animated.loop(
         Animated.sequence([
            Animated.timing(pulseAnim, {
               toValue: 1.5,
               duration: 600,
               useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
               toValue: 1,
               duration: 600,
               useNativeDriver: true,
            }),
         ]),
      );
      pulseLoop.current.start();
   };

   const stopPulse = () => {
      if (pulseLoop.current) pulseLoop.current.stop();
      pulseAnim.setValue(1);
   };

   const cleanupRecording = async () => {
      stopPulse();
      recordingRef.current = false;
      try { await VoiceService.stopRecording(); } catch (e) { }
   };

   // ── Add message helper ─────────────────────────────
   const addMessage = useCallback((type, content, extras = {}) => {
      const msg = {
         id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
         type,
         content,
         timestamp: new Date().toISOString(),
         ...extras,
      };
      setMessages(prev => {
         const updated = [...prev, msg];
         saveChatHistory(updated);
         return updated;
      });

      // Simple TTS for AI responses
      if (type === 'ai' && !extras.silent) {
         const speakText = content.replace(/[#*`]/g, ''); // strip markdown
         setIsSpeaking(true);
         if (extras.autoListen) {
            autoListenRef.current = true;
         }
         Tts.speak(speakText);
      }

      return msg;
   }, [saveChatHistory]);

   // ── Handle text send ───────────────────────────────
   const handleSend = async () => {
      const text = inputText.trim();
      if (!text || isProcessing) return;

      Keyboard.dismiss();
      setInputText('');
      addMessage('user', text);
      await processInput(text);
   };

   useEffect(() => {
      handleMicPressRef.current = handleMicPress;
   }, [isRecording, isProcessing]);

   // ── Handle voice recording ─────────────────────────
   const handleMicPress = async () => {
      // Ignore if user repeatedly taps while processing
      if (isProcessing) return;

      if (isRecording) {
         // Stop recording
         await processVoice();
      } else {
         // Start recording
         setIsRecording(true);
         recordingRef.current = true;
         startPulse();

         try {
            const hasPermission = await VoiceService.requestPermission();
            if (!hasPermission) {
               addMessage('ai', '⚠️ Microphone permission denied. Please enable it in settings.');
               setIsRecording(false);
               recordingRef.current = false;
               stopPulse();
               return;
            }

            addMessage('system', '🎤 Listening... tap mic again to stop');

            await VoiceService.startRecording(() => {
               // Silence detected
               if (recordingRef.current) {
                  processVoice();
               }
            });
         } catch (e) {
            console.error('Recording start error:', e);
            addMessage('ai', '❌ Could not start recording. Please try again.');
            setIsRecording(false);
            recordingRef.current = false;
            stopPulse();
         }
      }
   };

   const processVoice = async () => {
      if (!recordingRef.current) return;
      recordingRef.current = false;
      setIsRecording(false);
      stopPulse();

      // Remove the "Listening..." system message
      setMessages(prev => prev.filter(m => m.content !== '🎤 Listening... tap mic again to stop'));

      setIsProcessing(true);
      try {
         let filePath;
         try { filePath = await VoiceService.stopRecording(); } catch (e) { filePath = null; }
         if (!filePath) throw new Error('Recording failed');

         // Step 1: Transcribe audio via Whisper (whisper-large-v3-turbo, temp=0, auto lang)
         addMessage('system', '⏳ Transcribing...');
         const transcribedText = await VoiceService.transcribeAudio(filePath);
         setMessages(prev => prev.filter(m => m.content !== '⏳ Transcribing...'));

         if (!transcribedText || transcribedText.trim().length < 2) {
            addMessage('ai', "🤔 I didn't catch anything. Please speak clearly and try again.");
            setIsProcessing(false);
            return;
         }

         // Step 2: Show what was heard, then process exactly like typed text
         // (intent detection handles routing — query, add, update, delete, chat)
         addMessage('user', transcribedText);
         await processInput(transcribedText);
      } catch (e) {
         setMessages(prev => prev.filter(m => m.content !== '⏳ Transcribing...'));
         console.error('processVoice error:', e);
         addMessage('ai', '😕 Could not process your voice. Please try again.');
         setIsProcessing(false);
      }
   };

   // ── Clarification retry handler ────────────────────────
   const handleClarificationRetry = async (action) => {
      if (action === 'try_again') {
         // Restart recording
         setAwaitingClarification(null);
         addMessage('system', '🔄 Starting over — please speak again...');
         setTimeout(() => {
            setMessages(prev => prev.filter(m =>
               m.content !== '🔄 Starting over — please speak again...'
            ));
            handleMicPress();
         }, 800);
      } else if (action === 'type_it') {
         // Dismiss clarification, let user type
         setAwaitingClarification(null);
         clarificationAttemptsRef.current = 0;
         addMessage('ai', '✏️ Sure! Please type your reminder below.');
      }
   };

   // ── Process user input (text or transcribed voice) ──
   const processInput = async (text) => {
      setIsProcessing(true);

      // Check if this is a confirmation response
      if (pendingAction) {
         await handleConfirmation(text);
         return;
      }

      try {
         addMessage('system', '🤖 Understanding your request...');
         // Pass chat history for context
         const intent = await IntentService.getIntent(text, messages);

         // Remove processing message
         setMessages(prev => prev.filter(m => m.content !== '🤖 Understanding your request...'));

         switch (intent.intent) {
            case 'conversational':
               addMessage('ai', intent.response, { intent: 'conversational' });
               break;

            // ── New precise intents ────────────────────────────────────────────
            case 'get_count': {
               // Fetch real count from DB, pass countOnly=true so LLM just formats the number
               const ctx = {
                  query_type: intent.query_type || 'today',
                  date: intent.date,
                  location: intent.location,
               };
               lastQueryContextRef.current = ctx; // remember for follow-ups
               await handleQueryReminders(ctx, text, true /* countOnly */);
               break;
            }
            case 'show_list': {
               // If follow-up ("those", "them"), reuse last query context
               const ctx = intent.is_followup
                  ? lastQueryContextRef.current
                  : {
                       query_type: intent.query_type || 'today',
                       date: intent.date,
                       location: intent.location,
                    };
               lastQueryContextRef.current = ctx;
               await handleQueryReminders(ctx, text, false /* showList */);
               break;
            }

            // ── Legacy / fallback intents ──────────────────────────────────
            case 'add_reminder':
               await handleAddReminder(intent);
               break;
            case 'query_reminders':
               lastQueryContextRef.current = {
                  query_type: intent.query_type || 'today',
                  date: intent.date,
                  location: intent.location,
               };
               await handleQueryReminders(intent, text, false);
               break;
            case 'update_reminder':
               await handleUpdateReminder(intent);
               break;
            case 'delete_reminder':
               await handleDeleteReminder(intent);
               break;
            default:
               await handleQueryReminders({ query_type: 'upcoming' }, text, false);
               break;
         }
      } catch (e) {
         setMessages(prev => prev.filter(m => m.content !== '🤖 Understanding your request...'));
         console.error('Process input error:', e);
         addMessage('ai', '😕 I couldn\'t understand that. Could you rephrase?');
      } finally {
         setIsProcessing(false);
      }
   };

   // ── CRUD Handlers ──────────────────────────────────

   const handleAddReminder = async (intent) => {
      // ── Step 1: Smart parse + confidence check ────────────
      // Only run /parse when intent is confirmed as add_reminder.
      // This gives us richer data (date/time/location/language) and
      // validates confidence BEFORE opening the form.
      let enrichedIntent = intent;

      try {
         const { parseWithAI: parseApi } = require('../services/ApiService');
         addMessage('system', '🧠 Checking details...');
         const parsed = await parseApi(intent.message || '');
         setMessages(prev => prev.filter(m => m.content !== '🧠 Checking details...'));

         if (parsed && parsed.needs_clarification) {
            clarificationAttemptsRef.current += 1;

            if (clarificationAttemptsRef.current > MAX_CLARIFICATION_RETRIES) {
               // Open form with whatever we have
               clarificationAttemptsRef.current = 0;
               setAwaitingClarification(null);
            } else {
               const clarMsg = parsed.clarification_message || 'Can you please repeat or confirm?';
               setAwaitingClarification({
                  type: 'add_reminder_clarification',
                  parsedData: parsed,
                  originalIntent: intent,
               });
               addMessage('ai', `🎙️ ${clarMsg}`, { 
                  intent: 'needs_clarification',
                  autoListen: true 
               });
               setIsProcessing(false);
               return; // Wait for user to retry or type
            }
         } else if (parsed && !parsed.needs_clarification) {
            // Good confident parse — merge richer fields into intent
            clarificationAttemptsRef.current = 0;
            setAwaitingClarification(null);
            enrichedIntent = {
               ...intent,
               message: parsed.task || intent.message,
               date:    parsed.date || intent.date,
               time:    parsed.time || intent.time,
               location: parsed.location || intent.location,
               type:    parsed.type || intent.type || 'ONCE',
               language: parsed.language,
               natural_message: parsed.natural_message,
            };
            // Show the AI's natural language confirmation
            if (parsed.natural_message) {
               addMessage('ai', `✅ ${parsed.natural_message}`, { intent: 'add_confirmation' });
            }
         }
      } catch (parseErr) {
         setMessages(prev => prev.filter(m => m.content !== '🧠 Checking details...'));
         console.log('Parse check failed (non-fatal):', parseErr.message);
         // Fall through with original intent
      }

      // ── Step 2: Location suggestion (existing logic) ──────
      try {
         const userData = await Storage.get('user');
         const userId = userData?.id;

         if (userId && !enrichedIntent.location) {
            const similar = await findSimilar({ user_id: userId, message: enrichedIntent.message });
            if (similar.found && similar.reminder.location) {
               setPendingAction({
                  type: 'location_suggestion',
                  intent: enrichedIntent,
                  suggestedLocation: similar.reminder.location,
               });
               addMessage('ai',
                  `📍 I found a similar previous reminder for "${enrichedIntent.message}" at **${similar.reminder.location}**.\n\nUse this location or a new one?`,
                  { intent: 'location_suggestion' }
               );
               setIsProcessing(false);
               return;
            }
         }
      } catch (e) {
         console.log('Similar location fetch failed:', e.message);
      }

      // ── Step 3: Open the form ─────────────────────────────
      addMessage('ai', `📝 Creating reminder: "${enrichedIntent.message}"\n\nOpening the reminder form...`, {
         intent: 'add_reminder',
      });

      setTimeout(() => {
         navigation.navigate('AddReminder', {
            isVoice: true,
            prefillData: enrichedIntent,
         });
      }, 800);
   };

   const handleQueryReminders = async (intent, originalText, countOnly = false) => {
      try {
         addMessage('system', '🔍 Searching reminders...');
         const queryResults = await IntentService.queryReminders(intent);
         setMessages(prev => prev.filter(m => m.content !== '🔍 Searching reminders...'));

         // generateSummary uses the REAL count from DB — LLM only formats the response
         const aiSummary = await IntentService.generateSummary(
            queryResults,
            intent.summary_request || originalText,
            countOnly, // true = just show the count, false = show full list with cards
         );

         addMessage('ai', aiSummary, {
            // Only attach reminder cards when showing list, not when just counting
            reminders: countOnly ? [] : queryResults.slice(0, 10),
            intent: countOnly ? 'get_count' : 'query_reminders',
         });
      } catch (e) {
         setMessages(prev => prev.filter(m => m.content !== '🔍 Searching reminders...'));
         addMessage('ai', '❌ Could not fetch reminders. Please try again.');
      }
   };

   const handleUpdateReminder = async (intent) => {
      try {
         // Find the matching reminder
         const userData = await Storage.get('user');
         const userId = userData?.id;
         if (!userId) {
            addMessage('ai', '⚠️ Please login first.');
            setIsProcessing(false);
            return;
         }

         let matches = [];
         if (intent.reminder_id) {
            const allData = await filterReminders(userId, {});
            matches = (allData.reminders || []).filter(r => String(r.id) === String(intent.reminder_id));
         }

         if (matches.length === 0) {
            const matchHint = intent.reminder_hint || intent.message || '';
            const data = await filterReminders(userId, { message: matchHint });
            matches = data.reminders || [];
            
            if (matches.length === 0) {
               addMessage('ai', `❌ I couldn't find a reminder matching "${matchHint}". Could you be more specific?`);
               setIsProcessing(false);
               return;
            }
         }

         const target = matches[0]; // Best match
         const updates = intent.updates || {};

         // Check if confirmation is needed
         const confirmSetting = await Storage.get('ai_confirm_setting');
         const needsConfirm = confirmSetting !== 'no_confirm';

         if (needsConfirm) {
            // Store pending action and ask for confirmation
            setPendingAction({
               type: 'update',
               reminderId: target.id,
               reminderTitle: target.message,
               updates: {
                  message: updates.message || target.message,
                  date: updates.date || target.reminder_date,
                  time: updates.time || target.reminder_time,
                  location: updates.location || target.location,
                  type: updates.type || target.reminder_type || 'ONCE',
               },
            });

            let changeDesc = '';
            // Force display proposed changes even if they equal old ones, to confirm the AI's understanding
            if (updates.message) changeDesc += `\n• Msg: "${updates.message}"`;
            if (updates.date) changeDesc += `\n• Date: ${updates.date}`;
            if (updates.time) changeDesc += `\n• Time: ${updates.time}`;
            if (updates.location) changeDesc += `\n• Loc: ${updates.location}`;
            if (updates.type) changeDesc += `\n• Type: ${updates.type}`;
            
            if (changeDesc === '') {
               changeDesc = '\n• (No changes requested or understood. Please specify what to update.)';
            }

            addMessage('ai',
               `✏️ **Editing:** "${target.message}"\n\n**Proposed changes:**${changeDesc}\n\n🔐 Confirm update?`,
               { intent: 'confirm_update' },
            );
            setIsProcessing(false);
            return;
         }

         // Execute immediately
         await executeUpdate(target.id, target.message, {
            message: updates.message || target.message,
            date: updates.date || target.reminder_date,
            time: updates.time || target.reminder_time,
            location: updates.location || target.location,
            type: updates.type || target.reminder_type || 'ONCE',
         });
      } catch (e) {
         console.error('Update error:', e);
         addMessage('ai', '❌ Failed to update reminder. Please try again.');
      }
      setIsProcessing(false);
   };

   const handleDeleteReminder = async (intent) => {
      try {
         const userData = await Storage.get('user');
         const userId = userData?.id;
         if (!userId) {
            addMessage('ai', '⚠️ Please login first.');
            setIsProcessing(false);
            return;
         }

         let matches = [];
         if (intent.reminder_id) {
            const allData = await filterReminders(userId, {});
            matches = (allData.reminders || []).filter(r => String(r.id) === String(intent.reminder_id));
         }

         if (matches.length === 0) {
            const matchHint = intent.reminder_hint || intent.message || '';
            const data = await filterReminders(userId, { message: matchHint });
            matches = data.reminders || [];
            
            if (matches.length === 0) {
               addMessage('ai', `❌ I couldn't find a reminder matching "${matchHint}". Could you be more specific?`);
               setIsProcessing(false);
               return;
            }
         }

         const target = matches[0];

         // Check if confirmation is needed
         const confirmSetting = await Storage.get('ai_confirm_setting');
         const needsConfirm = confirmSetting !== 'no_confirm';

         if (needsConfirm) {
            setPendingAction({
               type: 'delete',
               reminderId: target.id,
               reminderTitle: target.message,
            });

            addMessage('ai',
               `🗑️ **Delete:** "${target.message}"?\n\n📅 ${target.reminder_date || 'No date'} 🕐 ${target.reminder_time || 'No time'}\n\n🔐 Confirm deletion?`,
               { intent: 'confirm_delete' },
            );
            setIsProcessing(false);
            return;
         }

         // Execute immediately
         await executeDelete(target.id, target.message);
      } catch (e) {
         console.error('Delete error:', e);
         addMessage('ai', '❌ Failed to delete reminder. Please try again.');
      }
      setIsProcessing(false);
   };

   // ── Confirmation handler ───────────────────────────
   const handleConfirmation = async (text) => {
      const lower = text.toLowerCase().trim();
      const isYes = ['yes', 'yeah', 'yep', 'y', 'confirm', 'ok', 'sure', 'do it', 'proceed', 'aam', 'sari', 'haan'].includes(lower);
      const isNo = ['no', 'nah', 'nope', 'n', 'cancel', 'stop', 'venda', 'nahi'].includes(lower);

      // Remove processing message
      setMessages(prev => prev.filter(m => m.content !== '🤖 Understanding your request...'));

      if (isYes && pendingAction) {
         if (pendingAction.type === 'update') {
            await executeUpdate(pendingAction.reminderId, pendingAction.reminderTitle, pendingAction.updates);
         } else if (pendingAction.type === 'delete') {
            await executeDelete(pendingAction.reminderId, pendingAction.reminderTitle);
         } else if (pendingAction.type === 'location_suggestion') {
            const updatedIntent = { ...pendingAction.intent, location: pendingAction.suggestedLocation };
            addMessage('ai', `✅ Using location: **${pendingAction.suggestedLocation}**\n\nOpening form...`);
            setTimeout(() => {
               navigation.navigate('AddReminder', {
                  isVoice: true,
                  prefillData: updatedIntent,
               });
            }, 800);
         }
      } else if (isNo) {
         if (pendingAction && pendingAction.type === 'location_suggestion') {
            addMessage('ai', '👍 Skipping suggested location.\n\nOpening form...');
            setTimeout(() => {
               navigation.navigate('AddReminder', {
                  isVoice: true,
                  prefillData: pendingAction.intent,
               });
            }, 800);
         } else {
            addMessage('ai', '👍 Operation cancelled.');
         }
      } else {
         addMessage('ai', '🤔 Please reply **"yes"** to confirm or **"no"** to cancel.');
         setIsProcessing(false);
         return; // Keep pending action
      }

      setPendingAction(null);
      setIsProcessing(false);
   };

   const executeUpdate = async (reminderId, title, updates) => {
      try {
         await updateReminder(reminderId, updates);
         addMessage('ai', `✅ Updated: "${title}"\n\nChanges applied successfully!`, {
            intent: 'update_success',
         });
         
         // Reschedule local alarms
         const userData = await Storage.get('user');
         if (userData?.id) {
            NotificationService.scheduleForUserId(userData.id);
         }
      } catch (e) {
         console.error('Execute update error:', e);
         addMessage('ai', `❌ Failed to update "${title}". Please try again.`);
      }
   };

   const executeDelete = async (reminderId, title) => {
      try {
         await deleteReminder(reminderId);
         addMessage('ai', `✅ Deleted: "${title}"\n\nReminder has been moved to trash.`, {
            intent: 'delete_success',
         });
         
         // Reschedule local alarms
         const userData = await Storage.get('user');
         if (userData?.id) {
            NotificationService.scheduleForUserId(userData.id);
         }
      } catch (e) {
         console.error('Execute delete error:', e);
         addMessage('ai', `❌ Failed to delete "${title}". Please try again.`);
      }
   };

   // ── Clear chat ─────────────────────────────────────
   const handleClearChat = async () => {
      const welcomeMsg = {
         id: 'welcome-' + Date.now(),
         type: 'ai',
         content: 'Chat cleared! 🧹 How can I help you?',
         timestamp: new Date().toISOString(),
      };
      setMessages([welcomeMsg]);
      await Storage.set(CHAT_STORAGE_KEY, [welcomeMsg]);
   };

   // ── Format time for chat bubbles ───────────────────
   const formatTime = (timestamp) => {
      const d = new Date(timestamp);
      return d.toLocaleTimeString('en-IN', {
         hour: '2-digit',
         minute: '2-digit',
         hour12: true,
      });
   };

   const formatReminderDateTime = (dateTime) => {
      if (!dateTime) return '';
      return new Date(dateTime).toLocaleString('en-IN', {
         day: '2-digit',
         month: 'short',
         hour: '2-digit',
         minute: '2-digit',
         hour12: true,
      });
   };

   // ── Render ─────────────────────────────────────────
   return (
      <View style={styles.container}>
         <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />

         {/* ── Header ────────────────────────────────── */}
         <View style={styles.header}>
            <View style={StyleSheet.absoluteFill}>
               {Array.from({ length: 20 }).map((_, i) => {
                  const factor = i / 19;
                  const r1 = 75, g1 = 68, b1 = 204; // darker primary
                  const r2 = 108, g2 = 99, b2 = 255; // primary
                  const r = Math.round(r1 + factor * (r2 - r1));
                  const g = Math.round(g1 + factor * (g2 - g1));
                  const b = Math.round(b1 + factor * (b2 - b1));
                  return (
                     <View key={i} style={{ height: `${100 / 20}%`, backgroundColor: `rgb(${r},${g},${b})` }} />
                  );
               })}
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
               <Text style={styles.backBtnText}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
               <Text style={styles.headerTitle}>🤖 AI Assistant</Text>
               <Text style={styles.headerSubtitle}>Voice & Text Commands</Text>
            </View>
            <View style={styles.headerRight}>
               {isSpeaking && (
                  <TouchableOpacity 
                     onPress={() => { Tts.stop(); setIsSpeaking(false); }} 
                     style={styles.stopBtn}
                  >
                     <Text style={styles.stopIconText}>🔇</Text>
                  </TouchableOpacity>
               )}
               <TouchableOpacity onPress={handleClearChat} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>🗑️</Text>
               </TouchableOpacity>
            </View>
         </View>

         {/* ── Chat Messages ─────────────────────────── */}
         <KeyboardAvoidingView
            style={styles.chatArea}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
         >
            <ScrollView
               ref={scrollViewRef}
               style={styles.messagesList}
               contentContainerStyle={styles.messagesContent}
               showsVerticalScrollIndicator={false}
               onContentSizeChange={() =>
                  scrollViewRef.current?.scrollToEnd({ animated: true })
               }
            >
               {messages.map((msg) => {
                  if (msg.type === 'system') {
                     return (
                        <View key={msg.id} style={styles.systemMsgContainer}>
                           <Text style={styles.systemMsgText}>{msg.content}</Text>
                        </View>
                     );
                  }

                  if (msg.type === 'user') {
                     return (
                        <View key={msg.id} style={styles.userMsgContainer}>
                           <View style={styles.userBubble}>
                              <Text style={styles.userMsgText}>{msg.content}</Text>
                              <Text style={styles.msgTime}>{formatTime(msg.timestamp)}</Text>
                           </View>
                        </View>
                     );
                  }

                  // AI message
                  return (
                     <View key={msg.id} style={styles.aiMsgContainer}>
                        <View style={styles.aiAvatar}>
                           <Text style={styles.aiAvatarText}>🤖</Text>
                        </View>
                        <View style={styles.aiBubble}>
                           <Text style={styles.aiMsgText}>{msg.content}</Text>

                           {/* Inline reminder cards */}
                           {msg.reminders && msg.reminders.length > 0 && (
                              <View style={styles.inlineReminders}>
                                 {msg.reminders.map((r) => (
                                    <TouchableOpacity
                                       key={r.id}
                                       style={[
                                          styles.inlineReminderCard,
                                          r.isCompleted && styles.completedCard
                                       ]}
                                       onPress={() => {
                                          if (r.id) {
                                              navigation.navigate('AddReminder', {
                                                 isVoice: false,
                                                 prefillData: {
                                                    message: r.title,
                                                    date: r.dateTime ? r.dateTime.split('T')[0] : '',
                                                    time: r.dateTime ? r.dateTime.split('T')[1] : '',
                                                    location: r.location,
                                                    type: r.type,
                                                    reminderId: r.id
                                                 }
                                              });
                                          }
                                       }}
                                    >
                                       <View style={styles.inlineReminderHeader}>
                                          <Text style={styles.inlineReminderIcon}>
                                             {r.isCompleted ? '✅' : '📌'}
                                          </Text>
                                          <Text style={[styles.inlineReminderTitle, r.isCompleted && styles.completedText]} numberOfLines={2}>
                                             {r.title}
                                          </Text>
                                       </View>
                                       {r.location ? (
                                          <Text style={[styles.inlineReminderLocation, r.isCompleted && styles.completedTextLight]}>
                                             📍 {r.location}
                                          </Text>
                                       ) : null}
                                       {r.dateTime ? (
                                          <Text style={[styles.inlineReminderTime, r.isCompleted && styles.completedTextLight]}>
                                             🕐 {formatReminderDateTime(r.dateTime)}
                                          </Text>
                                       ) : null}
                                       {r.type === 'DAILY' && (
                                          <View style={[styles.dailyTag, r.isCompleted && styles.completedTag]}>
                                             <Text style={styles.dailyTagText}>DAILY</Text>
                                          </View>
                                       )}
                                    </TouchableOpacity>
                                 ))}
                              </View>
                           )}

                           <Text style={styles.msgTimeAi}>{formatTime(msg.timestamp)}</Text>
                        </View>
                     </View>
                  );
               })}

               {/* Processing indicator */}
               {isProcessing && (
                  <View style={styles.aiMsgContainer}>
                     <View style={styles.aiAvatar}>
                        <Text style={styles.aiAvatarText}>🤖</Text>
                     </View>
                     <View style={[styles.aiBubble, styles.typingBubble]}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                        <Text style={styles.typingText}>Thinking...</Text>
                     </View>
                  </View>
               )}

               <View style={{ height: 10 }} />
            </ScrollView>

            {/* ── Bottom Input Bar ────────────────────── */}
            <View style={styles.inputBar}>
               {/* Clarification quick-reply (voice validation retry) */}
               {awaitingClarification && (
                  <View style={styles.clarificationRow}>
                     <Text style={styles.clarificationHint}>What would you like to do?</Text>
                     <View style={styles.quickReplyRow}>
                        <TouchableOpacity
                           style={styles.quickReplyBtnRetry}
                           onPress={() => handleClarificationRetry('try_again')}
                        >
                           <Text style={styles.quickReplyText}>🔁 Try Again</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                           style={styles.quickReplyBtnType}
                           onPress={() => handleClarificationRetry('type_it')}
                        >
                           <Text style={styles.quickReplyText}>✏️ Type It</Text>
                        </TouchableOpacity>
                     </View>
                  </View>
               )}
               {/* CRUD Pending confirmation indicator */}
               {pendingAction && !awaitingClarification && (
                  <View style={styles.quickReplyRow}>
                     <TouchableOpacity style={styles.quickReplyBtnOk} onPress={() => handleConfirmation('yes')}>
                        <Text style={styles.quickReplyText}>✅ Yes, confirm</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.quickReplyBtnCancel} onPress={() => handleConfirmation('no')}>
                        <Text style={styles.quickReplyText}>❌ No, cancel</Text>
                     </TouchableOpacity>
                  </View>
               )}
               <View style={styles.inputRow}>
                  <TextInput
                     style={styles.textInput}
                     placeholder={
                        pendingAction
                           ? 'Type "yes" or "no"...'
                           : awaitingClarification
                              ? 'Type your reminder...'
                              : 'Type a message...'
                     }
                     placeholderTextColor={Colors.textLight}
                     value={inputText}
                     onChangeText={setInputText}
                     multiline
                     maxLength={500}
                     onSubmitEditing={handleSend}
                     editable={!isRecording}
                  />

                  {inputText.trim() ? (
                     <TouchableOpacity
                        style={styles.sendBtn}
                        onPress={handleSend}
                        disabled={isProcessing}
                     >
                        <Text style={styles.sendBtnText}>➤</Text>
                     </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                     style={[
                        styles.micBtn,
                        isRecording && styles.micBtnRecording,
                     ]}
                     onPress={handleMicPress}
                     disabled={isProcessing}
                  >
                     {isRecording ? (
                        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                           <Text style={styles.micBtnText}>⏹</Text>
                        </Animated.View>
                     ) : (
                        <Text style={styles.micBtnText}>🎤</Text>
                     )}
                  </TouchableOpacity>
               </View>
            </View>
         </KeyboardAvoidingView>
      </View>
   );
};

const styles = StyleSheet.create({
   container: {
      flex: 1,
      backgroundColor: Colors.background,
   },

   // ── Header ──────────────────────────────────────────
   header: {
      paddingTop: 48,
      paddingBottom: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
   },
   backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
   },
   backBtnText: {
      color: Colors.white,
      fontSize: 20,
      fontWeight: 'bold',
   },
   headerCenter: {
      flex: 1,
      alignItems: 'center',
      zIndex: 1,
   },
   headerTitle: {
      color: Colors.white,
      fontSize: 18,
      fontWeight: 'bold',
   },
   headerSubtitle: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 11,
      marginTop: 2,
   },
   clearBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
   },
   clearBtnText: {
      fontSize: 18,
   },
   headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      zIndex: 2,
   },
   stopBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255, 68, 68, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.3)',
   },
   stopIconText: {
      fontSize: 20,
   },

   // ── Chat Area ───────────────────────────────────────
   chatArea: {
      flex: 1,
   },
   messagesList: {
      flex: 1,
   },
   messagesContent: {
      paddingHorizontal: 12,
      paddingTop: 16,
   },

   // ── System Message ──────────────────────────────────
   systemMsgContainer: {
      alignItems: 'center',
      marginVertical: 8,
   },
   systemMsgText: {
      fontSize: 12,
      color: Colors.textLight,
      backgroundColor: Colors.border + '80',
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 16,
   },

   // ── User Message ────────────────────────────────────
   userMsgContainer: {
      alignItems: 'flex-end',
      marginBottom: 12,
   },
   userBubble: {
      backgroundColor: Colors.primary,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxWidth: '80%',
      elevation: 2,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
   },
   userMsgText: {
      color: Colors.white,
      fontSize: 15,
      lineHeight: 22,
   },
   msgTime: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: 10,
      marginTop: 4,
      textAlign: 'right',
   },

   // ── AI Message ──────────────────────────────────────
   aiMsgContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 12,
   },
   aiAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: Colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      marginBottom: 4,
   },
   aiAvatarText: {
      fontSize: 16,
   },
   aiBubble: {
      backgroundColor: Colors.white,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxWidth: '78%',
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   aiMsgText: {
      color: Colors.text,
      fontSize: 15,
      lineHeight: 22,
   },
   msgTimeAi: {
      color: Colors.textLight,
      fontSize: 10,
      marginTop: 4,
   },

   // ── Typing indicator ────────────────────────────────
   typingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
   },
   typingText: {
      color: Colors.textLight,
      fontSize: 13,
      fontStyle: 'italic',
   },

   // ── Inline Reminder Cards ───────────────────────────
   inlineReminders: {
      marginTop: 10,
      gap: 8,
   },
   inlineReminderCard: {
      backgroundColor: Colors.background,
      borderRadius: 12,
      padding: 12,
      borderLeftWidth: 3,
      borderLeftColor: Colors.primary,
   },
   inlineReminderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
   },
   inlineReminderIcon: {
      fontSize: 16,
   },
   inlineReminderTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
   },
   inlineReminderLocation: {
      fontSize: 12,
      color: Colors.primary,
      marginLeft: 24,
      marginBottom: 2,
   },
   inlineReminderTime: {
      fontSize: 12,
      color: Colors.textLight,
      marginLeft: 24,
   },
   dailyTag: {
      backgroundColor: Colors.success + '20',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: 'flex-start',
      marginLeft: 24,
      marginTop: 4,
   },
   dailyTagText: {
      color: Colors.success,
      fontSize: 10,
      fontWeight: 'bold',
   },
   completedCard: {
      opacity: 0.6,
      backgroundColor: '#f1f1f1',
      borderLeftColor: Colors.textLight,
   },
   completedText: {
      textDecorationLine: 'line-through',
      color: Colors.textLight,
   },
   completedTextLight: {
      color: '#999',
   },
   completedTag: {
      backgroundColor: '#eee',
   },

   // ── Input Bar ───────────────────────────────────────
   inputBar: {
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      backgroundColor: Colors.white,
      paddingBottom: Platform.OS === 'ios' ? 24 : 8,
   },
   // ── Clarification quick-reply row ───────────────────
   clarificationRow: {
      backgroundColor: '#FFF8E1',
      borderTopWidth: 1,
      borderTopColor: '#FFE082',
      paddingTop: 6,
      paddingBottom: 4,
   },
   clarificationHint: {
      textAlign: 'center',
      fontSize: 11,
      color: '#8D6E63',
      marginBottom: 4,
      fontStyle: 'italic',
   },
   quickReplyRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 6,
      gap: 12,
   },
   quickReplyBtnRetry: {
      backgroundColor: '#6C63FF',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 100,
      flex: 1,
      alignItems: 'center',
   },
   quickReplyBtnType: {
      backgroundColor: '#00897B',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 100,
      flex: 1,
      alignItems: 'center',
   },
   quickReplyBtnOk: {
      backgroundColor: Colors.success || '#4CAF50',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 100,
      flex: 1,
      alignItems: 'center',
   },
   quickReplyBtnCancel: {
      backgroundColor: Colors.warning || '#F44336',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 100,
      flex: 1,
      alignItems: 'center',
   },
   quickReplyText: {
      color: Colors.white,
      fontWeight: 'bold',
      fontSize: 13,
   },
   inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingTop: 8,
      gap: 8,
   },
   textInput: {
      flex: 1,
      backgroundColor: Colors.background,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 10,
      fontSize: 15,
      color: Colors.text,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: Colors.border,
   },
   sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 3,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
   },
   sendBtnText: {
      color: Colors.white,
      fontSize: 20,
   },
   micBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 3,
      shadowColor: Colors.secondary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
   },
   micBtnRecording: {
      backgroundColor: Colors.error,
   },
   micBtnText: {
      fontSize: 20,
   },
});

export default VoiceAssistantScreen;
