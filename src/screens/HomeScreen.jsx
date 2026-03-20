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
} from 'react-native';
import Colors from '../constants/Colors';
import ReminderService from '../services/ReminderService';
import Storage from '../utils/Storage';
import PicovoiceService from '../services/PicovoiceService';
import VoiceAssistantModal from '../components/VoiceAssistantModal';

const HomeScreen = ({ navigation }) => {
   const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
   const [upcomingReminders, setUpcomingReminders] = useState([]);
   const [user, setUser] = useState(null);
   const [greeting, setGreeting] = useState('');
   const [selectedReminder, setSelectedReminder] = useState(null);
   const [showModal, setShowModal] = useState(false);
   useEffect(() => {
      loadData();
      setGreetingMessage();
      const unsubscribe = navigation.addListener('focus', loadData);

      // Start wake word detection
      PicovoiceService.init(() => {
         setShowVoiceAssistant(true);
      });

      return () => {
         unsubscribe();
         PicovoiceService.stop();
      };
   }, [navigation]);

   const loadData = async () => {
      const userData = await Storage.get('user');
      setUser(userData);
      const reminders = await ReminderService.getUpcoming();
      setUpcomingReminders(reminders.slice(0, 5));
   };

   const setGreetingMessage = () => {
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 17) setGreeting('Good Afternoon');
      else setGreeting('Good Evening');
   };

   // const handleLogout = () => {
   //    Alert.alert('Logout', 'Are you sure you want to logout?', [
   //       { text: 'Cancel', style: 'cancel' },
   //       {
   //          text: 'Logout',
   //          style: 'destructive',
   //          onPress: async () => {
   //             await Storage.remove('user');
   //             navigation.replace('Login');
   //          },
   //       },
   //    ]);
   // };

   const formatDateTime = (dateTime) => {
      const date = new Date(dateTime);
      return date.toLocaleString('en-IN', {
         day: '2-digit',
         month: 'short',
         hour: '2-digit',
         minute: '2-digit',
      });
   };

   const formatFullDateTime = (dateTime) => {
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

   const handleReminderPress = (item) => {
      setSelectedReminder(item);
      setShowModal(true);
   };

   const handleMarkDone = async () => {
      await ReminderService.complete(selectedReminder.id);
      setShowModal(false);
      loadData();
   };

   const handleDelete = () => {
      Alert.alert('Delete Reminder', 'Are you sure?', [
         { text: 'Cancel', style: 'cancel' },
         {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
               await ReminderService.delete(selectedReminder.id);
               setShowModal(false);
               loadData();
            },
         },
      ]);
   };

   const renderReminderItem = ({ item }) => (
      <TouchableOpacity
         style={styles.reminderCard}
         onPress={() => handleReminderPress(item)}>
         <View style={styles.reminderLeft}>
            <Text style={styles.reminderIcon}>{item.isVoice ? '🎤' : '✏️'}</Text>
         </View>
         <View style={styles.reminderContent}>
            <Text style={styles.reminderTitle} numberOfLines={1}>
               {item.title}
            </Text>
            <Text style={styles.reminderTime}>{formatDateTime(item.dateTime)}</Text>
         </View>
         <Text style={styles.arrowIcon}>›</Text>
      </TouchableOpacity>
   );

   return (
      <View style={styles.container}>
         <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

         {/* Header */}
         {/* Header */}
         <View style={styles.header}>
            <TouchableOpacity
               style={styles.profileSection}
               onPress={() => navigation.navigate('Profile')}>
               <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                     {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
                  </Text>
               </View>
               <View>
                  <Text style={styles.profileName}>{user?.name || 'User'}</Text>
                  <Text style={styles.profilePhone}>
                     {user?.countryCode || '+91'} {user?.phone || ''}
                  </Text>
               </View>
            </TouchableOpacity>
            <Text style={styles.greetingBadge}>{greeting} 👋</Text>
         </View>

         {/* Quick Actions */}
         <View style={styles.quickActions}>

            <TouchableOpacity
               style={styles.actionCard}
               onPress={() => navigation.navigate('ReminderList')}>
               <Text style={styles.actionEmoji}>📋</Text>
               <Text style={styles.actionText}>All Reminders</Text>
            </TouchableOpacity>
         </View>

         {/* Upcoming Reminders */}
         <View style={styles.section}>
            <View style={styles.sectionHeader}>
               <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
               <TouchableOpacity onPress={() => navigation.navigate('ReminderList')}>
                  <Text style={styles.seeAll}>See All</Text>
               </TouchableOpacity>
            </View>

            {upcomingReminders.length === 0 ? (
               <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>🔔</Text>
                  <Text style={styles.emptyText}>No upcoming reminders</Text>
                  <Text style={styles.emptySubText}>
                     Tap Voice or Text to add one!
                  </Text>
               </View>
            ) : (
               <FlatList
                  data={upcomingReminders}
                  keyExtractor={item => item.id}
                  renderItem={renderReminderItem}
                  showsVerticalScrollIndicator={false}
               />
            )}
         </View>

         {/* Reminder Detail Modal */}
         <Modal
            visible={showModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowModal(false)}>
            <View style={styles.modalOverlay}>
               <View style={styles.modalBox}>
                  {selectedReminder && (() => {
                     const { date, time } = formatFullDateTime(selectedReminder.dateTime);
                     return (
                        <>
                           {/* Modal Header */}
                           <View style={styles.modalHeader}>
                              <Text style={styles.modalIcon}>
                                 {selectedReminder.isVoice ? '🎤' : '✏️'}
                              </Text>
                              <TouchableOpacity onPress={() => setShowModal(false)}>
                                 <Text style={styles.modalClose}>✕</Text>
                              </TouchableOpacity>
                           </View>

                           {/* Title */}
                           <Text style={styles.modalTitle}>{selectedReminder.title}</Text>

                           {/* Status Badge */}
                           <View style={styles.badgeRow}>
                              {selectedReminder.isCompleted ? (
                                 <View style={[styles.badge, styles.badgeDone]}>
                                    <Text style={styles.badgeDoneText}>✓ Completed</Text>
                                 </View>
                              ) : (
                                 <View style={[styles.badge, styles.badgePending]}>
                                    <Text style={styles.badgePendingText}>🔔 Upcoming</Text>
                                 </View>
                              )}
                           </View>

                           {/* Details */}
                           <View style={styles.detailsBox}>
                              <View style={styles.detailRow}>
                                 <Text style={styles.detailIcon}>📅</Text>
                                 <View>
                                    <Text style={styles.detailLabel}>Date</Text>
                                    <Text style={styles.detailValue}>{date}</Text>
                                 </View>
                              </View>
                              <View style={styles.detailDivider} />
                              <View style={styles.detailRow}>
                                 <Text style={styles.detailIcon}>🕐</Text>
                                 <View>
                                    <Text style={styles.detailLabel}>Time</Text>
                                    <Text style={styles.detailValue}>{time}</Text>
                                 </View>
                              </View>
                              {selectedReminder.description ? (
                                 <>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailRow}>
                                       <Text style={styles.detailIcon}>📝</Text>
                                       <View style={styles.detailFlex}>
                                          <Text style={styles.detailLabel}>Description</Text>
                                          <Text style={styles.detailValue}>
                                             {selectedReminder.description}
                                          </Text>
                                       </View>
                                    </View>
                                 </>
                              ) : null}
                              {selectedReminder.location ? (
                                 <>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailRow}>
                                       <Text style={styles.detailIcon}>📍</Text>
                                       <View style={styles.detailFlex}>
                                          <Text style={styles.detailLabel}>Location</Text>
                                          <Text style={styles.detailValue}>
                                             {selectedReminder.location}
                                          </Text>
                                       </View>
                                    </View>
                                 </>
                              ) : null}
                              <View style={styles.detailDivider} />
                              <View style={styles.detailRow}>
                                 <Text style={styles.detailIcon}>🗓</Text>
                                 <View>
                                    <Text style={styles.detailLabel}>Created</Text>
                                    <Text style={styles.detailValue}>
                                       {new Date(selectedReminder.createdAt)
                                          .toLocaleDateString('en-IN', {
                                             day: '2-digit',
                                             month: 'short',
                                             year: 'numeric',
                                          })}
                                    </Text>
                                 </View>
                              </View>
                           </View>

                           {/* Action Buttons */}
                           {!selectedReminder.isCompleted && (
                              <TouchableOpacity
                                 style={styles.doneButton}
                                 onPress={handleMarkDone}>
                                 <Text style={styles.doneButtonText}>✓ Mark as Done</Text>
                              </TouchableOpacity>
                           )}
                           <TouchableOpacity
                              style={styles.deleteButton}
                              onPress={handleDelete}>
                              <Text style={styles.deleteButtonText}>🗑 Delete Reminder</Text>
                           </TouchableOpacity>
                        </>
                     );
                  })()}
               </View>
            </View>
         </Modal>

         {/* FAB */}
         <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('AddReminder', { isVoice: false })}>
            <Text style={styles.fabText}>+</Text>
         </TouchableOpacity>
         <VoiceAssistantModal
            visible={showVoiceAssistant}
            onClose={() => setShowVoiceAssistant(false)}
            onAddReminder={(intent) => {
               navigation.navigate('AddReminder', {
                  isVoice: true,
                  prefillData: intent,
               });
            }}
         />
         {/* Voice Assistant FAB */}
         <TouchableOpacity
            style={styles.voiceFab}
            onPress={() => setShowVoiceAssistant(true)}>
            <Text style={styles.voiceFabText}>🎤</Text>
         </TouchableOpacity>
      </View>
   );
};

const styles = StyleSheet.create({
   container: {
      flex: 1,
      backgroundColor: Colors.background,
   },
   header: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 24,
      paddingTop: 50,
      paddingBottom: 24,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
   },
   quickActions: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 20,
      justifyContent: 'space-between',
   },
   actionCard: {
      flex: 1,
      backgroundColor: Colors.white,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginHorizontal: 4,
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   actionCardFull: {
      flex: 1,
      backgroundColor: Colors.white,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   actionEmoji: {
      fontSize: 28,
      marginBottom: 8,
   },
   actionText: {
      fontSize: 12,
      fontWeight: '600',
      color: Colors.text,
      textAlign: 'center',
   },
   section: {
      flex: 1,
      paddingHorizontal: 16,
   },
   sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
   },
   sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
   },
   seeAll: {
      fontSize: 14,
      color: Colors.primary,
      fontWeight: '500',
   },
   reminderCard: {
      backgroundColor: Colors.white,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   reminderLeft: {
      marginRight: 12,
   },
   reminderIcon: {
      fontSize: 24,
   },
   reminderContent: {
      flex: 1,
   },
   reminderTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: 4,
   },
   reminderTime: {
      fontSize: 12,
      color: Colors.textLight,
   },
   doneBtn: {
      fontSize: 20,
      color: Colors.success,
      fontWeight: 'bold',
      paddingHorizontal: 8,
   },
   emptyContainer: {
      alignItems: 'center',
      marginTop: 40,
   },
   emptyEmoji: {
      fontSize: 50,
      marginBottom: 12,
   },
   emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: 4,
   },
   emptySubText: {
      fontSize: 13,
      color: Colors.textLight,
   },
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
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
   },
   fabText: {
      fontSize: 28,
      color: Colors.white,
      fontWeight: '300',
   },
   arrowIcon: {
      fontSize: 22,
      color: Colors.textLight,
      fontWeight: '300',
   },
   modalOverlay: {
      flex: 1,
      backgroundColor: '#00000060',
      justifyContent: 'flex-end',
   },
   modalBox: {
      backgroundColor: Colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '85%',
   },
   modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
   },
   modalIcon: {
      fontSize: 32,
   },
   modalClose: {
      fontSize: 20,
      color: Colors.textLight,
      padding: 4,
   },
   modalTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 12,
   },
   badgeRow: {
      marginBottom: 16,
   },
   badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
   },
   badgeDone: {
      backgroundColor: Colors.success + '20',
   },
   badgeDoneText: {
      color: Colors.success,
      fontWeight: '600',
      fontSize: 13,
   },
   badgePending: {
      backgroundColor: Colors.primary + '20',
   },
   badgePendingText: {
      color: Colors.primary,
      fontWeight: '600',
      fontSize: 13,
   },
   detailsBox: {
      backgroundColor: Colors.white,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
   },
   detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 8,
   },
   detailFlex: {
      flex: 1,
   },
   detailDivider: {
      height: 1,
      backgroundColor: Colors.border,
   },
   detailIcon: {
      fontSize: 20,
      marginTop: 2,
   },
   detailLabel: {
      fontSize: 12,
      color: Colors.textLight,
      marginBottom: 2,
   },
   detailValue: {
      fontSize: 15,
      color: Colors.text,
      fontWeight: '500',
   },
   doneButton: {
      backgroundColor: Colors.success,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 10,
   },
   doneButtonText: {
      color: Colors.white,
      fontSize: 16,
      fontWeight: '600',
   },
   deleteButton: {
      backgroundColor: Colors.error + '15',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.error + '40',
   },
   deleteButtonText: {
      color: Colors.error,
      fontSize: 16,
      fontWeight: '600',
   },
   profileSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
   },
   profileAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: Colors.white + '30',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: Colors.white + '60',
   },
   profileAvatarText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: Colors.white,
   },
   profileName: {
      fontSize: 17,
      fontWeight: 'bold',
      color: Colors.white,
   },
   profilePhone: {
      fontSize: 12,
      color: Colors.white,
      opacity: 0.8,
      marginTop: 2,
   },
   greetingBadge: {
      fontSize: 13,
      color: Colors.white,
      backgroundColor: Colors.white + '20',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
   },
   voiceFab: {
      position: 'absolute',
      bottom: 90,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: Colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: Colors.secondary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
   },
   voiceFabText: {
      fontSize: 24,
   },
});

export default HomeScreen;