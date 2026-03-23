import React, { useState, useEffect, useRef } from 'react';
import {
   View,
   Text,
   StyleSheet,
   Modal,
   TouchableOpacity,
   Animated,
   FlatList,
   ActivityIndicator,
   ScrollView,
   AppState,
} from 'react-native';
import Colors from '../constants/Colors';
import VoiceService from '../services/VoiceService';
import IntentService from '../services/IntentService';
import PicovoiceService from '../services/PicovoiceService';

const STATES = {
   LISTENING: 'listening',
   TRANSCRIBING: 'transcribing',
   PROCESSING: 'processing',
   RESULTS: 'results',
   ERROR: 'error',
};

const VoiceAssistantModal = ({
   visible,
   onClose,
   onAddReminder,
   triggeredByWakeWord = false,
}) => {
   const [state, setState] = useState(STATES.LISTENING);
   const [statusText, setStatusText] = useState('Listening...');
   const [transcribedText, setTranscribedText] = useState('');
   const [results, setResults] = useState([]);
   const [summary, setSummary] = useState('');
   const [errorText, setErrorText] = useState('');
   const [silenceCountdown, setSilenceCountdown] = useState(3);

   const pulseAnim = useRef(new Animated.Value(1)).current;
   const pulseLoop = useRef(null);
   const autoStopTimer = useRef(null);
   const silenceTimer = useRef(null);
   const silenceInterval = useRef(null);
   const isRecording = useRef(false);

   useEffect(() => {
      if (visible) {
         // Pause porcupine while modal is open
         PicovoiceService.pauseForVoiceInput();
         startListening();
      } else {
         cleanup();
         // Resume porcupine after modal closes
         PicovoiceService.resumeAfterVoiceInput();
      }
      return () => cleanup();
   }, [visible]);

   const startPulse = () => {
      pulseLoop.current = Animated.loop(
         Animated.sequence([
            Animated.timing(pulseAnim, {
               toValue: 1.4,
               duration: 700,
               useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
               toValue: 1,
               duration: 700,
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

   const clearAllTimers = () => {
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (silenceInterval.current) clearInterval(silenceInterval.current);
      autoStopTimer.current = null;
      silenceTimer.current = null;
      silenceInterval.current = null;
   };

   const cleanup = async () => {
      stopPulse();
      clearAllTimers();
      isRecording.current = false;
      try {
         await VoiceService.stopRecording();
      } catch (e) { }
   };

   const startSilenceCountdown = () => {
      setSilenceCountdown(3);
      let count = 3;

      silenceInterval.current = setInterval(() => {
         count -= 1;
         setSilenceCountdown(count);
         if (count <= 0) {
            clearInterval(silenceInterval.current);
         }
      }, 1000);

      // Auto stop after 3 seconds silence
      silenceTimer.current = setTimeout(async () => {
         if (isRecording.current) {
            await processVoice();
         }
      }, 3000);
   };

   const silenceCountdownRef = useRef(null);

   const startVisualFeedback = () => {
      // This just shows pulsing - no fixed countdown
      // Countdown resets when speech detected
   };

   const startListening = async () => {
      setState(STATES.LISTENING);
      setStatusText('🎤 Listening... speak now');
      setTranscribedText('');
      setResults([]);
      setSummary('');
      setSilenceCountdown(3);
      clearAllTimers();

      try {
         const hasPermission = await VoiceService.requestPermission();
         if (!hasPermission) {
            setState(STATES.ERROR);
            setErrorText('Microphone permission denied.');
            return;
         }

         startPulse();
         await VoiceService.startRecording(() => {
            // Silence detected - auto process
            if (isRecording.current) {
               processVoice();
            }
         }); isRecording.current = true;
         setStatusText('🎤 Listening... speak now\n(auto-stops after 3s silence)');

         // Start visual countdown that resets when speech detected
         startVisualFeedback();

      } catch (e) {
         console.error('Start listening error:', e);
         setState(STATES.ERROR);
         setErrorText('Could not start listening. Please try again.');
      }
   };

   const processVoice = async () => {
      if (!isRecording.current) return;
      isRecording.current = false;
      clearAllTimers();
      stopPulse();

      try {
         // Step 1 — Transcribe
         setState(STATES.TRANSCRIBING);
         setStatusText('⏳ Transcribing your voice...');

         let filePath;
         try {
            filePath = await VoiceService.stopRecording();
         } catch (e) {
            filePath = null;
         }

         if (!filePath) {
            throw new Error('Recording failed');
         }

         const text = await VoiceService.transcribeAudio(filePath);
         setTranscribedText(text);

         // Step 2 — Get Intent
         setState(STATES.PROCESSING);
         setStatusText('🤖 Understanding your request...');
         const intent = await IntentService.getIntent(text);

         if (intent.intent === 'add_reminder') {
            onClose();
            onAddReminder(intent);
         } else if (intent.intent === 'query_reminders') {
            setStatusText('🔍 Fetching your reminders...');
            const queryResults = await IntentService.queryReminders(intent);

            setStatusText('✨ Generating summary...');
            const aiSummary = await IntentService.generateSummary(
               queryResults,
               intent.summary_request || text,
            );

            setResults(queryResults);
            setSummary(aiSummary);
            setStatusText('');
            setState(STATES.RESULTS);
         } else {
            const queryResults = await IntentService.queryReminders({
               query_type: 'upcoming',
            });
            const aiSummary = await IntentService.generateSummary(
               queryResults,
               text,
            );
            setResults(queryResults);
            setSummary(aiSummary);
            setStatusText('');
            setState(STATES.RESULTS);
         }
      } catch (e) {
         console.error('Voice assistant error:', e);
         setState(STATES.ERROR);
         setErrorText('Could not process your request. Please try again.');
      }
   };

   const formatDateTime = dateTime => {
      return new Date(dateTime).toLocaleString('en-IN', {
         day: '2-digit',
         month: 'short',
         hour: '2-digit',
         minute: '2-digit',
         hour12: true,
      });
   };

   const renderReminder = ({ item }) => (
      <View style={styles.reminderItem}>
         <View style={styles.reminderItemLeft}>
            <Text style={styles.reminderItemIcon}>
               {item.isCompleted ? '✅' : '🔔'}
            </Text>
         </View>
         <View style={styles.reminderItemContent}>
            <Text style={styles.reminderItemTitle} numberOfLines={2}>
               {item.title}
            </Text>
            {item.location ? (
               <Text style={styles.reminderItemLocation}>📍 {item.location}</Text>
            ) : null}
            <Text style={styles.reminderItemTime}>
               {formatDateTime(item.dateTime)}
            </Text>
         </View>
      </View>
   );

   const renderContent = () => {
      switch (state) {
         case STATES.LISTENING:
            return (
               <View style={styles.listeningContainer}>
                  <Animated.View
                     style={[
                        styles.pulseRing,
                        { transform: [{ scale: pulseAnim }] },
                     ]}>
                     <View style={styles.micCircle}>
                        <Text style={styles.micEmoji}>🎤</Text>
                     </View>
                  </Animated.View>

                  {/* Silence countdown */}
                  <View style={styles.countdownContainer}>
                     <Text style={styles.countdownLabel}>Auto-stops in</Text>
                     <Text style={styles.countdownNumber}>{silenceCountdown}s</Text>
                  </View>

                  <Text style={styles.statusText}>{statusText}</Text>
                  <Text style={styles.hintText}>
                     Try: "Remind me to call doctor tomorrow at 3 PM"{'\n'}
                     or: "Show reminders at office"
                  </Text>

                  <View style={styles.buttonRow}>
                     <TouchableOpacity
                        style={styles.stopBtn}
                        onPress={processVoice}>
                        <Text style={styles.stopBtnText}>⏹ Stop Now</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={onClose}>
                        <Text style={styles.cancelBtnText}>✕ Cancel</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            );

         case STATES.TRANSCRIBING:
         case STATES.PROCESSING:
            return (
               <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.statusText}>{statusText}</Text>
                  {transcribedText ? (
                     <View style={styles.transcribedBox}>
                        <Text style={styles.transcribedLabel}>You said:</Text>
                        <Text style={styles.transcribedText}>
                           "{transcribedText}"
                        </Text>
                     </View>
                  ) : null}
               </View>
            );

         case STATES.RESULTS:
            return (
               <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.summaryBox}>
                     <Text style={styles.summaryIcon}>🤖</Text>
                     <Text style={styles.summaryText}>{summary}</Text>
                  </View>

                  {transcribedText ? (
                     <View style={styles.transcribedBox}>
                        <Text style={styles.transcribedLabel}>You asked:</Text>
                        <Text style={styles.transcribedText}>
                           "{transcribedText}"
                        </Text>
                     </View>
                  ) : null}

                  <Text style={styles.resultsCount}>
                     {results.length} reminder{results.length !== 1 ? 's' : ''} found
                  </Text>

                  {results.length > 0 ? (
                     <FlatList
                        data={results}
                        keyExtractor={item => item.id}
                        renderItem={renderReminder}
                        scrollEnabled={false}
                     />
                  ) : (
                     <View style={styles.noResults}>
                        <Text style={styles.noResultsEmoji}>📭</Text>
                        <Text style={styles.noResultsText}>No reminders found</Text>
                     </View>
                  )}

                  <TouchableOpacity
                     style={styles.askAgainBtn}
                     onPress={startListening}>
                     <Text style={styles.askAgainBtnText}>🎤 Ask Again</Text>
                  </TouchableOpacity>
               </ScrollView>
            );

         case STATES.ERROR:
            return (
               <View style={styles.errorContainer}>
                  <Text style={styles.errorEmoji}>😕</Text>
                  <Text style={styles.errorText}>{errorText}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={startListening}>
                     <Text style={styles.retryBtnText}>🎤 Try Again</Text>
                  </TouchableOpacity>
               </View>
            );

         default:
            return null;
      }
   };

   return (
      <Modal
         visible={visible}
         transparent
         animationType="slide"
         onRequestClose={onClose}>
         <View style={styles.overlay}>
            <View style={styles.container}>
               <View style={styles.header}>
                  <Text style={styles.headerTitle}>
                     {triggeredByWakeWord ? '🎤 Hey RemainApp!' : '🎤 Voice Assistant'}
                  </Text>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                     <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
               </View>
               <View style={styles.content}>{renderContent()}</View>
            </View>
         </View>
      </Modal>
   );
};

const styles = StyleSheet.create({
   overlay: {
      flex: 1,
      backgroundColor: '#00000080',
      justifyContent: 'flex-end',
      paddingBottom: 40,
   },
   container: {
      backgroundColor: Colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
      minHeight: '55%',
   },
   header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
   },
   headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
   closeBtn: { padding: 4 },
   closeBtnText: { fontSize: 18, color: Colors.textLight },
   content: { flex: 1, padding: 20 },
   listeningContainer: { alignItems: 'center', paddingVertical: 20 },
   pulseRing: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: Colors.primary + '30',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
   },
   micCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
   },
   micEmoji: { fontSize: 36 },
   countdownContainer: {
      alignItems: 'center',
      marginBottom: 12,
      backgroundColor: Colors.primary + '15',
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
   },
   countdownLabel: { fontSize: 12, color: Colors.textLight },
   countdownNumber: {
      fontSize: 28,
      fontWeight: 'bold',
      color: Colors.primary,
   },
   statusText: {
      fontSize: 15,
      fontWeight: '600',
      color: Colors.text,
      textAlign: 'center',
      marginBottom: 10,
   },
   hintText: {
      fontSize: 13,
      color: Colors.textLight,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
   },
   buttonRow: {
      flexDirection: 'row',
      gap: 12,
   },
   stopBtn: {
      backgroundColor: Colors.error,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 20,
   },
   stopBtnText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
   cancelBtn: {
      backgroundColor: Colors.border,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 20,
   },
   cancelBtnText: { color: Colors.text, fontWeight: '600', fontSize: 14 },
   processingContainer: { alignItems: 'center', paddingVertical: 30 },
   transcribedBox: {
      backgroundColor: Colors.white,
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
      borderLeftWidth: 3,
      borderLeftColor: Colors.primary,
      width: '100%',
   },
   transcribedLabel: { fontSize: 11, color: Colors.textLight, marginBottom: 4 },
   transcribedText: { fontSize: 14, color: Colors.text, fontStyle: 'italic' },
   summaryBox: {
      backgroundColor: Colors.primary + '15',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      flexDirection: 'row',
      gap: 10,
      borderWidth: 1,
      borderColor: Colors.primary + '30',
   },
   summaryIcon: { fontSize: 24 },
   summaryText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 22 },
   resultsCount: { fontSize: 13, color: Colors.textLight, marginBottom: 12 },
   reminderItem: {
      backgroundColor: Colors.white,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      gap: 12,
      elevation: 1,
   },
   reminderItemLeft: { justifyContent: 'center' },
   reminderItemIcon: { fontSize: 20 },
   reminderItemContent: { flex: 1 },
   reminderItemTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: 4,
   },
   reminderItemLocation: { fontSize: 12, color: Colors.primary, marginBottom: 2 },
   reminderItemTime: { fontSize: 12, color: Colors.textLight },
   noResults: { alignItems: 'center', paddingVertical: 30 },
   noResultsEmoji: { fontSize: 40, marginBottom: 10 },
   noResultsText: { fontSize: 15, color: Colors.textLight },
   askAgainBtn: {
      backgroundColor: Colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 8,
   },
   askAgainBtnText: { color: Colors.white, fontWeight: '600', fontSize: 15 },
   errorContainer: { alignItems: 'center', paddingVertical: 30 },
   errorEmoji: { fontSize: 50, marginBottom: 16 },
   errorText: {
      fontSize: 15,
      color: Colors.text,
      textAlign: 'center',
      marginBottom: 24,
   },
   retryBtn: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
   },
   retryBtnText: { color: Colors.white, fontWeight: '600', fontSize: 15 },
});

export default VoiceAssistantModal;