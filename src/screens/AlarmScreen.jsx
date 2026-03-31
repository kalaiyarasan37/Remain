import React, { useEffect, useState } from 'react';
import {
   View,
   Text,
   StyleSheet,
   TouchableOpacity,
   Animated,
   ScrollView,
} from 'react-native';
import Colors from '../constants/Colors';
import { DeviceEventEmitter } from 'react-native';

// Format dateTime string → "HH:MM" local time
const formatTime = (dateTimeStr) => {
   try {
      const d = new Date(dateTimeStr);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
   } catch {
      return '';
   }
};

// Format dateTime → "Today" / "Mon, 31 Mar" etc.
const formatDateLabel = (dateTimeStr) => {
   try {
      const d = new Date(dateTimeStr);
      const now = new Date();
      const isToday =
         d.getDate() === now.getDate() &&
         d.getMonth() === now.getMonth() &&
         d.getFullYear() === now.getFullYear();
      if (isToday) return 'Today';
      return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
   } catch {
      return '';
   }
};

const AlarmScreen = ({ route, navigation }) => {
   const notification = route.params?.notification || {};
   const title = notification.data?.reminderTitle || notification.title || 'Reminder';
   const body = notification.body || '';

   // Parse next reminders from notification data
   const [nextReminders, setNextReminders] = useState([]);

   useEffect(() => {
      try {
         const raw = notification.data?.nextReminders;
         if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setNextReminders(parsed);
         }
      } catch (e) {
         // ignore parse errors
      }
   }, []);

   // Pulsating animation for the button
   const [pulseAnim] = useState(new Animated.Value(1));

   useEffect(() => {
      Animated.loop(
         Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
         ])
      ).start();

      const sub = DeviceEventEmitter.addListener('STOP_ALARM', () => {
         navigation.replace('Home');
      });
      return () => sub.remove();
   }, []);

   const handleOk = () => {
      DeviceEventEmitter.emit('STOP_ALARM_FROM_UI', notification);
      navigation.replace('Home');
   };

   return (
      <View style={styles.container}>
         {/* ── Current Reminder ── */}
         <View style={styles.currentCard}>
            <Text style={styles.urgentLabel}>🔔 REMINDER</Text>
            <Text style={styles.currentTitle}>{title}</Text>
            {body && body !== 'Tap to view details' && !body.includes('Next:') ? (
               <Text style={styles.currentBody}>{body}</Text>
            ) : null}
         </View>

         {/* ── Up Next section ── */}
         {nextReminders.length > 0 && (
            <View style={styles.nextSection}>
               <Text style={styles.nextSectionLabel}>⏭ UP NEXT</Text>
               <ScrollView
                  style={styles.nextList}
                  contentContainerStyle={styles.nextListContent}
                  showsVerticalScrollIndicator={false}
               >
                  {nextReminders.map((item, index) => (
                     <View key={item.id || index} style={styles.nextCard}>
                        <View style={styles.nextTimeBox}>
                           <Text style={styles.nextTime}>{formatTime(item.dateTime)}</Text>
                           <Text style={styles.nextDate}>{formatDateLabel(item.dateTime)}</Text>
                        </View>
                        <View style={styles.nextInfo}>
                           <Text style={styles.nextTitle} numberOfLines={2}>{item.title}</Text>
                           {item.location ? (
                              <Text style={styles.nextLocation}>📍 {item.location}</Text>
                           ) : null}
                        </View>
                        <View style={[styles.nextIndex, { backgroundColor: index === 0 ? Colors.primary : Colors.border }]}>
                           <Text style={[styles.nextIndexText, { color: index === 0 ? Colors.white : Colors.textLight }]}>
                              {index + 1}
                           </Text>
                        </View>
                     </View>
                  ))}
               </ScrollView>
            </View>
         )}

         {/* ── OK Button ── */}
         <View style={styles.buttonContainer}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
               <TouchableOpacity style={styles.okButton} onPress={handleOk}>
                  <Text style={styles.okButtonText}>OK</Text>
               </TouchableOpacity>
            </Animated.View>
         </View>
      </View>
   );
};

const styles = StyleSheet.create({
   container: {
      flex: 1,
      backgroundColor: '#0D0D1A',
      padding: 20,
      paddingTop: 48,
   },

   // ── Current Reminder ──
   currentCard: {
      backgroundColor: '#1A1A2E',
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.primary + '44',
      marginBottom: 20,
      elevation: 6,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
   },
   urgentLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: Colors.primary,
      letterSpacing: 4,
      marginBottom: 14,
      opacity: 0.9,
   },
   currentTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#FFFFFF',
      textAlign: 'center',
      lineHeight: 36,
   },
   currentBody: {
      fontSize: 15,
      color: Colors.textLight,
      textAlign: 'center',
      marginTop: 10,
   },

   // ── Up Next section ──
   nextSection: {
      flex: 1,
      marginBottom: 12,
   },
   nextSectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: Colors.primary,
      letterSpacing: 3,
      marginBottom: 10,
      opacity: 0.8,
   },
   nextList: {
      flex: 1,
   },
   nextListContent: {
      gap: 10,
      paddingBottom: 8,
   },
   nextCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1A1A2E',
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: '#2A2A40',
   },
   nextTimeBox: {
      alignItems: 'center',
      minWidth: 52,
      marginRight: 14,
   },
   nextTime: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#FFFFFF',
   },
   nextDate: {
      fontSize: 10,
      color: Colors.textLight,
      marginTop: 2,
   },
   nextInfo: {
      flex: 1,
   },
   nextTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#E0E0FF',
      lineHeight: 20,
   },
   nextLocation: {
      fontSize: 12,
      color: Colors.textLight,
      marginTop: 3,
   },
   nextIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
   },
   nextIndexText: {
      fontSize: 12,
      fontWeight: 'bold',
   },

   // ── OK Button ──
   buttonContainer: {
      alignItems: 'center',
      paddingBottom: 40,
      paddingTop: 8,
   },
   okButton: {
      backgroundColor: Colors.primary,
      width: 140,
      height: 140,
      borderRadius: 70,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 10,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.6,
      shadowRadius: 14,
   },
   okButtonText: {
      color: Colors.white,
      fontSize: 32,
      fontWeight: 'bold',
      letterSpacing: 2,
   },
});

export default AlarmScreen;
