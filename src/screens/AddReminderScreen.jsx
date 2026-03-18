import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import Colors from '../constants/Colors';
import ReminderService from '../services/ReminderService';

const AddReminderScreen = ({ navigation, route }) => {
  const isVoice = route.params?.isVoice || false;

  const [message, setMessage] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDateModal, setShowDateModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [tempDay, setTempDay] = useState(String(new Date().getDate()));
  const [tempMonth, setTempMonth] = useState(String(new Date().getMonth() + 1));
  const [tempYear, setTempYear] = useState(String(new Date().getFullYear()));
  const [tempAmPm, setTempAmPm] = useState(new Date().getHours() >= 12 ? 'PM' : 'AM');
  const hours12 = new Date().getHours() % 12 || 12;
  const [tempHour, setTempHour] = useState(String(hours12));
  const [tempMinute, setTempMinute] = useState(String(new Date().getMinutes()));
  const [loading, setLoading] = useState(false);

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
      const dateTime = selectedDate.toISOString();
      await ReminderService.add({
        title: message.trim(),
        description: '',
        location: location.trim(),
        dateTime,
        isVoice,
      });
      setLoading(false);
      Alert.alert('Success', 'Reminder saved successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'Failed to save reminder. Please try again.');
    }
  };

  const handleMicPress = () => {
    // Voice to text - will be implemented later
    Alert.alert('Coming Soon', 'Voice input will be available soon!');
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
          {isVoice ? '🎤 Voice Reminder' : '✏️ Add Reminder'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}>

        {/* Message */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Message *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What do you want to be reminded about?"
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
              {'📅  ' + selectedDate.toLocaleDateString('en-IN', {
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
              {'🕐  ' + selectedDate.toLocaleTimeString('en-US', {
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
            <Text style={styles.saveBtnText}>Save Reminder 🔔</Text>
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
                  onPress={() => setTempAmPm(prev => prev === 'AM' ? 'PM' : 'AM')}>
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
      <TouchableOpacity style={styles.micFab} onPress={handleMicPress}>
        <Text style={styles.micFabText}>🎤</Text>
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
  scroll: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  pickerBtn: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 50,
    justifyContent: 'center',
  },
  pickerText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
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
  modalField: {
    flex: 1,
    alignItems: 'center',
  },
  modalLabel: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 8,
  },
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
  ampmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  ampmText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: Colors.textLight,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: Colors.white,
    fontWeight: '600',
  },
  micFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  micFabText: {
    fontSize: 28,
  },
});

export default AddReminderScreen;