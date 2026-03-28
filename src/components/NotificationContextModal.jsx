import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Colors from '../constants/Colors';
import AIService from '../services/AIService';

const NotificationContextModal = ({ visible, onClose, reminder }) => {
  const [contextText, setContextText] = useState('');
  const [loading, setLoading] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible && reminder) {
      setContextText('');
      setLoading(true);
      fadeAnim.setValue(0);
      fetchContext();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reminder]);

  const fetchContext = async () => {
    if (!reminder) { return; }
    try {
      const formattedTime = new Date(reminder.dateTime).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const response = await AIService.getReminderContext(
        reminder.title || reminder.message || 'Reminder',
        reminder.location,
        formattedTime
      );
      setContextText(response);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      setContextText('Could not generate contextual suggestions at this time.');
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } finally {
      setLoading(false);
    }
  };

  if (!reminder) { return null; }

  const dateStr = new Date(reminder.dateTime).toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const timeStr = new Date(reminder.dateTime).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Reminder Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reminderInfo}>
            <Text style={styles.reminderTitle}>{reminder.title || reminder.message}</Text>
            {reminder.location ? (
              <Text style={styles.detailText}>📍 {reminder.location}</Text>
            ) : null}
            <Text style={styles.detailText}>🕐 {dateStr} at {timeStr}</Text>
          </View>

          <View style={styles.aiContainer}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiEmoji}>🤖</Text>
              <Text style={styles.aiTitle}>Smart Context</Text>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Generating useful context...</Text>
              </View>
            ) : (
              <Animated.View style={{ opacity: fadeAnim }}>
                <Text style={styles.aiText}>{contextText}</Text>
              </Animated.View>
            )}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  closeIcon: {
    padding: 4,
  },
  closeIconText: {
    fontSize: 20,
    color: Colors.textLight,
  },
  reminderInfo: {
    backgroundColor: Colors.primary + '10',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  reminderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  aiContainer: {
    backgroundColor: Colors.secondary + '15',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.secondary + '30',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  aiEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.secondary,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  aiText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  closeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default NotificationContextModal;
