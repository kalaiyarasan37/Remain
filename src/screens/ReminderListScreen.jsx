import React, { useState, useEffect } from 'react';
import {
   View,
   Text,
   StyleSheet,
   FlatList,
   TouchableOpacity,
   StatusBar,
   Alert,
   Modal,
} from 'react-native';
import Colors from '../constants/Colors';
import ReminderService from '../services/ReminderService';

const FILTERS = ['all', 'upcoming', 'completed', 'deleted'];

const ReminderListScreen = ({ navigation }) => {
   const [reminders, setReminders] = useState([]);
   const [filter, setFilter] = useState('all');
   const [selectedReminder, setSelectedReminder] = useState(null);
   const [showModal, setShowModal] = useState(false);

   useEffect(() => {
      loadReminders();
      const unsubscribe = navigation.addListener('focus', loadReminders);
      return unsubscribe;
   }, [navigation]);

   const loadReminders = async () => {
      const all = await ReminderService.getAll();
      setReminders(all.reverse());
   };

   const getFilteredReminders = () => {
      switch (filter) {
         case 'upcoming':
            return reminders.filter(
               r => !r.isDeleted && !r.isCompleted && new Date(r.dateTime) > new Date(),
            );
         case 'completed':
            return reminders.filter(r => !r.isDeleted && r.isCompleted);
         case 'deleted':
            return reminders.filter(r => r.isDeleted);
         default:
            return reminders.filter(r => !r.isDeleted);
      }
   };

   const handleDelete = (id) => {
      Alert.alert(
         'Delete Reminder',
         'Move this reminder to deleted section?',
         [
            { text: 'Cancel', style: 'cancel' },
            {
               text: 'Delete',
               style: 'destructive',
               onPress: async () => {
                  await ReminderService.delete(id);
                  loadReminders();
               },
            },
         ],
      );
   };

   const handlePermanentDelete = (id) => {
      Alert.alert(
         'Delete Forever',
         'This will permanently delete the reminder. This cannot be undone.',
         [
            { text: 'Cancel', style: 'cancel' },
            {
               text: 'Delete Forever',
               style: 'destructive',
               onPress: async () => {
                  await ReminderService.deletePermanent(id);
                  loadReminders();
               },
            },
         ],
      );
   };

   const handleReminderPress = (item) => {
      setSelectedReminder(item);
      setShowModal(true);
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

   const handleMarkDoneFromModal = async () => {
      if (!selectedReminder) return;
      await ReminderService.markComplete(selectedReminder.id);
      setShowModal(false);
      loadReminders();
   };

   const handleDeleteFromModal = () => {
      Alert.alert('Delete Reminder', 'Move to deleted section?', [
         { text: 'Cancel', style: 'cancel' },
         {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
               await ReminderService.delete(selectedReminder.id);
               setShowModal(false);
               loadReminders();
            },
         },
      ]);
   };

   const handleRestore = async (id) => {
      await ReminderService.restore(id);
      loadReminders();
      Alert.alert('Restored', 'Reminder has been restored successfully!');
   };

   const handleComplete = async (id) => {
      await ReminderService.complete(id);
      loadReminders();
   };

   const handleClearAllDeleted = () => {
      Alert.alert(
         'Clear All Deleted',
         'Permanently delete all reminders in the deleted section?',
         [
            { text: 'Cancel', style: 'cancel' },
            {
               text: 'Clear All',
               style: 'destructive',
               onPress: async () => {
                  const deleted = await ReminderService.getDeleted();
                  for (const r of deleted) {
                     await ReminderService.deletePermanent(r.id);
                  }
                  loadReminders();
               },
            },
         ],
      );
   };

   const formatDateTime = (dateTime) => {
      const date = new Date(dateTime);
      return date.toLocaleString('en-IN', {
         day: '2-digit',
         month: 'short',
         year: 'numeric',
         hour: '2-digit',
         minute: '2-digit',
      });
   };

   const getFilterLabel = (f) => {
      switch (f) {
         case 'all': return 'All';
         case 'upcoming': return '🔔 Soon';
         case 'completed': return '✓ Done';
         case 'deleted': return '🗑 Deleted';
         default: return f;
      }
   };

   const renderItem = ({ item }) => {
      const isDeletedItem = item.isDeleted;

      return (
         <TouchableOpacity
            style={[
               styles.card,
               item.isCompleted && !isDeletedItem && styles.cardCompleted,
               isDeletedItem && styles.cardDeleted,
            ]}
            onPress={() => handleReminderPress(item)}
            activeOpacity={0.8}>
            {/* Left color bar */}
            <View
               style={[
                  styles.colorBar,
                  isDeletedItem
                     ? styles.colorBarDeleted
                     : item.isCompleted
                        ? styles.colorBarCompleted
                        : styles.colorBarActive,
               ]}
            />

            {/* Content */}
            <View style={styles.cardContent}>
               <View style={styles.cardHeader}>
                  <Text style={styles.cardIcon}>{item.isVoice ? '🎤' : '✏️'}</Text>
                  <Text
                     style={[
                        styles.cardTitle,
                        (item.isCompleted || isDeletedItem) && styles.textCompleted,
                     ]}
                     numberOfLines={1}>
                     {item.title}
                  </Text>
                  {item.isCompleted && !isDeletedItem && (
                     <Text style={styles.completedBadge}>✓ Done</Text>
                  )}
                  {isDeletedItem && (
                     <Text style={styles.deletedBadge}>🗑 Deleted</Text>
                  )}
               </View>

               {item.location ? (
                  <Text style={styles.cardLocation}>📍 {item.location}</Text>
               ) : null}

               <Text style={styles.cardTime}>
                  {isDeletedItem
                     ? '🗑 Deleted: ' + formatDateTime(item.deletedAt)
                     : '📅 ' + formatDateTime(item.dateTime)}
               </Text>

               {/* Actions for normal reminders */}
               {!isDeletedItem && !item.isCompleted && (
                  <View style={styles.actions}>
                     <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={() => handleComplete(item.id)}>
                        <Text style={styles.completeBtnText}>✓ Done</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(item.id)}>
                        <Text style={styles.deleteBtnText}>🗑 Delete</Text>
                     </TouchableOpacity>
                  </View>
               )}

               {!isDeletedItem && item.isCompleted && (
                  <TouchableOpacity
                     style={styles.deleteBtn}
                     onPress={() => handleDelete(item.id)}>
                     <Text style={styles.deleteBtnText}>🗑 Delete</Text>
                  </TouchableOpacity>
               )}

               {/* Actions for deleted reminders */}
               {isDeletedItem && (
                  <View style={styles.actions}>
                     <TouchableOpacity
                        style={styles.restoreBtn}
                        onPress={() => handleRestore(item.id)}>
                        <Text style={styles.restoreBtnText}>↩ Restore</Text>
                     </TouchableOpacity>
                     <TouchableOpacity
                        style={styles.permanentDeleteBtn}
                        onPress={() => handlePermanentDelete(item.id)}>
                        <Text style={styles.permanentDeleteBtnText}>✕ Remove</Text>
                     </TouchableOpacity>
                  </View>
               )}
            </View>

         </TouchableOpacity>
      );
   };

   const filteredReminders = getFilteredReminders();
   const deletedCount = reminders.filter(r => r.isDeleted).length;

   return (
      <View style={styles.container}>
         <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

         {/* Header */}
         <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
               <Text style={styles.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>📋 All Reminders</Text>
            <TouchableOpacity
               onPress={() => navigation.navigate('AddReminder', { isVoice: false })}>
               <Text style={styles.addBtn}>+ Add</Text>
            </TouchableOpacity>
         </View>

         {/* Filter Tabs */}
         <View style={styles.filterContainer}>
            {FILTERS.map(f => (
               <TouchableOpacity
                  key={f}
                  style={[styles.filterTab, filter === f && styles.filterTabActive]}
                  onPress={() => setFilter(f)}>
                  <Text
                     style={[
                        styles.filterText,
                        filter === f && styles.filterTextActive,
                     ]}>
                     {getFilterLabel(f)}
                  </Text>
                  {/* {f === 'deleted' && deletedCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{deletedCount}</Text>
              </View>
            )} */}
               </TouchableOpacity>
            ))}
         </View>

         {/* Count + Clear All for deleted */}
         <View style={styles.countRow}>
            <Text style={styles.countText}>
               {filteredReminders.length} reminder
               {filteredReminders.length !== 1 ? 's' : ''}
            </Text>
            {filter === 'deleted' && deletedCount > 0 && (
               <TouchableOpacity onPress={handleClearAllDeleted}>
                  <Text style={styles.clearAllText}>Clear All</Text>
               </TouchableOpacity>
            )}
         </View>

         {/* List */}
         {filteredReminders.length === 0 ? (
            <View style={styles.emptyContainer}>
               <Text style={styles.emptyEmoji}>
                  {filter === 'deleted' ? '🗑' : filter === 'completed' ? '✅' : '📭'}
               </Text>
               <Text style={styles.emptyText}>
                  {filter === 'deleted'
                     ? 'No deleted reminders'
                     : filter === 'completed'
                        ? 'No completed reminders'
                        : filter === 'upcoming'
                           ? 'No upcoming reminders'
                           : 'No reminders found'}
               </Text>
               {filter !== 'deleted' && filter !== 'completed' && (
                  <TouchableOpacity
                     style={styles.addNewBtn}
                     onPress={() =>
                        navigation.navigate('AddReminder', { isVoice: false })
                     }>
                     <Text style={styles.addNewBtnText}>+ Add Reminder</Text>
                  </TouchableOpacity>
               )}
            </View>
         ) : (
            <FlatList
               data={filteredReminders}
               keyExtractor={item => item.id}
               renderItem={renderItem}
               contentContainerStyle={styles.list}
               showsVerticalScrollIndicator={false}
            />
         )}
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
                     const isDeleted = selectedReminder.isDeleted;
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
                              {isDeleted ? (
                                 <View style={[styles.badge, { backgroundColor: Colors.border }]}>
                                    <Text style={{ color: Colors.textLight, fontWeight: '600' }}>🗑 Deleted</Text>
                                 </View>
                              ) : selectedReminder.isCompleted ? (
                                 <View style={[styles.badge, { backgroundColor: Colors.success + '20' }]}>
                                    <Text style={{ color: Colors.success, fontWeight: '600' }}>✅ Completed</Text>
                                 </View>
                              ) : (
                                 <View style={[styles.badge, { backgroundColor: Colors.primary + '20' }]}>
                                    <Text style={{ color: Colors.primary, fontWeight: '600' }}>🔔 Pending</Text>
                                 </View>
                              )}
                           </View>
                           <View style={styles.modalButtons}>
                              {!selectedReminder.isCompleted && !isDeleted && (
                                 <TouchableOpacity
                                    style={styles.modalEditBtn}
                                    onPress={() => {
                                       setShowModal(false);
                                       navigation.navigate('AddReminder', {
                                          editReminder: selectedReminder,
                                       });
                                    }}>
                                    <Text style={styles.modalEditBtnText}>✏️ Edit</Text>
                                 </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                 style={styles.modalCloseBtn}
                                 onPress={() => setShowModal(false)}>
                                 <Text style={styles.modalCloseBtnText}>Close</Text>
                              </TouchableOpacity>
                           </View>
                        </>
                     );
                  })()}
               </View>
            </View>
         </Modal>
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
      paddingHorizontal: 20,
      paddingTop: 50,
      paddingBottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
   },
   backBtn: {
      color: Colors.white,
      fontSize: 16,
      fontWeight: '500',
   },
   headerTitle: {
      color: Colors.white,
      fontSize: 18,
      fontWeight: 'bold',
   },
   addBtn: {
      color: Colors.white,
      fontSize: 16,
      fontWeight: '600',
   },
   filterContainer: {
      flexDirection: 'row',
      backgroundColor: Colors.white,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 12,
      padding: 4,
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   filterTab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 4,
   },
   filterTabActive: {
      backgroundColor: Colors.primary,
   },
   filterText: {
      fontSize: 12,
      fontWeight: '500',
      color: Colors.textLight,
   },
   filterTextActive: {
      color: Colors.white,
      fontWeight: '600',
   },
   badge: {
      backgroundColor: Colors.error,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
   },
   badgeText: {
      color: Colors.white,
      fontSize: 10,
      fontWeight: 'bold',
   },
   countRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginTop: 12,
      marginBottom: 4,
   },
   countText: {
      fontSize: 13,
      color: Colors.textLight,
   },
   clearAllText: {
      fontSize: 13,
      color: Colors.error,
      fontWeight: '600',
   },
   list: {
      padding: 16,
   },
   card: {
      backgroundColor: Colors.white,
      borderRadius: 12,
      marginBottom: 12,
      flexDirection: 'row',
      overflow: 'hidden',
      elevation: 2,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   cardCompleted: {
      opacity: 0.7,
   },
   cardDeleted: {
      opacity: 0.6,
      backgroundColor: '#f9f9f9',
   },
   colorBar: {
      width: 4,
   },
   colorBarActive: {
      backgroundColor: Colors.primary,
   },
   colorBarCompleted: {
      backgroundColor: Colors.success,
   },
   colorBarDeleted: {
      backgroundColor: Colors.textLight,
   },
   cardContent: {
      flex: 1,
      padding: 14,
   },
   cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      gap: 6,
   },
   cardIcon: {
      fontSize: 16,
   },
   cardTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: Colors.text,
   },
   textCompleted: {
      textDecorationLine: 'line-through',
      color: Colors.textLight,
   },
   completedBadge: {
      fontSize: 11,
      color: Colors.success,
      fontWeight: '600',
      backgroundColor: Colors.success + '15',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
   },
   deletedBadge: {
      fontSize: 11,
      color: Colors.textLight,
      fontWeight: '600',
      backgroundColor: Colors.border,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
   },
   cardLocation: {
      fontSize: 12,
      color: Colors.primary,
      marginBottom: 4,
      fontWeight: '500',
   },
   cardTime: {
      fontSize: 12,
      color: Colors.textLight,
      marginBottom: 10,
   },
   actions: {
      flexDirection: 'row',
      gap: 8,
   },
   completeBtn: {
      backgroundColor: Colors.success + '15',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
   },
   completeBtnText: {
      color: Colors.success,
      fontSize: 13,
      fontWeight: '600',
   },
   deleteBtn: {
      backgroundColor: Colors.error + '15',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
   },
   deleteBtnText: {
      color: Colors.error,
      fontSize: 13,
      fontWeight: '600',
   },
   restoreBtn: {
      backgroundColor: Colors.primary + '15',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
   },
   restoreBtnText: {
      color: Colors.primary,
      fontSize: 13,
      fontWeight: '600',
   },
   permanentDeleteBtn: {
      backgroundColor: Colors.error + '15',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
   },
   permanentDeleteBtnText: {
      color: Colors.error,
      fontSize: 13,
      fontWeight: '600',
   },
   emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
   },
   emptyEmoji: {
      fontSize: 50,
      marginBottom: 12,
   },
   emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: 20,
   },
   addNewBtn: {
      backgroundColor: Colors.primary,
      borderRadius: 10,
      paddingHorizontal: 24,
      paddingVertical: 12,
   },
   addNewBtnText: {
      color: Colors.white,
      fontWeight: '600',
      fontSize: 15,
   },
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
   modalLocation: {
      fontSize: 14,
      color: Colors.primary,
      marginBottom: 6,
   },
   modalDate: {
      fontSize: 14,
      color: Colors.textLight,
      marginBottom: 4,
   },
   modalTime: {
      fontSize: 14,
      color: Colors.textLight,
      marginBottom: 12,
   },
   modalBadgeRow: {
      flexDirection: 'row',
      marginBottom: 16,
   },
   badge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
   },
   modalButtons: {
      flexDirection: 'row',
      gap: 10,
   },
   modalDoneBtn: {
      flex: 1,
      backgroundColor: Colors.success,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
   },
   modalDoneBtnText: {
      color: Colors.white,
      fontWeight: '600',
   },
   modalDeleteBtn: {
      flex: 1,
      backgroundColor: Colors.error + '15',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.error + '30',
   },
   modalDeleteBtnText: {
      color: Colors.error,
      fontWeight: '600',
   },
   modalCloseBtn: {
      flex: 1,
      backgroundColor: Colors.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
   },
   modalCloseBtnText: {
      color: Colors.textLight,
      fontWeight: '600',
   },
   modalEditBtn: {
   flex: 1,
   backgroundColor: Colors.primary + '15',
   borderRadius: 12,
   paddingVertical: 12,
   alignItems: 'center',
   borderWidth: 1,
   borderColor: Colors.primary + '30',
},
modalEditBtnText: {color: Colors.primary, fontWeight: '600'},
});

export default ReminderListScreen;