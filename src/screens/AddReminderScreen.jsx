import React, { useState, useEffect, useRef, useCallback } from 'react';
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
   Animated,
   Image,
   Modal,
   FlatList,
   Dimensions,
} from 'react-native';
import Colors from '../constants/Colors';
import Storage from '../utils/Storage';
import { createReminder, updateReminder, getAllReminders, checkConflict } from '../services/ApiService';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import AIService from '../services/AIService';
import NotificationService from '../services/NotificationService';
const audioRecorderPlayer = new AudioRecorderPlayer();
import LocationPickerModal from '../components/LocationPickerModal';
import VoiceService from '../services/VoiceService';

const AddReminderScreen = ({ navigation, route }) => {
   const isVoice = route.params?.isVoice || false;
   const prefillData = route.params?.prefillData || null;
   const editReminder = route.params?.editReminder || null;
   const isEditMode = !!editReminder;

   useEffect(() => {
      if (editReminder) {
         setMessage(editReminder.title || editReminder.message || ''); // ← backend uses message
         setLocation(editReminder.location || '');
         // dateTime comes as "2025-12-31T10:00:00" from _map()
         setSelectedDate(new Date(editReminder.dateTime));
         if (editReminder.type) setReminderType(editReminder.type);
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
   const [showDatePicker, setShowDatePicker] = useState(false);
   const [showTimePicker, setShowTimePicker] = useState(false);
   const [loading, setLoading] = useState(false);
   const [reminderType, setReminderType] = useState('ONCE');
   const [showMapModal, setShowMapModal] = useState(false);

   // ── Custom Scroll Wheel Picker Helpers ──
   const ITEM_HEIGHT = 50;
   const VISIBLE_ITEMS = 5;

   // Generate arrays for picker wheels
   const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
   const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
   
   const generateDays = () => {
      const daysCount = getDaysInMonth(selectedDate.getMonth(), selectedDate.getFullYear());
      return Array.from({length: daysCount}, (_, i) => i + 1);
   };
   const generateYears = () => {
      const currentYear = new Date().getFullYear();
      return Array.from({length: 5}, (_, i) => currentYear + i);
   };
   const generateHours = () => Array.from({length: 12}, (_, i) => i + 1);
   const generateMinutes = () => Array.from({length: 60}, (_, i) => i);

   // Temp picker values
   const [pickerDay, setPickerDay] = useState(selectedDate.getDate());
   const [pickerMonth, setPickerMonth] = useState(selectedDate.getMonth());
   const [pickerYear, setPickerYear] = useState(selectedDate.getFullYear());
   const [pickerHour, setPickerHour] = useState(selectedDate.getHours() % 12 || 12);
   const [pickerMinute, setPickerMinute] = useState(selectedDate.getMinutes());
   const [pickerAmPm, setPickerAmPm] = useState(selectedDate.getHours() >= 12 ? 'PM' : 'AM');

   const openDatePicker = () => {
      setPickerDay(selectedDate.getDate());
      setPickerMonth(selectedDate.getMonth());
      setPickerYear(selectedDate.getFullYear());
      setShowDatePicker(true);
   };

   const confirmDate = () => {
      const updated = new Date(selectedDate);
      updated.setFullYear(pickerYear);
      updated.setMonth(pickerMonth);
      updated.setDate(pickerDay);
      setSelectedDate(updated);
      setShowDatePicker(false);
   };

   const openTimePicker = () => {
      const h = selectedDate.getHours();
      setPickerHour(h % 12 || 12);
      setPickerMinute(selectedDate.getMinutes());
      setPickerAmPm(h >= 12 ? 'PM' : 'AM');
      setShowTimePicker(true);
   };

   const confirmTime = () => {
      let h = pickerHour;
      if (pickerAmPm === 'AM' && h === 12) h = 0;
      if (pickerAmPm === 'PM' && h !== 12) h += 12;
      const updated = new Date(selectedDate);
      updated.setHours(h);
      updated.setMinutes(pickerMinute);
      setSelectedDate(updated);
      setShowTimePicker(false);
   };

   // Scroll-wheel item renderer
   const WheelColumn = ({ data, selectedValue, onSelect, formatter, width }) => {
      const flatListRef = useRef(null);
      const initialIndex = data.indexOf(selectedValue);

      useEffect(() => {
         if (flatListRef.current && initialIndex >= 0) {
            setTimeout(() => {
               flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
            }, 100);
         }
      }, []);

      const onMomentumScrollEnd = (e) => {
         const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
         if (idx >= 0 && idx < data.length) {
            onSelect(data[idx]);
         }
      };

      return (
         <View style={[wheelStyles.column, { width: width || 80 }]}>
            <FlatList
               ref={flatListRef}
               data={data}
               keyExtractor={(item, i) => `${item}-${i}`}
               showsVerticalScrollIndicator={false}
               snapToInterval={ITEM_HEIGHT}
               decelerationRate="fast"
               onMomentumScrollEnd={onMomentumScrollEnd}
               getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
               contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
               renderItem={({ item }) => {
                  const isSelected = item === selectedValue;
                  return (
                     <View style={[wheelStyles.item, { height: ITEM_HEIGHT }]}>
                        <Text style={[wheelStyles.itemText, isSelected && wheelStyles.itemTextSelected]}>
                           {formatter ? formatter(item) : item}
                        </Text>
                     </View>
                  );
               }}
            />
            {/* Selection highlight */}
            <View style={wheelStyles.selectionOverlay} pointerEvents="none">
               <View style={wheelStyles.selectionBar} />
            </View>
         </View>
      );
   };

   // Voice states
   const [isRecording, setIsRecording] = useState(false);
   const [isTranscribing, setIsTranscribing] = useState(false);
   const [isParsing, setIsParsing] = useState(false);
   const [statusText, setStatusText] = useState('');

   // AI Text Input & Suggestion states
   const [isAIParsing, setIsAIParsing] = useState(false);
   const [pastReminders, setPastReminders] = useState([]);
   const [uniqueLocations, setUniqueLocations] = useState([]);
   const [showDailySuggest, setShowDailySuggest] = useState(false);
   const [locationSuggestions, setLocationSuggestions] = useState([]);

   useEffect(() => {
      const fetchPastData = async () => {
         try {
            const userData = await Storage.get('user');
            if (userData?.id) {
               const data = await getAllReminders(userData.id);
               const all = [
                  ...(data.reminders?.today || []),
                  ...(data.reminders?.upcoming || []),
                  ...(data.reminders?.past || []),
                  ...(data.reminders?.closed || []),
               ].map(r => ({
                  id: r.id,
                  title: r.message,
                  dateTime: `${r.reminder_date}T${r.reminder_time}`,
                  location: r.location,
                  type: r.reminder_type,
               }));
               setPastReminders(all);

               const locs = [...new Set(all.map(r => r.location).filter(l => l && l !== 'Home' && l !== 'Not specified'))];
               setUniqueLocations(locs);
            }
         } catch (e) {
            console.log('Failed to fetch past reminders for suggestions');
         }
      };
      if (!isEditMode) fetchPastData();
   }, []);

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

   // ── AI Natural Language Text Parse Handler ──
   const handleAIParse = async () => {
      if (!message.trim()) {
         Alert.alert('Empty Input', 'Please type your reminder details in the message box below first');
         return;
      }
      setIsAIParsing(true);
      try {
         const parsed = await VoiceService.parseWithAI(message.trim());

         // Fill message
         if (parsed.message) setMessage(parsed.message);

         // Fill location
         if (parsed.location) setLocation(parsed.location);

         // Fill date and time
         const dateStr = parsed.date || new Date().toISOString().split('T')[0];
         const timeStr = parsed.time || new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: false,
         });
         const [year, month, day] = dateStr.split('-').map(Number);
         const [hour, minute] = timeStr.split(':').map(Number);
         const newDate = new Date(year, month - 1, day, hour, minute);
         setSelectedDate(newDate);

         if (!isEditMode) {
            const shouldSuggest = await AIService.checkRepeatSuggest(parsed.message || message.trim(), pastReminders);
            if (shouldSuggest && reminderType !== 'DAILY') setShowDailySuggest(true);
         }

         Alert.alert('✨ Auto-Filled!', 'All fields have been filled by AI. Review and save!');
      } catch (e) {
         console.error('AI parse error:', e);
         Alert.alert('AI Error', 'Could not parse your text. Please try again or fill manually.');
      } finally {
         setIsAIParsing(false);
      }
   };

   // Smart Location Tracker
   useEffect(() => {
      if (location.length > 1 && !isEditMode) {
         const timer = setTimeout(async () => {
            const localMatches = uniqueLocations.filter(L => L.toLowerCase().includes(location.toLowerCase()));
            if (localMatches.length > 0) {
               setLocationSuggestions(localMatches.slice(0, 3));
            } else if (uniqueLocations.length > 0) {
               const aiMatches = await AIService.suggestLocation(location, uniqueLocations);
               setLocationSuggestions(aiMatches);
            }
         }, 800);
         return () => clearTimeout(timer);
      } else {
         setLocationSuggestions([]);
      }
   }, [location, uniqueLocations, isEditMode]);

   const checkRepeatOnBlur = async () => {
      if (!message.trim() || isEditMode || reminderType === 'DAILY') return;
      const shouldSuggest = await AIService.checkRepeatSuggest(message.trim(), pastReminders);
      if (shouldSuggest) setShowDailySuggest(true);
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
         if (!isEditMode) {
            // Duplicate check using local reminders already loaded
            // Duplicate check using pastReminders
            const userData = await Storage.get('user');
            const userId = userData?.id;
            const upcomings = pastReminders.filter(r => new Date(r.dateTime) > new Date());

            const dupCheck = await AIService.checkDuplicate(
               message.trim(),
               selectedDate.toISOString(),
               upcomings,
            );
            
            if (dupCheck?.isDuplicate) {
               setLoading(false);
               Alert.alert(
                  '🤖 Possible Duplicate',
                  `This looks similar to an existing reminder.\n\n"${dupCheck.reason}"\n\nDo you still want to add it?`,
                  [
                     { text: 'Cancel', style: 'cancel' },
                     { text: 'Add Anyway', onPress: () => doConflictCheckAndSave(userData) },
                  ],
               );
               return;
            }
         }
         await doConflictCheckAndSave();
      } catch (e) {
         setLoading(false);
         Alert.alert('Error', 'Failed to save reminder.');
      }
   };

   const doConflictCheckAndSave = async (cachedUserData = null) => {
      if (!isEditMode) {
         try {
            const userData = cachedUserData || await Storage.get('user');
            const conflictData = await checkConflict({
               user_id: userData?.id,
               date: selectedDate.toISOString(),
               time: selectedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
               message: message.trim(),
            });

            if (conflictData?.conflict) {
               setLoading(false);
               
               let alertTitle = '⚠️ Similar Reminder';
               let alertBody = '';

               if (conflictData.conflictType === 'message_and_time') {
                  alertBody = `A reminder with similar message content and time already exists:\n\n"${conflictData.conflicts[0].message}"\n\nSave this new one anyway?`;
               } else {
                  alertBody = `A reminder with a similar message already exists for today:\n\n"${conflictData.conflicts[0].message}"\n\nSave this new one anyway?`;
               }

               Alert.alert(
                  alertTitle,
                  alertBody,
                  [
                     { text: 'Cancel', style: 'cancel' },
                     { text: 'Save Anyway', onPress: () => saveReminder() },
                  ],
               );
               return;
            }
         } catch (e) {
            console.log('Conflict check error:', e);
         }
      }
      await saveReminder();
   };

   const saveReminder = async () => {
      setLoading(true);
      try {
         const userData = await Storage.get('user');
         const userId = userData?.id;

         if (!userId) {
            setLoading(false);
            Alert.alert('Session Error', 'Please log out and log in again.');
            return;
         }

         // Safe date formatting
         const d = selectedDate;
         const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
         const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

         console.log('Creating reminder:', { userId, dateStr, timeStr });

         if (isEditMode) {
            await updateReminder(editReminder.id, {
               message: message.trim(),
               date: dateStr,
               time: timeStr,
               location: location.trim() || undefined,
               type: reminderType,
            });
         } else {
            await createReminder({
               user_id: userId,
               message: message.trim(),
               date: dateStr,
               time: timeStr,
               location: location.trim() || undefined,
               type: reminderType,
            });
         }

         setLoading(false);
         // Reschedule all notifications after save
         // const userData = await Storage.get('user');
         if (userData?.id) {
            NotificationService.scheduleForUserId(userData.id).catch(() => { });
         }
         Alert.alert(
            'Success',
            isEditMode ? 'Reminder updated!' : 'Reminder saved!',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
         );
      } catch (err) {
         setLoading(false);
         console.log('Save reminder error:', err.message);
         Alert.alert('Error', err.message || 'Failed to save reminder.');
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

            {/* Message with Inline AI */}
            <View style={styles.inputGroup}>
               <View style={styles.messageHeaderRow}>
                  <View style={styles.labelWithInfo}>
                     <Text style={[styles.label, { marginBottom: 0 }]}>Message</Text>
                     <TouchableOpacity 
                        onPress={() => Alert.alert('✨ AI Auto-Fill', 'Type naturally, AI fills the form!\n\nExample:\n"Call doctor tomorrow 3pm at hospital"')}>
                        <Text style={styles.infoIcon}>ⓘ</Text>
                     </TouchableOpacity>
                  </View>
                  {!isEditMode && (
                     <TouchableOpacity
                        style={[styles.inlineAiBtn, isAIParsing && styles.aiParseBtnDisabled]}
                        onPress={handleAIParse}
                        disabled={isAIParsing}>
                        {isAIParsing ? (
                           <ActivityIndicator size="small" color={Colors.white} />
                        ) : (
                           <Text style={styles.inlineAiBtnText}>✨ Fill</Text>
                        )}
                     </TouchableOpacity>
                  )}
               </View>
               <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What do you want to be reminded about? Or use 🎤 mic"
                  value={message}
                  onChangeText={setMessage}
                  onBlur={checkRepeatOnBlur}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor={Colors.textLight}
               />
               {showDailySuggest && (
                  <View style={styles.suggestBanner}>
                     <Text style={styles.suggestText}>💡 You created similar reminders 3 times last week. Want to make this daily?</Text>
                     <TouchableOpacity 
                        style={styles.suggestBtn} 
                        onPress={() => { setReminderType('DAILY'); setShowDailySuggest(false); }}>
                        <Text style={styles.suggestBtnText}>Make Daily</Text>
                     </TouchableOpacity>
                  </View>
               )}
            </View>

            <View style={styles.inputGroup}>
               <Text style={styles.label}>Location (Optional)</Text>
               <View style={styles.locationInputRow}>
                  <TextInput
                     style={[styles.input, { flex: 1, marginRight: 10 }]}
                     placeholder="Where? e.g. Office, Home..."
                     value={location}
                     onChangeText={setLocation}
                     placeholderTextColor={Colors.textLight}
                  />
                  <TouchableOpacity
                     style={styles.mapBtn}
                     onPress={() => setShowMapModal(true)}>
                     <Image source={require('../assets/location.png')} style={{ width: 22, height: 22, tintColor: Colors.primary }} />
                  </TouchableOpacity>
               </View>
               {locationSuggestions.length > 0 && (
                  <View style={styles.locationChipsRow}>
                     {locationSuggestions.map((loc, idx) => (
                        <TouchableOpacity key={idx} style={styles.locChip} onPress={() => { setLocation(loc); setLocationSuggestions([]); }}>
                           <Text style={styles.locChipText}>{loc}</Text>
                        </TouchableOpacity>
                     ))}
                  </View>
               )}
            </View>

            {/* Reminder Type */}
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Reminder Type</Text>
               <View style={styles.typeRow}>
                  <TouchableOpacity
                     style={[
                        styles.typeBtn,
                        reminderType === 'ONCE' && styles.typeBtnActive,
                     ]}
                     onPress={() => setReminderType('ONCE')}>
                     <Text style={[
                        styles.typeBtnText,
                        reminderType === 'ONCE' && styles.typeBtnTextActive,
                     ]}>
                        🔂  Once
                     </Text>
                     <Text style={[
                        styles.typeBtnSub,
                        reminderType === 'ONCE' && styles.typeBtnSubActive,
                     ]}>
                        One-time reminder
                     </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                     style={[
                        styles.typeBtn,
                        reminderType === 'DAILY' && styles.typeBtnActive,
                     ]}
                     onPress={() => setReminderType('DAILY')}>
                     <Text style={[
                        styles.typeBtnText,
                        reminderType === 'DAILY' && styles.typeBtnTextActive,
                     ]}>
                        🔁  Daily
                     </Text>
                     <Text style={[
                        styles.typeBtnSub,
                        reminderType === 'DAILY' && styles.typeBtnSubActive,
                     ]}>
                        Repeats every day
                     </Text>
                  </TouchableOpacity>
               </View>
            </View>

            {/* Date Picker */}
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Date</Text>
               <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={openDatePicker}>
                  <Text style={styles.pickerText}>
                     {'🗓 ' +
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
               <Text style={styles.label}>Time</Text>
               <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={openTimePicker}>
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

         {/* Date Scroll Picker Modal */}
         <Modal visible={showDatePicker} transparent animationType="slide">
            <View style={styles.modalOverlay}>
               <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>🗓 Select Date</Text>
                  <View style={wheelStyles.wheelRow}>
                     <WheelColumn
                        data={generateDays()}
                        selectedValue={pickerDay}
                        onSelect={setPickerDay}
                        formatter={(d) => String(d).padStart(2, '0')}
                        width={70}
                     />
                     <WheelColumn
                        data={Array.from({length: 12}, (_, i) => i)}
                        selectedValue={pickerMonth}
                        onSelect={setPickerMonth}
                        formatter={(m) => months[m]}
                        width={80}
                     />
                     <WheelColumn
                        data={generateYears()}
                        selectedValue={pickerYear}
                        onSelect={setPickerYear}
                        width={90}
                     />
                  </View>
                  <View style={styles.modalButtons}>
                     <TouchableOpacity
                        style={styles.modalCancelBtn}
                        onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.modalConfirmBtn}
                        onPress={confirmDate}>
                        <Text style={styles.modalConfirmText}>Confirm</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            </View>
         </Modal>

         {/* Time Scroll Picker Modal */}
         <Modal visible={showTimePicker} transparent animationType="slide">
            <View style={styles.modalOverlay}>
               <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>⏰ Select Time</Text>
                  <View style={wheelStyles.wheelRow}>
                     <WheelColumn
                        data={generateHours()}
                        selectedValue={pickerHour}
                        onSelect={setPickerHour}
                        formatter={(h) => String(h).padStart(2, '0')}
                        width={80}
                     />
                     <Text style={wheelStyles.separator}>:</Text>
                     <WheelColumn
                        data={generateMinutes()}
                        selectedValue={pickerMinute}
                        onSelect={setPickerMinute}
                        formatter={(m) => String(m).padStart(2, '0')}
                        width={80}
                     />
                     <WheelColumn
                        data={['AM', 'PM']}
                        selectedValue={pickerAmPm}
                        onSelect={setPickerAmPm}
                        width={70}
                     />
                  </View>
                  <View style={styles.modalButtons}>
                     <TouchableOpacity
                        style={styles.modalCancelBtn}
                        onPress={() => setShowTimePicker(false)}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.modalConfirmBtn}
                        onPress={confirmTime}>
                        <Text style={styles.modalConfirmText}>Confirm</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            </View>
         </Modal>

         {/* Map Location Picker Modal */}
         <LocationPickerModal
            visible={showMapModal}
            onClose={() => setShowMapModal(false)}
            onConfirm={(address, lat, lon) => {
               if (address && address !== 'Unknown location' && address !== 'Could not fetch address') {
                  setLocation(address);
               }
               setShowMapModal(false);
            }}
         />

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
   locationInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
   },
   mapBtn: {
      backgroundColor: Colors.white,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 10,
      width: 50,
      height: 50,
      justifyContent: 'center',
      alignItems: 'center',
   },
   mapBtnIcon: {
      fontSize: 24,
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
   typeRow: {
      flexDirection: 'row',
      gap: 12,
   },
   typeBtn: {
      flex: 1,
      backgroundColor: Colors.white,
      borderRadius: 12,
      padding: 14,
      borderWidth: 2,
      borderColor: Colors.border,
      alignItems: 'center',
   },
   typeBtnActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primary + '10',
   },
   typeBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textLight,
      marginBottom: 4,
   },
   typeBtnTextActive: {
      color: Colors.primary,
   },
   typeBtnSub: {
      fontSize: 11,
      color: Colors.textLight,
   },
   typeBtnSubActive: {
      color: Colors.primary,
   },

   // ── Inline AI & Form Structure ─────────────────────────
   messageHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
   },
   labelWithInfo: {
      flexDirection: 'row',
      alignItems: 'center',
   },
   infoIcon: {
      fontSize: 16,
      marginLeft: 8,
   },
   inlineAiBtn: {
      backgroundColor: Colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 2,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
   },
   aiParseBtnDisabled: {
      opacity: 0.6,
   },
   inlineAiBtnText: {
      color: Colors.white,
      fontWeight: '700',
      fontSize: 13,
   },
   suggestBanner: {
      backgroundColor: Colors.primary + '15',
      padding: 12,
      borderRadius: 10,
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
   },
   suggestText: {
      flex: 1,
      fontSize: 12,
      color: Colors.primary,
      fontWeight: '600',
      marginRight: 10,
   },
   suggestBtn: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
   },
   suggestBtnText: {
      color: Colors.white,
      fontSize: 11,
      fontWeight: 'bold',
   },
   locationChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
   },
   locChip: {
      backgroundColor: Colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
   },
   locChipText: {
      fontSize: 12,
      color: Colors.text,
   },
});

const wheelStyles = StyleSheet.create({
   wheelRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      height: 150,
      marginVertical: 20,
   },
   column: {
      height: 150,
      overflow: 'hidden',
      alignItems: 'center',
   },
   item: {
      justifyContent: 'center',
      alignItems: 'center',
   },
   itemText: {
      fontSize: 20,
      color: Colors.textLight,
      fontWeight: '500',
   },
   itemTextSelected: {
      fontSize: 24,
      color: Colors.primary,
      fontWeight: 'bold',
   },
   selectionOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
   },
   selectionBar: {
      height: 50,
      width: '100%',
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderColor: Colors.primary + '50',
      backgroundColor: Colors.primary + '10',
   },
   separator: {
      fontSize: 24,
      fontWeight: 'bold',
      color: Colors.text,
      marginHorizontal: 10,
   },
});

export default AddReminderScreen;