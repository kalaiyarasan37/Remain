import React, { useState, useEffect, useRef } from 'react';
import {
   View,
   Text,
   StyleSheet,
   TextInput,
   TouchableOpacity,
   StatusBar,
   Alert,
   ScrollView,
   ActivityIndicator,
   Modal,
   Animated,
} from 'react-native';
import Colors from '../constants/Colors';
import ReminderService from '../services/ReminderService';
import VoiceService from '../services/VoiceService';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
const audioRecorderPlayer = new AudioRecorderPlayer();

const AddReminderScreen = ({ navigation, route }) => {
   const isVoice = route.params?.isVoice || false;
   const prefillData = route.params?.prefillData || null;
   const editReminder = route.params?.editReminder || null;
   const isEditMode = !!editReminder;

   useEffect(() => {
      if (editReminder) {
         setMessage(editReminder.title);
         setLocation(editReminder.location || '');
         setSelectedDate(new Date(editReminder.dateTime));
      } else if (prefillData) {
         if (prefillData.message) setMessage(prefillData.message);
         if (prefillData.location) setLocation(prefillData.location);
         if (prefillData.date && prefillData.time) {
            const [year, month, day] = prefillData.date.split('-').map(Number);
            const [hour, minute] = prefillData.time.split(':').map(Number);
            setSelectedDate(new Date(year, month - 1, day, hour, minute));
         }
      }
   }, []);

   const [message, setMessage] = useState('');
   const [location, setLocation] = useState('');
   const [selectedDate, setSelectedDate] = useState(new Date());
   const [showDateModal, setShowDateModal] = useState(false);
   const [showTimeModal, setShowTimeModal] = useState(false);
   const [tempDay, setTempDay] = useState(String(new Date().getDate()));
   const [tempMonth, setTempMonth] = useState(String(new Date().getMonth() + 1));
   const [tempYear, setTempYear] = useState(String(new Date().getFullYear()));
   const [tempAmPm, setTempAmPm] = useState(
      new Date().getHours() >= 12 ? 'PM' : 'AM',
   );
   const hours12 = new Date().getHours() % 12 || 12;
   const [tempHour, setTempHour] = useState(String(hours12));
   const [tempMinute, setTempMinute] = useState(
      String(new Date().getMinutes()),
   );
   const [loading, setLoading] = useState(false);

   // Voice states
   const [isRecording, setIsRecording] = useState(false);
   const [isTranscribing, setIsTranscribing] = useState(false);
   const [isParsing, setIsParsing] = useState(false);
   const [statusText, setStatusText] = useState('');

   // Mic pulse animation
   const pulseAnim = useRef(new Animated.Value(1)).current;
   const pulseLoop = useRef(null);

   const startPulse = () => {
      pulseLoop.current = Animated.loop(
         Animated.sequence([
            Animated.timing(pulseAnim, {
               toValue: 1.3,
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

   const handleMicPress = async () => {
      // If already recording — stop and process
      if (isRecording) {
         await handleStopRecording();
         return;
      }

      // If processing — ignore
      if (isTranscribing || isParsing) return;

      // Request permission
      const hasPermission = await VoiceService.requestPermission();
      if (!hasPermission) {
         Alert.alert(
            'Permission Denied',
            'Microphone permission is required for voice input.',
         );
         return;
      }

      // Start recording
      try {
         await VoiceService.startRecording();
         setIsRecording(true);
         setStatusText('🎤 Recording... tap to stop');
         startPulse();
      } catch (e) {
         Alert.alert('Error', 'Could not start recording. Please try again.');
      }
   };

   const handleStopRecording = async () => {
      try {
         stopPulse();
         setIsRecording(false);
         setIsTranscribing(true);
         setStatusText('⏳ Transcribing audio...');

         // Stop recording and get file path
         const filePath = await VoiceService.stopRecording();

         // Send to Groq Whisper
         const transcribedText = await VoiceService.transcribeAudio(filePath);
         setStatusText('🤖 AI is extracting details...');
         setIsTranscribing(false);
         setIsParsing(true);

         // Parse with Groq Llama
         const parsed = await VoiceService.parseWithAI(transcribedText);
         setIsParsing(false);
         setStatusText('');

         // Fill message — always fill with full transcribed text
         if (parsed.message) {
            setMessage(parsed.message);
         }

         // Fill location only if present
         if (parsed.location) {
            setLocation(parsed.location);
         }

         // Fill date and time
         const dateStr =
            parsed.date || new Date().toISOString().split('T')[0];
         const timeStr =
            parsed.time ||
            new Date().toLocaleTimeString('en-IN', {
               hour: '2-digit',
               minute: '2-digit',
               hour12: false,
            });

         const [year, month, day] = dateStr.split('-').map(Number);
         const [hour, minute] = timeStr.split(':').map(Number);
         const newDate = new Date(year, month - 1, day, hour, minute);
         setSelectedDate(newDate);

      } catch (e) {
         console.error('Voice error:', e);
         stopPulse();
         setIsRecording(false);
         setIsTranscribing(false);
         setIsParsing(false);
         setStatusText('');
         try {
            await audioRecorderPlayer.stopRecorder();
         } catch (stopErr) {
            // ignore stop error
         }
         Alert.alert(
            'Voice Error',
            'Could not process your voice. Please try again or fill manually.',
         );
      }
   };

   const getMicIcon = () => {
      if (isRecording) return '⏹';
      if (isTranscribing || isParsing) return '⏳';
      return '🎤';
   };

   const getMicColor = () => {
      if (isRecording) return Colors.error;
      if (isTranscribing || isParsing) return Colors.warning;
      return Colors.primary;
   };

   const validateInputs = () => {
      if (!message.trim()) {
         Alert.alert('Missing Message', 'Please enter a reminder message.');
         return false;
      }
      return true;
   };

   const handleSave = async () => {
      if (!validateInputs()) return;
      setLoading(true);
      try {
         if (isEditMode) {
            await ReminderService.update(editReminder.id, {
               title: message.trim(),
               location: location.trim(),
               dateTime: selectedDate.toISOString(),
            });
            // Reschedule notification
            const updated = await ReminderService.getAll();
            const updatedReminder = updated.find(r => r.id === editReminder.id);
            if (updatedReminder) {
               const NotificationService = require('../services/NotificationService').default;
               await NotificationService.cancelForReminder(editReminder.id);
               await NotificationService.scheduleForReminder(updatedReminder);
            }
         } else {
            await ReminderService.add({
               title: message.trim(),
               description: '',
               location: location.trim(),
               dateTime: selectedDate.toISOString(),
               isVoice,
            });
         }
         setLoading(false);
         Alert.alert('Success', 'Reminder saved successfully!', [
            { text: 'OK', onPress: () => navigation.goBack() },
         ]);
      } catch (e) {
         setLoading(false);
         Alert.alert('Error', 'Failed to save reminder. Please try again.');
      }
   };

   return (
      <View style={styles.container}>
         <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

         {/* Header */}
         <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
               <Text style={styles.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
   {isEditMode ? '✏️ Edit Reminder' : '✏️ Add Reminder'}
</Text>
            <View style={{ width: 60 }} />
         </View>

         <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

            {/* Status Banner */}
            {statusText ? (
               <View style={[
                  styles.statusBanner,
                  isRecording && styles.statusBannerRecording,
                  (isTranscribing || isParsing) && styles.statusBannerProcessing,
               ]}>
                  {(isTranscribing || isParsing) && (
                     <ActivityIndicator
                        size="small"
                        color={Colors.primary}
                        style={{ marginRight: 8 }}
                     />
                  )}
                  <Text style={[
                     styles.statusText,
                     isRecording && styles.statusTextRecording,
                  ]}>
                     {statusText}
                  </Text>
               </View>
            ) : null}

            {/* Message */}
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Message *</Text>
               <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What do you want to be reminded about? Or use 🎤 mic"
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor={Colors.textLight}
               />
            </View>

            {/* Location */}
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Location (Optional)</Text>
               <TextInput
                  style={styles.input}
                  placeholder="Where? e.g. Office, Home..."
                  value={location}
                  onChangeText={setLocation}
                  placeholderTextColor={Colors.textLight}
               />
            </View>

            {/* Date Picker */}
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Date *</Text>
               <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => {
                     setTempDay(String(selectedDate.getDate()));
                     setTempMonth(String(selectedDate.getMonth() + 1));
                     setTempYear(String(selectedDate.getFullYear()));
                     setShowDateModal(true);
                  }}>
                  <Text style={styles.pickerText}>
                     {'📅  ' +
                        selectedDate.toLocaleDateString('en-IN', {
                           weekday: 'short',
                           day: '2-digit',
                           month: 'short',
                           year: 'numeric',
                        })}
                  </Text>
               </TouchableOpacity>
            </View>

            {/* Time Picker */}
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Time *</Text>
               <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => {
                     const h = selectedDate.getHours();
                     setTempHour(String(h % 12 || 12));
                     setTempMinute(String(selectedDate.getMinutes()));
                     setTempAmPm(h >= 12 ? 'PM' : 'AM');
                     setShowTimeModal(true);
                  }}>
                  <Text style={styles.pickerText}>
                     {'🕐  ' +
                        selectedDate.toLocaleTimeString('en-US', {
                           hour: '2-digit',
                           minute: '2-digit',
                           hour12: true,
                        })}
                  </Text>
               </TouchableOpacity>
            </View>

            {/* Save Button */}
            <TouchableOpacity
               style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
               onPress={handleSave}
               disabled={loading}>
               {loading ? (
                  <ActivityIndicator color={Colors.white} />
               ) : (
                  <Text style={styles.saveBtnText}>
   {isEditMode ? 'Update Reminder ✅' : 'Save Reminder 🔔'}
</Text>
               )}
            </TouchableOpacity>

            <View style={{ height: 100 }} />
         </ScrollView>

         {/* Date Modal */}
         <Modal visible={showDateModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
               <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>Select Date</Text>
                  <View style={styles.modalRow}>
                     <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Day</Text>
                        <TextInput
                           style={styles.modalInput}
                           keyboardType="number-pad"
                           maxLength={2}
                           value={tempDay}
                           onChangeText={setTempDay}
                        />
                     </View>
                     <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Month</Text>
                        <TextInput
                           style={styles.modalInput}
                           keyboardType="number-pad"
                           maxLength={2}
                           value={tempMonth}
                           onChangeText={setTempMonth}
                        />
                     </View>
                     <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Year</Text>
                        <TextInput
                           style={styles.modalInput}
                           keyboardType="number-pad"
                           maxLength={4}
                           value={tempYear}
                           onChangeText={setTempYear}
                        />
                     </View>
                  </View>
                  <View style={styles.modalButtons}>
                     <TouchableOpacity
                        style={styles.modalCancelBtn}
                        onPress={() => setShowDateModal(false)}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.modalConfirmBtn}
                        onPress={() => {
                           const d = parseInt(tempDay);
                           const m = parseInt(tempMonth);
                           const y = parseInt(tempYear);
                           if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2024) {
                              Alert.alert('Invalid Date', 'Please enter a valid date.');
                              return;
                           }
                           const updated = new Date(selectedDate);
                           updated.setFullYear(y);
                           updated.setMonth(m - 1);
                           updated.setDate(d);
                           setSelectedDate(updated);
                           setShowDateModal(false);
                        }}>
                        <Text style={styles.modalConfirmText}>Confirm</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            </View>
         </Modal>

         {/* Time Modal */}
         <Modal visible={showTimeModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
               <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>Select Time</Text>
                  <View style={styles.modalRow}>
                     <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Hour (1-12)</Text>
                        <TextInput
                           style={styles.modalInput}
                           keyboardType="number-pad"
                           maxLength={2}
                           value={tempHour}
                           onChangeText={setTempHour}
                        />
                     </View>
                     <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Minute</Text>
                        <TextInput
                           style={styles.modalInput}
                           keyboardType="number-pad"
                           maxLength={2}
                           value={tempMinute}
                           onChangeText={setTempMinute}
                        />
                     </View>
                     <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>AM/PM</Text>
                        <TouchableOpacity
                           style={[styles.modalInput, styles.ampmBtn]}
                           onPress={() =>
                              setTempAmPm(prev => (prev === 'AM' ? 'PM' : 'AM'))
                           }>
                           <Text style={styles.ampmText}>{tempAmPm}</Text>
                        </TouchableOpacity>
                     </View>
                  </View>
                  <View style={styles.modalButtons}>
                     <TouchableOpacity
                        style={styles.modalCancelBtn}
                        onPress={() => setShowTimeModal(false)}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.modalConfirmBtn}
                        onPress={() => {
                           let h = parseInt(tempHour);
                           const min = parseInt(tempMinute);
                           if (h < 1 || h > 12 || min < 0 || min > 59) {
                              Alert.alert('Invalid Time', 'Please enter a valid time.');
                              return;
                           }
                           if (tempAmPm === 'AM' && h === 12) h = 0;
                           if (tempAmPm === 'PM' && h !== 12) h += 12;
                           const updated = new Date(selectedDate);
                           updated.setHours(h);
                           updated.setMinutes(min);
                           setSelectedDate(updated);
                           setShowTimeModal(false);
                        }}>
                        <Text style={styles.modalConfirmText}>Confirm</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            </View>
         </Modal>

         {/* Mic FAB */}
         <Animated.View
            style={[
               styles.micFabContainer,
               { transform: [{ scale: pulseAnim }] },
            ]}>
            <TouchableOpacity
               style={[styles.micFab, { backgroundColor: getMicColor() }]}
               onPress={handleMicPress}
               disabled={isTranscribing || isParsing}>
               <Text style={styles.micFabText}>{getMicIcon()}</Text>
            </TouchableOpacity>
         </Animated.View>
      </View>
   );
};

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: Colors.background },
   header: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 20,
      paddingTop: 50,
      paddingBottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
   },
   backBtn: { color: Colors.white, fontSize: 16, fontWeight: '500' },
   headerTitle: { color: Colors.white, fontSize: 18, fontWeight: 'bold' },
   scroll: { flex: 1, padding: 20 },
   statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary + '15',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: Colors.primary + '30',
   },
   statusBannerRecording: {
      backgroundColor: Colors.error + '15',
      borderColor: Colors.error + '40',
   },
   statusBannerProcessing: {
      backgroundColor: Colors.warning + '15',
      borderColor: Colors.warning + '40',
   },
   statusText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
   statusTextRecording: { color: Colors.error },
   inputGroup: { marginBottom: 20 },
   label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
   input: {
      backgroundColor: Colors.white,
      borderRadius: 10,
      padding: 14,
      fontSize: 15,
      color: Colors.text,
      borderWidth: 1,
      borderColor: Colors.border,
   },
   textArea: { height: 120, textAlignVertical: 'top' },
   pickerBtn: {
      backgroundColor: Colors.white,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: Colors.border,
      minHeight: 50,
      justifyContent: 'center',
   },
   pickerText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
   saveBtn: {
      backgroundColor: Colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 10,
   },
   saveBtnDisabled: { opacity: 0.7 },
   saveBtnText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
   modalOverlay: {
      flex: 1,
      backgroundColor: '#00000060',
      justifyContent: 'flex-end',
   },
   modalBox: {
      backgroundColor: Colors.white,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
   },
   modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 20,
      textAlign: 'center',
   },
   modalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
      gap: 12,
   },
   modalField: { flex: 1, alignItems: 'center' },
   modalLabel: { fontSize: 12, color: Colors.textLight, marginBottom: 8 },
   modalInput: {
      width: '100%',
      borderWidth: 2,
      borderColor: Colors.primary,
      borderRadius: 10,
      padding: 12,
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      color: Colors.text,
   },
   ampmBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
   ampmText: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
   modalButtons: { flexDirection: 'row', gap: 12 },
   modalCancelBtn: {
      flex: 1,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
   },
   modalCancelText: { color: Colors.textLight, fontWeight: '600' },
   modalConfirmBtn: {
      flex: 1,
      padding: 14,
      borderRadius: 10,
      backgroundColor: Colors.primary,
      alignItems: 'center',
   },
   modalConfirmText: { color: Colors.white, fontWeight: '600' },
   micFabContainer: { position: 'absolute', bottom: 24, right: 24 },
   micFab: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 8,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
   },
   micFabText: { fontSize: 28 },
});

export default AddReminderScreen;