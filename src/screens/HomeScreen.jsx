import React, { useState, useEffect } from 'react';
import {
   View,
   Text,
   StyleSheet,
   TouchableOpacity,
   FlatList,
   StatusBar,
   Alert,
   Modal,
   NativeEventEmitter,
   NativeModules,
   PermissionsAndroid,
   Platform,
   ScrollView,
} from 'react-native';
import Colors from '../constants/Colors';
import ReminderService from '../services/ReminderService';
import Storage from '../utils/Storage';
import PicovoiceService from '../services/PicovoiceService';
import VoiceAssistantModal from '../components/VoiceAssistantModal';
import NotificationService from '../services/NotificationService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
   'January', 'February', 'March', 'April', 'May', 'June',
   'July', 'August', 'September', 'October', 'November', 'December',
];

const HomeScreen = ({ navigation }) => {
   const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
   const [upcomingReminders, setUpcomingReminders] = useState([]);
   const [allReminders, setAllReminders] = useState([]);
   const [user, setUser] = useState(null);
   const [greeting, setGreeting] = useState('');
   const [selectedReminder, setSelectedReminder] = useState(null);
   const [showModal, setShowModal] = useState(false);

   // Calendar state
   const today = new Date();
   const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
   const [calendarYear, setCalendarYear] = useState(today.getFullYear());
   const [selectedDate, setSelectedDate] = useState(null);
   const [selectedDateReminders, setSelectedDateReminders] = useState([]);

   useEffect(() => {
      loadData();
      NotificationService.init();
      setGreetingMessage();
      const unsubscribe = navigation.addListener('focus', loadData);

      const requestNotificationPermission = async () => {
         if (Platform.OS === 'android' && Platform.Version >= 33) {
            await PermissionsAndroid.request(
               PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            );
         }
      };
      requestNotificationPermission();

      PicovoiceService.init(() => {
         setShowVoiceAssistant(true);
      });

      const eventEmitter = new NativeEventEmitter(NativeModules.AppForeground);
      const wakeWordSubscription = eventEmitter.addListener(
         'WAKE_WORD_DETECTED',
         () => {
            setShowVoiceAssistant(true);
         },
      );

      return () => {
         unsubscribe();
         PicovoiceService.stop();
         wakeWordSubscription.remove();
      };
   }, [navigation]);

   const loadData = async () => {
      const userData = await Storage.get('user');
      setUser(userData);
      const reminders = await ReminderService.getUpcoming();
      setUpcomingReminders(reminders.slice(0, 5));
      const all = await ReminderService.getAll();
      setAllReminders(all.filter(r => !r.isDeleted));
   };

   const setGreetingMessage = () => {
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 17) setGreeting('Good Afternoon');
      else setGreeting('Good Evening');
   };

   const formatDateTime = dateTime => {
      const date = new Date(dateTime);
      return date.toLocaleString('en-IN', {
         day: '2-digit',
         month: 'short',
         hour: '2-digit',
         minute: '2-digit',
      });
   };

   const formatFullDateTime = dateTime => {
      const date = new Date(dateTime);
      return {
         date: date.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
         }),
         time: date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
         }),
      };
   };

   const handleReminderPress = item => {
      setSelectedReminder(item);
      setShowModal(true);
   };

   const handleMarkDone = async () => {
      if (!selectedReminder) return;
      await ReminderService.markComplete(selectedReminder.id);
      setShowModal(false);
      loadData();
   };

   const handleDelete = async () => {
      if (!selectedReminder) return;
      Alert.alert('Delete Reminder', 'Move to deleted?', [
         { text: 'Cancel', style: 'cancel' },
         {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
               await ReminderService.softDelete(selectedReminder.id);
               setShowModal(false);
               loadData();
            },
         },
      ]);
   };

   // ── Calendar helpers ──────────────────────────────────────
   const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
   const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

   const getRemindersForDate = (day, month, year) => {
      return allReminders.filter(r => {
         const d = new Date(r.dateTime);
         return (
            d.getDate() === day &&
            d.getMonth() === month &&
            d.getFullYear() === year
         );
      });
   };

   const hasReminder = (day, month, year) =>
      getRemindersForDate(day, month, year).length > 0;

   const handleDatePress = (day) => {
      const dateKey = `${calendarYear}-${calendarMonth}-${day}`;
      if (selectedDate === dateKey) {
         setSelectedDate(null);
         setSelectedDateReminders([]);
      } else {
         setSelectedDate(dateKey);
         setSelectedDateReminders(getRemindersForDate(day, calendarMonth, calendarYear));
      }
   };

   const prevMonth = () => {
      if (calendarMonth === 0) {
         setCalendarMonth(11);
         setCalendarYear(y => y - 1);
      } else {
         setCalendarMonth(m => m - 1);
      }
      setSelectedDate(null);
      setSelectedDateReminders([]);
   };

   const nextMonth = () => {
      if (calendarMonth === 11) {
         setCalendarMonth(0);
         setCalendarYear(y => y + 1);
      } else {
         setCalendarMonth(m => m + 1);
      }
      setSelectedDate(null);
      setSelectedDateReminders([]);
   };

   const renderCalendar = () => {
      const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
      const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
      const cells = [];

      // Empty cells before first day
      for (let i = 0; i < firstDay; i++) {
         cells.push(<View key={`empty-${i}`} style={styles.calCell} />);
      }

      // Day cells
      for (let day = 1; day <= daysInMonth; day++) {
         const isToday =
            day === today.getDate() &&
            calendarMonth === today.getMonth() &&
            calendarYear === today.getFullYear();
         const dateKey = `${calendarYear}-${calendarMonth}-${day}`;
         const isSelected = selectedDate === dateKey;
         const hasRem = hasReminder(day, calendarMonth, calendarYear);

         cells.push(
            <TouchableOpacity
               key={day}
               style={[
                  styles.calCell,
                  isToday && styles.calCellToday,
                  isSelected && styles.calCellSelected,
               ]}
               onPress={() => handleDatePress(day)}>
               <Text
                  style={[
                     styles.calCellText,
                     isToday && styles.calCellTodayText,
                     isSelected && styles.calCellSelectedText,
                  ]}>
                  {day}
               </Text>
               {hasRem && (
                  <View
                     style={[
                        styles.calDot,
                        isSelected && styles.calDotSelected,
                     ]}
                  />
               )}
            </TouchableOpacity>,
         );
      }

      return cells;
   };

   const getSelectedDateLabel = () => {
      if (!selectedDate) return '';
      const [y, m, d] = selectedDate.split('-').map(Number);
      return new Date(y, m, d).toLocaleDateString('en-IN', {
         weekday: 'long',
         day: '2-digit',
         month: 'long',
         year: 'numeric',
      });
   };

   return (
      <View style={styles.container}>
         <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

         {/* Header */}
         <View style={styles.header}>
            <View>
               <Text style={styles.greeting}>{greeting} 👋</Text>
               <Text style={styles.userName}>{user?.name || 'User'}</Text>
            </View>
            <TouchableOpacity
               style={styles.profileBtn}
               onPress={() => navigation.navigate('Profile')}>
               <Text style={styles.profileInitial}>
                  {user?.name?.[0]?.toUpperCase() || 'U'}
               </Text>
            </TouchableOpacity>
         </View>

         <ScrollView showsVerticalScrollIndicator={false}>

            {/* ── Full Month Calendar ─────────────────────────── */}
            <View style={styles.calendarCard}>
               {/* Month navigation */}
               <View style={styles.calHeader}>
                  <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
                     <Text style={styles.calNavText}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.calMonthTitle}>
                     {MONTHS[calendarMonth]} {calendarYear}
                  </Text>
                  <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
                     <Text style={styles.calNavText}>›</Text>
                  </TouchableOpacity>
               </View>

               {/* Day labels */}
               <View style={styles.calDayLabels}>
                  {DAYS.map(d => (
                     <Text key={d} style={styles.calDayLabel}>{d}</Text>
                  ))}
               </View>

               {/* Calendar grid */}
               <View style={styles.calGrid}>{renderCalendar()}</View>
            </View>

            {/* ── Selected Date Reminders ─────────────────────── */}
            {selectedDate && (
               <View style={styles.selectedSection}>
                  <Text style={styles.selectedDateLabel}>
                     📅 {getSelectedDateLabel()}
                  </Text>

                  {selectedDateReminders.length === 0 ? (
                     <View style={styles.noReminders}>
                        <Text style={styles.noRemindersEmoji}>📭</Text>
                        <Text style={styles.noRemindersText}>
                           No reminders on this day
                        </Text>
                        <TouchableOpacity
                           style={styles.addReminderBtn}
                           onPress={() =>
                              navigation.navigate('AddReminder', { isVoice: false })
                           }>
                           <Text style={styles.addReminderBtnText}>+ Add Reminder</Text>
                        </TouchableOpacity>
                     </View>
                  ) : (
                     selectedDateReminders.map(item => (
                        <TouchableOpacity
                           key={item.id}
                           style={styles.reminderCard}
                           onPress={() => handleReminderPress(item)}>
                           <View
                              style={[
                                 styles.colorBar,
                                 item.isCompleted
                                    ? styles.colorBarDone
                                    : styles.colorBarActive,
                              ]}
                           />
                           <View style={styles.reminderInfo}>
                              <Text
                                 style={[
                                    styles.reminderTitle,
                                    item.isCompleted && styles.reminderTitleDone,
                                 ]}
                                 numberOfLines={2}>
                                 {item.title}
                              </Text>
                              {item.location ? (
                                 <Text style={styles.reminderLocation}>
                                    📍 {item.location}
                                 </Text>
                              ) : null}
                              <Text style={styles.reminderTime}>
                                 🕐 {formatDateTime(item.dateTime)}
                              </Text>
                           </View>
                           <Text style={styles.reminderStatus}>
                              {item.isCompleted ? '✅' : '🔔'}
                           </Text>
                        </TouchableOpacity>
                     ))
                  )}
               </View>
            )}

            {/* ── Upcoming Reminders ──────────────────────────── */}
            <View style={styles.section}>
               <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
                  <TouchableOpacity
                     onPress={() => navigation.navigate('ReminderList')}>
                     <Text style={styles.seeAll}>See All</Text>
                  </TouchableOpacity>
               </View>

               {upcomingReminders.length === 0 ? (
                  <View style={styles.emptyCard}>
                     <Text style={styles.emptyEmoji}>🎉</Text>
                     <Text style={styles.emptyText}>No upcoming reminders!</Text>
                  </View>
               ) : (
                  upcomingReminders.map(item => (
                     <TouchableOpacity
                        key={item.id}
                        style={styles.reminderCard}
                        onPress={() => handleReminderPress(item)}>
                        <View style={[styles.colorBar, styles.colorBarActive]} />
                        <View style={styles.reminderInfo}>
                           <Text style={styles.reminderTitle} numberOfLines={2}>
                              {item.title}
                           </Text>
                           {item.location ? (
                              <Text style={styles.reminderLocation}>
                                 📍 {item.location}
                              </Text>
                           ) : null}
                           <Text style={styles.reminderTime}>
                              🕐 {formatDateTime(item.dateTime)}
                           </Text>
                        </View>
                        <Text style={styles.reminderStatus}>🔔</Text>
                     </TouchableOpacity>
                  ))
               )}
            </View>

            <View style={{ height: 100 }} />
         </ScrollView>

         {/* Add Reminder FAB */}
         <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('AddReminder', { isVoice: false })}>
            <Text style={styles.fabText}>+</Text>
         </TouchableOpacity>

         {/* Voice FAB */}
         <TouchableOpacity
            style={styles.voiceFab}
            onPress={() => setShowVoiceAssistant(true)}>
            <Text style={styles.voiceFabText}>🎤</Text>
         </TouchableOpacity>

         {/* Reminder Detail Modal */}
         <Modal
            visible={showModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowModal(false)}>
            <View style={styles.modalOverlay}>
               <View style={styles.modalBox}>
                  {selectedReminder && (() => {
                     const dt = formatFullDateTime(selectedReminder.dateTime);
                     return (
                        <>
                           <Text style={styles.modalTitle} numberOfLines={3}>
                              {selectedReminder.title}
                           </Text>
                           {selectedReminder.location ? (
                              <Text style={styles.modalLocation}>
                                 📍 {selectedReminder.location}
                              </Text>
                           ) : null}
                           <Text style={styles.modalDate}>📅 {dt.date}</Text>
                           <Text style={styles.modalTime}>🕐 {dt.time}</Text>
                           <View style={styles.modalBadgeRow}>
                              {selectedReminder.isCompleted ? (
                                 <View style={[styles.badge, styles.badgeDone]}>
                                    <Text style={styles.badgeDoneText}>✅ Completed</Text>
                                 </View>
                              ) : (
                                 <View style={[styles.badge, styles.badgePending]}>
                                    <Text style={styles.badgePendingText}>🔔 Pending</Text>
                                 </View>
                              )}
                           </View>
                           <View style={styles.modalButtons}>
                              {!selectedReminder.isCompleted && (
                                 <TouchableOpacity
                                    style={styles.doneBtn}
                                    onPress={handleMarkDone}>
                                    <Text style={styles.doneBtnText}>✅ Done</Text>
                                 </TouchableOpacity>
                              )}
                              {!selectedReminder.isCompleted && (
                                 <TouchableOpacity
                                    style={styles.editBtn}
                                    onPress={() => {
                                       setShowModal(false);
                                       navigation.navigate('AddReminder', {
                                          editReminder: selectedReminder,
                                       });
                                    }}>
                                    <Text style={styles.editBtnText}>✏️ Edit</Text>
                                 </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                 style={styles.deleteBtn}
                                 onPress={handleDelete}>
                                 <Text style={styles.deleteBtnText}>🗑</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                 style={styles.closeBtn}
                                 onPress={() => setShowModal(false)}>
                                 <Text style={styles.closeBtnText}>Close</Text>
                              </TouchableOpacity>
                           </View>
                        </>
                     );
                  })()}
               </View>
            </View>
         </Modal>

         {/* Voice Assistant Modal */}
         <VoiceAssistantModal
            visible={showVoiceAssistant}
            onClose={() => setShowVoiceAssistant(false)}
            triggeredByWakeWord={true}
            onAddReminder={intent => {
               setShowVoiceAssistant(false);
               setTimeout(() => {
                  navigation.navigate('AddReminder', {
                     isVoice: true,
                     prefillData: intent,
                  });
               }, 300);
            }}
         />
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
   greeting: { color: Colors.white, fontSize: 14, opacity: 0.9 },
   userName: { color: Colors.white, fontSize: 22, fontWeight: 'bold' },
   profileBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Colors.white + '30',
      alignItems: 'center',
      justifyContent: 'center',
   },
   profileInitial: { color: Colors.white, fontSize: 18, fontWeight: 'bold' },

   // ── Calendar ────────────────────────────────────────────
   calendarCard: {
      backgroundColor: Colors.white,
      margin: 16,
      borderRadius: 16,
      padding: 16,
      elevation: 3,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
   },
   calHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
   },
   calNavBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
   },
   calNavText: { fontSize: 22, color: Colors.primary, fontWeight: 'bold' },
   calMonthTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text },
   calDayLabels: {
      flexDirection: 'row',
      marginBottom: 6,
   },
   calDayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      color: Colors.textLight,
      fontWeight: '600',
   },
   calGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
   },
   calCell: {
      width: '14.28%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
   },
   calCellToday: {
      backgroundColor: Colors.primary + '20',
      borderRadius: 20,
   },
   calCellSelected: {
      backgroundColor: Colors.primary,
      borderRadius: 20,
   },
   calCellText: { fontSize: 13, color: Colors.text },
   calCellTodayText: { color: Colors.primary, fontWeight: 'bold' },
   calCellSelectedText: { color: Colors.white, fontWeight: 'bold' },
   calDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: Colors.primary,
      marginTop: 2,
   },
   calDotSelected: { backgroundColor: Colors.white },

   // ── Selected date section ────────────────────────────────
   selectedSection: {
      marginHorizontal: 16,
      marginBottom: 8,
   },
   selectedDateLabel: {
      fontSize: 15,
      fontWeight: 'bold',
      color: Colors.primary,
      marginBottom: 12,
   },
   noReminders: {
      backgroundColor: Colors.white,
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      elevation: 1,
   },
   noRemindersEmoji: { fontSize: 36, marginBottom: 8 },
   noRemindersText: { fontSize: 14, color: Colors.textLight, marginBottom: 12 },
   addReminderBtn: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
   },
   addReminderBtnText: { color: Colors.white, fontWeight: '600' },

   // ── Upcoming section ─────────────────────────────────────
   section: { marginHorizontal: 16, marginBottom: 8 },
   sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
   },
   sectionTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text },
   seeAll: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

   emptyCard: {
      backgroundColor: Colors.white,
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      elevation: 1,
   },
   emptyEmoji: { fontSize: 36, marginBottom: 8 },
   emptyText: { fontSize: 14, color: Colors.textLight },

   // ── Reminder card ─────────────────────────────────────────
   reminderCard: {
      backgroundColor: Colors.white,
      borderRadius: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   colorBar: { width: 5, alignSelf: 'stretch' },
   colorBarActive: { backgroundColor: Colors.primary },
   colorBarDone: { backgroundColor: Colors.success },
   reminderInfo: { flex: 1, padding: 12 },
   reminderTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 4 },
   reminderTitleDone: { textDecorationLine: 'line-through', color: Colors.textLight },
   reminderLocation: { fontSize: 12, color: Colors.primary, marginBottom: 2 },
   reminderTime: { fontSize: 12, color: Colors.textLight },
   reminderStatus: { fontSize: 20, paddingRight: 12 },

   // ── FABs ──────────────────────────────────────────────────
   fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
   },
   fabText: { color: Colors.white, fontSize: 28, fontWeight: 'bold' },
   voiceFab: {
      position: 'absolute',
      bottom: 90,
      right: 24,
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: Colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
   },
   voiceFabText: { fontSize: 22 },

   // ── Detail Modal ──────────────────────────────────────────
   modalOverlay: {
      flex: 1,
      backgroundColor: '#00000060',
      justifyContent: 'flex-end',
   },
   modalBox: {
      backgroundColor: Colors.white,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
   },
   modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 12,
   },
   modalLocation: { fontSize: 14, color: Colors.primary, marginBottom: 6 },
   modalDate: { fontSize: 14, color: Colors.textLight, marginBottom: 4 },
   modalTime: { fontSize: 14, color: Colors.textLight, marginBottom: 12 },
   modalBadgeRow: { flexDirection: 'row', marginBottom: 16 },
   badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
   badgeDone: { backgroundColor: Colors.success + '20' },
   badgeDoneText: { color: Colors.success, fontWeight: '600' },
   badgePending: { backgroundColor: Colors.primary + '20' },
   badgePendingText: { color: Colors.primary, fontWeight: '600' },
   modalButtons: { flexDirection: 'row', gap: 10 },
   doneBtn: {
      flex: 1,
      backgroundColor: Colors.success,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
   },
   doneBtnText: { color: Colors.white, fontWeight: '600' },
   deleteBtn: {
      flex: 1,
      backgroundColor: Colors.error + '15',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.error + '30',
   },
   deleteBtnText: { color: Colors.error, fontWeight: '600' },
   closeBtn: {
      flex: 1,
      backgroundColor: Colors.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
   },
   closeBtnText: { color: Colors.textLight, fontWeight: '600' },
   editBtn: {
      flex: 1,
      backgroundColor: Colors.primary + '15',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.primary + '30',
   },
   editBtnText: { color: Colors.primary, fontWeight: '600' },
});

export default HomeScreen;
