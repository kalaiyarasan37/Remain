import React, { useState, useEffect } from 'react';
import {
   View,
   Text,
   StyleSheet,
   TouchableOpacity,
   StatusBar,
   Alert,
   Modal,
   NativeEventEmitter,
   NativeModules,
   PermissionsAndroid,
   Platform,
   ScrollView,
   RefreshControl,
} from 'react-native';
import {
   getAllReminders,
   updateReminder,
   deleteReminder,
   createReminder,
} from '../services/ApiService';
import Colors from '../constants/Colors';
import Storage from '../utils/Storage';
import DaVoiceService from '../services/DaVoiceService';

import AIFeaturesModal from '../components/AIFeaturesModal';
import NotificationContextModal from '../components/NotificationContextModal';
import AIDigestModal from '../components/AIDigestModal';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
   'January', 'February', 'March', 'April', 'May', 'June',
   'July', 'August', 'September', 'October', 'November', 'December',
];

const HomeScreen = ({ navigation, route }) => {
   const isSyncing = React.useRef(false);
   const [upcomingReminders, setUpcomingReminders] = useState([]);
   const [allReminders, setAllReminders] = useState([]);
   const [user, setUser] = useState(null);
   const [greeting, setGreeting] = useState('');
   const [selectedReminder, setSelectedReminder] = useState(null);
   const [showModal, setShowModal] = useState(false);
   const [showAI, setShowAI] = useState(false);

   // Notification Context state
   const [contextReminder, setContextReminder] = useState(null);
   const [showContextModal, setShowContextModal] = useState(false);

   // Digest state
   const [showDigestModal, setShowDigestModal] = useState(false);
   const [digestType, setDigestType] = useState('daily');

   // Calendar state
   const today = new Date();
   const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
   const [calendarYear, setCalendarYear] = useState(today.getFullYear());
   const [selectedDate, setSelectedDate] = useState(null);
   const [selectedDateReminders, setSelectedDateReminders] = useState([]);
   const [refreshing, setRefreshing] = useState(false);

   const onRefresh = React.useCallback(async () => {
      setRefreshing(true);
      await loadData();
      setRefreshing(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   useEffect(() => {
      // Remove console.log('TOKEN:') from loadData too
      loadData();
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

      // PicovoiceService.init(() => {
      //    setShowVoiceAssistant(true);
      // });
      DaVoiceService.init(() => {
         navigation.navigate('VoiceAssistant', { autoListen: true });
      });

      const eventEmitter = new NativeEventEmitter(NativeModules.AppForeground);
      const wakeWordSubscription = eventEmitter.addListener(
         'WAKE_WORD_DETECTED',
         () => navigation.navigate('VoiceAssistant', { autoListen: true }),
      );

      const notifSubscription = NativeEventEmitter.prototype.addListener ?
         new NativeEventEmitter().addListener('NOTIFICATION_PRESSED', (reminderId) => {
            openNotificationContext(reminderId);
         }) :
         (() => {
            const { DeviceEventEmitter } = require('react-native');
            return DeviceEventEmitter.addListener('NOTIFICATION_PRESSED', (reminderId) => {
               openNotificationContext(reminderId);
            });
         })();

      return () => {
         unsubscribe();
         // PicovoiceService.stop();
         DaVoiceService.stop();
         wakeWordSubscription.remove();
         notifSubscription.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [navigation]);

   useEffect(() => {
      // Set digest type on mount
      if (new Date().getDay() === 1) { // Monday
         setDigestType('weekly');
      } else {
         setDigestType('daily');
      }
   }, []);

   useEffect(() => {
      if (route.params?.openContextId) {
         openNotificationContext(route.params.openContextId);
         navigation.setParams({ openContextId: undefined });
      }
   }, [route.params?.openContextId, navigation]);

   const openNotificationContext = async (reminderId) => {
      try {
         const { getReminder } = require('../services/ApiService');
         const r = await getReminder(reminderId);
         if (r) {
            setContextReminder({
               id: r.id,
               title: r.message,
               location: r.location,
               dateTime: `${r.reminder_date}T${r.reminder_time}`,
            });
            setShowContextModal(true);
         }
      } catch (e) {
         console.error('Failed to load context reminder', e);
      }
   };

   const mapReminder = (r) => ({
      id: r.id,
      title: r.message,
      location: r.location,
      dateTime: `${r.reminder_date}T${r.reminder_time}`,
      isCompleted: r.closed,
      isDeleted: r.deleted,
      type: r.reminder_type,
      dateStatus: r.date_status,
      createdAt: r.created_at || r.updated_at,
   });

   const getEffectiveTime = (r) => {
      if (!r || !r.dateTime) return Number.MAX_SAFE_INTEGER;
      const d = new Date(r.dateTime);
      if (r.type === 'DAILY') {
         const now = new Date();
         if (d.getTime() < now.getTime()) {
            d.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
         }
      }
      return d.getTime();
   };

   const loadData = async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;

      const userData = await Storage.get('user');
      setUser(userData);
      const userId = userData?.id;
      if (!userId) { 
         isSyncing.current = false;
         return; 
      }

      try {
         // Get all reminders summary
         const data = await getAllReminders(userId);
         const allActiveRaw = [
            ...(data.reminders.today || []),
            ...(data.reminders.upcoming || []),
            ...(data.reminders.past || []),
            ...(data.reminders.closed || []),
         ];
         const uniqueActive = Array.from(new Map(allActiveRaw.map(item => [item.id, item])).values());

         // Map API fields to your existing UI fields
         const mapped = uniqueActive.map(r => mapReminder(r));

         setAllReminders(mapped);
         updateLists(mapped);
      } catch (err) {
         console.error('loadData error:', err);
      } finally {
         isSyncing.current = false;
      }
   };

   const updateLists = (mapped) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

      // Upcoming = Top 5 chronological active reminders FOR TODAY ONLY
      const upcomingSorted = [...mapped]
         .filter(r => {
            if (r.isCompleted || r.isDeleted) return false;

            const rDate = new Date(r.dateTime).getTime();
            // Must be today
            if (rDate < todayStart || rDate > todayEnd) return false;

            if (r.type === 'DAILY' && getEffectiveTime(r) < now.getTime()) {
               return false; // Auto-hide daily reminders whose time has already passed today
            }
            return true;
         })
         .sort((a, b) => {
            const tempA = new Date(a.dateTime);
            const tempB = new Date(b.dateTime);
            const msA = tempA.getHours() * 3600000 + tempA.getMinutes() * 60000 + tempA.getSeconds() * 1000;
            const msB = tempB.getHours() * 3600000 + tempB.getMinutes() * 60000 + tempB.getSeconds() * 1000;
            return msA - msB;
         })
         .slice(0, 5);

      setUpcomingReminders(upcomingSorted);
   };

   const setGreetingMessage = () => {
      const hour = new Date().getHours();
      if (hour < 12) { setGreeting('Good Morning'); }
      else if (hour < 17) { setGreeting('Good Afternoon'); }
      else { setGreeting('Good Evening'); }
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

   const handleMarkDoneDirect = async item => {
      try {
         await updateReminder(item.id, { closed: true });
         loadData();
      } catch (err) {
         Alert.alert('Error', 'Could not complete reminder');
      }
   };

   const handleMarkDone = async () => {
      if (!selectedReminder) { return; }
      try {
         await updateReminder(selectedReminder.id, { closed: true });
         setShowModal(false);
         loadData();
      } catch (err) {
         Alert.alert('Error', 'Could not mark as done.');
      }
   };

   const handleDelete = async () => {
      if (!selectedReminder) { return; }
      Alert.alert('Delete Reminder', 'Move to deleted?', [
         { text: 'Cancel', style: 'cancel' },
         {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
               try {
                  await deleteReminder(selectedReminder.id);
                  setShowModal(false);
                  loadData();
               } catch (err) {
                  Alert.alert('Error', 'Could not delete reminder.');
               }
            },
         },
      ]);
   };

   // ── Calendar helpers ──────────────────────────────────────
   const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
   const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

   const getRemindersForDate = (day, month, year) => {
      const selectedTime = new Date(year, month, day).getTime();

      return allReminders.filter(r => {
         // Show DAILY reminders starting from their current scheduled date
         if (r.type === 'DAILY') {
            const creationDate = r.createdAt ? new Date(r.createdAt) : new Date(r.dateTime);
            const createdTimeOnly = new Date(creationDate.getFullYear(), creationDate.getMonth(), creationDate.getDate()).getTime();
            
            const currentRem = new Date(r.dateTime);
            const currentRemDateOnly = new Date(currentRem.getFullYear(), currentRem.getMonth(), currentRem.getDate()).getTime();
            
            // It belongs to every day since creation, but if it has moved to the future, 
            // today's view is handled by the ONCE-closed clone.
            return selectedTime >= createdTimeOnly && selectedTime >= currentRemDateOnly;
         }

         // For ONCE reminders (whether active or completed), match exactly on their specific date
         const d = new Date(r.dateTime);
         const rDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
         return rDateOnly === selectedTime;
      });
   };

   const hasReminder = (day, month, year) =>
      getRemindersForDate(day, month, year).filter(r => r.type === 'ONCE').length > 0;

   const handleDatePress = (day) => {
      const dateKey = `${calendarYear}-${calendarMonth}-${day}`;
      if (selectedDate === dateKey) {
         setSelectedDate(null);
         setSelectedDateReminders([]);
      } else {
         setSelectedDate(dateKey);
      }
   };

   useEffect(() => {
      if (selectedDate) {
         const [year, month, day] = selectedDate.split('-').map(Number);
         const list = getRemindersForDate(day, month, year);
         list.sort((a, b) => {
            const tempA = new Date(a.dateTime);
            const tempB = new Date(b.dateTime);
            const msA = tempA.getHours() * 3600000 + tempA.getMinutes() * 60000 + tempA.getSeconds() * 1000;
            const msB = tempB.getHours() * 3600000 + tempB.getMinutes() * 60000 + tempB.getSeconds() * 1000;
            return msA - msB;
         });
         setSelectedDateReminders(list);
      } else {
         setSelectedDateReminders([]);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [allReminders, selectedDate]);

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
      if (!selectedDate) { return ''; }
      const [y, m, d] = selectedDate.split('-').map(Number);
      return new Date(y, m, d).toLocaleDateString('en-IN', {
         weekday: 'long',
         day: '2-digit',
         month: 'long',
         year: 'numeric',
      });
   };

   const isSelectedDatePast = () => {
      if (!selectedDate) return false;
      const [y, m, d] = selectedDate.split('-').map(Number);
      const selDate = new Date(y, m, d);
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return selDate.getTime() < todayStart.getTime();
   };

   const isSelectedDateToday = () => {
      if (!selectedDate) return true; // default view is today
      const [y, m, d] = selectedDate.split('-').map(Number);
      return y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
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

         <ScrollView 
            showsVerticalScrollIndicator={false}
            refreshControl={
               <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
            }>

            {/* ── Digest Notification Bubble ──────────────────── */}
            <TouchableOpacity 
               style={styles.digestBanner} 
               onPress={() => setShowDigestModal(true)}
               activeOpacity={0.8}
            >
               <Text style={styles.digestEmoji}>✨</Text>
               <View style={{flex: 1}}>
                  <Text style={styles.digestBannerTitle}>Your {digestType === 'weekly' ? 'Weekly' : 'Daily'} Digest</Text>
                  <Text style={styles.digestBannerSub}>Tap to see your AI-generated summary</Text>
               </View>
               <Text style={styles.digestBannerArrow}>→</Text>
            </TouchableOpacity>

            {/* ── Full Month Calendar ─────────────────────────── */}
            <View style={styles.calendarCard}>
               {/* ── High-Fidelity Stripe Gradient ── */}
               <View style={StyleSheet.absoluteFill}>
                  {Array.from({ length: 40 }).map((_, i) => {
                     const factor = i / 39;
                     // Manual interpolation between primary (#6C63FF) and secondary (#FF6584)
                     const r1 = 108, g1 = 99, b1 = 255; // #6C63FF
                     const r2 = 255, g2 = 101, b2 = 132; // #FF6584
                     const r = Math.round(r1 + factor * (r2 - r1));
                     const g = Math.round(g1 + factor * (g2 - g1));
                     const b = Math.round(b1 + factor * (b2 - b1));
                     const color = `rgb(${r},${g},${b})`;
                     return (
                        <View
                           key={i}
                           style={{
                              height: `${100 / 40}%`,
                              backgroundColor: color,
                           }}
                        />
                     );
                  })}
               </View>

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
                  <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
                     <Text style={[styles.selectedDateLabel, { marginBottom: 0 }]}>
                        📅 {getSelectedDateLabel()}
                     </Text>
                     <TouchableOpacity
                        onPress={() => navigation.navigate('ReminderList')}>
                        <Text style={styles.seeAll}>See All</Text>
                     </TouchableOpacity>
                  </View>

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
                     selectedDateReminders.map(item => {
                        const isPast = isSelectedDatePast();
                        const isDull = !isPast && item.isCompleted;

                        return (
                           <TouchableOpacity
                              key={item.id}
                              style={[
                                 styles.reminderCard,
                                 isDull && { opacity: 0.7 }
                              ]}
                              onPress={() => handleReminderPress(item)}>
                              <View
                                 style={[
                                    styles.colorBar,
                                    isDull
                                       ? styles.colorBarDone
                                       : styles.colorBarActive,
                                 ]}
                              />
                              <View style={styles.reminderInfo}>
                                 <View style={styles.titleRow}>
                                    <Text
                                       style={[
                                          styles.reminderTitle,
                                          isDull && styles.reminderTitleDone,
                                       ]}
                                       numberOfLines={2}>
                                    {item.title}
                                 </Text>
                                 {item.type === 'DAILY' && (
                                    <View style={styles.dailyBadge}>
                                       <Text style={styles.dailyBadgeText}>DAILY</Text>
                                    </View>
                                 )}
                              </View>
                              {item.location ? (
                                 <Text style={styles.reminderLocation}>
                                    📍 {item.location}
                                 </Text>
                              ) : null}
                              <Text style={styles.reminderTime}>
                                 🕐 {formatDateTime(item.dateTime)}
                              </Text>
                           </View>
                           <TouchableOpacity onPress={() => handleMarkDoneDirect(item)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                              <Text style={styles.reminderStatus}>
                                 {item.isCompleted ? '✅' : '🔔'}
                              </Text>
                           </TouchableOpacity>
                        </TouchableOpacity>
                        );
                     })
                  )}
               </View>
            )}

            {/* ── Upcoming Reminders ──────────────────────────── */}
            {isSelectedDateToday() && (
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
                              <View style={styles.titleRow}>
                                 <Text style={styles.reminderTitle} numberOfLines={2}>
                                    {item.title}
                                 </Text>
                                 {item.type === 'DAILY' && (
                                    <View style={styles.dailyBadge}>
                                       <Text style={styles.dailyBadgeText}>DAILY</Text>
                                    </View>
                                 )}
                              </View>
                              {item.location ? (
                                 <Text style={styles.reminderLocation}>
                                    📍 {item.location}
                                 </Text>
                              ) : null}
                              <Text style={styles.reminderTime}>
                                 🕐 {formatDateTime(item.dateTime)}
                              </Text>
                           </View>
                           <TouchableOpacity onPress={() => handleMarkDoneDirect(item)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                              <Text style={styles.reminderStatus}>🔔</Text>
                           </TouchableOpacity>
                        </TouchableOpacity>
                     ))
                  )}
               </View>
            )}

            {/* eslint-disable-next-line react-native/no-inline-styles */}
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
            onPress={() => navigation.navigate('VoiceAssistant', { autoListen: true })}>
            <Text style={styles.voiceFabText}>🎤</Text>
         </TouchableOpacity>

         {/* AI FAB */}
         <TouchableOpacity
            style={styles.aiFab}
            onPress={() => setShowAI(true)}>
            <View style={StyleSheet.absoluteFill}>
               {Array.from({ length: 15 }).map((_, i) => {
                  const factor = i / 14;
                  const r1 = 108, g1 = 99, b1 = 255; // #6C63FF
                  const r2 = 255, g2 = 101, b2 = 132; // #FF6584
                  const r = Math.round(r1 + factor * (r2 - r1));
                  const g = Math.round(g1 + factor * (g2 - g1));
                  const b = Math.round(b1 + factor * (b2 - b1));
                  const color = `rgb(${r},${g},${b})`;
                  return (
                     <View
                        key={i}
                        style={{
                           height: `${100 / 15}%`,
                           backgroundColor: color,
                        }}
                     />
                  );
               })}
            </View>
            <Text style={styles.aiFabText}>🤖</Text>
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



         <AIFeaturesModal
            visible={showAI}
            onClose={() => setShowAI(false)}
            onAddSuggestion={(suggestion) => {
               navigation.navigate('AddReminder', {
                  prefillData: {
                     message: suggestion.title,
                     date: suggestion.suggestedDate,
                     time: suggestion.suggestedTime,
                     location: null,
                  },
               });
            }}
            navigation={navigation}
         />

         <NotificationContextModal
            visible={showContextModal}
            onClose={() => setShowContextModal(false)}
            reminder={contextReminder}
         />

         <AIDigestModal
            visible={showDigestModal}
            onClose={() => setShowDigestModal(false)}
            onNavigate={(filter) => {
               setShowDigestModal(false);
               navigation.navigate('ReminderList', { filter });
            }}
            type={digestType}
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
      margin: 16,
      borderRadius: 16,
      padding: 16,
      elevation: 8,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      overflow: 'hidden', // Required for the absoluteFill gradient background
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
      backgroundColor: Colors.white + '20',
      alignItems: 'center',
      justifyContent: 'center',
   },
   calNavText: { fontSize: 22, color: Colors.white, fontWeight: 'bold' },
   calMonthTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.white, letterSpacing: 1 },
   calDayLabels: {
      flexDirection: 'row',
      marginBottom: 6,
   },
   calDayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 10,
      color: Colors.white,
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      opacity: 0.9,
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
      backgroundColor: Colors.white,
      borderRadius: 20,
      elevation: 4,
      shadowColor: Colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
   },
   calCellSelected: {
      backgroundColor: Colors.white,
      borderRadius: 20,
      elevation: 3,
      shadowColor: Colors.black,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
   },
   calCellText: { 
      fontSize: 14, 
      color: Colors.white,
      fontWeight: '500',
      textShadowColor: 'rgba(0,0,0,0.2)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
   },
   calCellTodayText: { color: Colors.primary, fontWeight: 'bold' },
   calCellSelectedText: { color: Colors.primary, fontWeight: 'bold' },
   calDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: Colors.white + '70',
      marginTop: 2,
   },
   calDotSelected: { backgroundColor: Colors.primary },

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
   titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
   reminderTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 4, marginRight: 8 },
   reminderTitleDone: { color: Colors.textLight },
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
   aiFab: {
      position: 'absolute',
      bottom: 156,
      right: 24,
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      overflow: 'hidden',
   },
   aiFabText: { fontSize: 22 },
   digestBanner: {
      marginHorizontal: 16,
      marginTop: 16,
      backgroundColor: Colors.white,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      elevation: 4,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      borderWidth: 1,
      borderColor: Colors.primary + '20',
   },
   digestEmoji: {
      fontSize: 28,
      marginRight: 12,
   },
   digestBannerTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: Colors.primary,
      marginBottom: 2,
   },
   digestBannerSub: {
      fontSize: 13,
      color: Colors.textLight,
   },
   digestBannerArrow: {
      fontSize: 20,
      color: Colors.primary,
      fontWeight: 'bold',
   },
   dailyBadge: {
      backgroundColor: Colors.success + '20',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      marginLeft: 4,
   },
   dailyBadgeText: {
      color: Colors.success,
      fontSize: 10,
      fontWeight: 'bold',
   },
});

export default HomeScreen;
