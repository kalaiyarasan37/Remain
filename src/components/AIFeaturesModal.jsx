import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Colors from '../constants/Colors';
import AIService from '../services/AIService';
import Storage from '../utils/Storage';
import { getAllReminders } from '../services/ApiService';
import Tts from 'react-native-tts';

const PRIORITY_COLORS = {
  HIGH: Colors.error,
  MEDIUM: Colors.warning,
  LOW: Colors.success,
};

const PRIORITY_ICONS = {
  HIGH: '🔴',
  MEDIUM: '🟡',
  LOW: '🟢',
};

// ── maps API reminder to local shape ──────────
const mapReminder = (r) => ({
  id: r.id,
  title: r.message || '',
  location: r.location || '',
  dateTime: r.reminder_date && r.reminder_time
    ? `${r.reminder_date}T${r.reminder_time}`
    : null,
  isCompleted: r.closed || false,
  isDeleted: r.deleted || false,
  type: r.reminder_type || 'ONCE',
});

// ── fetch all reminders from backend ─────────
const fetchAllReminders = async () => {
  const userData = await Storage.get('user');
  const userId = userData?.id;
  if (!userId) return [];
  const data = await getAllReminders(userId);
  return [
    ...(data.reminders.today || []),
    ...(data.reminders.upcoming || []),
    ...(data.reminders.past || []),
    ...(data.reminders.closed || []),
  ].map(r => mapReminder(r));
};

const AIFeaturesModal = ({visible, onClose, onAddSuggestion, navigation}) => {
  const [activeTab, setActiveTab] = useState('briefing');
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasSpoken = useRef(false);

  // Load TTS preference
  useEffect(() => {
    const loadPref = async () => {
      const pref = await Storage.get('briefingAutoSpeak');
      if (pref !== null) setAutoSpeak(pref);
    };
    loadPref();

    // TTS event listeners
    const startHandler = Tts.addEventListener('tts-start', () => setIsSpeaking(true));
    const finishHandler = Tts.addEventListener('tts-finish', () => setIsSpeaking(false));
    const cancelHandler = Tts.addEventListener('tts-cancel', () => setIsSpeaking(false));

    return () => {
      startHandler?.remove?.();
      finishHandler?.remove?.();
      cancelHandler?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      hasSpoken.current = false;
      loadBriefing();
    } else {
      Tts.stop();
      setIsSpeaking(false);
    }
  }, [visible]);

  // Auto-speak briefing when it loads
  useEffect(() => {
    if (briefing && autoSpeak && !hasSpoken.current && !loading && activeTab === 'briefing') {
      hasSpoken.current = true;
      speakText(briefing);
    }
  }, [briefing, loading, autoSpeak, activeTab]);

  const speakText = (text) => {
    if (!text) return;
    Tts.stop();
    // Clean text for TTS - remove emojis
    const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[✅✓📊📋💪☀️📌📅💡🌅🎉✨🔴🟡🟢]/gu, '').trim();
    Tts.speak(cleanText);
  };

  const toggleAutoSpeak = async () => {
    const newVal = !autoSpeak;
    setAutoSpeak(newVal);
    await Storage.set('briefingAutoSpeak', newVal);
    if (!newVal) {
      Tts.stop();
      setIsSpeaking(false);
    }
  };

  const handleClose = () => {
    Tts.stop();
    setIsSpeaking(false);
    onClose();
  };

  const loadBriefing = async () => {
    setLoading(true);
    try {
      const all = await fetchAllReminders();
      const today = new Date();
      const todayReminders = all.filter(r => {
        if (!r.dateTime) return false;
        const d = new Date(r.dateTime);
        return (
          !r.isDeleted &&
          !r.isCompleted &&
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear()
        );
      });
      const upcoming = all.filter(
        r =>
          !r.isDeleted &&
          !r.isCompleted &&
          r.dateTime &&
          new Date(r.dateTime) > today,
      );
      const text = await AIService.getDailyBriefing(todayReminders, upcoming);
      setBriefing(text);
    } catch (e) {
      console.error('Briefing error:', e);
      setBriefing('Could not load briefing. Please try again.');
    }
    setLoading(false);
  };

  const loadSuggestions = async () => {
    setLoading(true);
    setSuggestions([]); // Clear old suggestions first
    try {
      const all = await fetchAllReminders();
      const result = await AIService.getSmartSuggestions(all);
      setSuggestions(result);
    } catch (e) {
      console.error('Suggestions error:', e);
      setSuggestions([]);
    }
    setLoading(false);
  };

  const loadPriorities = async () => {
    setLoading(true);
    try {
      const all = await fetchAllReminders();
      const pending = all
        .filter(r => !r.isDeleted && !r.isCompleted)
        .slice(0, 10);

      const withPriority = await Promise.all(
        pending.map(async r => ({
          ...r,
          priority: await AIService.getPriority(r.title, r.dateTime),
        })),
      );

      withPriority.sort((a, b) => {
        const order = {HIGH: 0, MEDIUM: 1, LOW: 2};
        return order[a.priority] - order[b.priority];
      });

      setPriorities(withPriority);
    } catch (e) {
      console.error('Priorities error:', e);
      setPriorities([]);
    }
    setLoading(false);
  };

  const handleTabChange = tab => {
    // Stop speaking when switching tabs
    Tts.stop();
    setIsSpeaking(false);
    setActiveTab(tab);
    if (tab === 'suggestions' && suggestions.length === 0) loadSuggestions();
    if (tab === 'priorities' && priorities.length === 0) loadPriorities();
    if (tab === 'briefing' && !briefing) loadBriefing();
  };

  const formatDateTime = dateTime => {
    if (!dateTime) return 'No date';
    const date = new Date(dateTime);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderBriefing = () => (
    <View style={styles.tabContent}>
      <View style={styles.briefingHeader}>
        <Text style={styles.tabSectionTitle}>🌅 Your Daily Briefing</Text>
        <TouchableOpacity onPress={toggleAutoSpeak} style={styles.speakerBtn}>
          <Text style={styles.speakerIcon}>{autoSpeak ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{marginTop: 30}} />
      ) : (
        <>
          <View style={styles.briefingCard}>
            <Text style={styles.briefingText}>{briefing}</Text>
          </View>
          <View style={styles.briefingActions}>
            {briefing && (
              <TouchableOpacity 
                style={styles.speakBtn} 
                onPress={() => {
                  if (isSpeaking) {
                    Tts.stop();
                  } else {
                    speakText(briefing);
                  }
                }}>
                <Text style={styles.speakBtnText}>
                  {isSpeaking ? '⏹ Stop' : '🔊 Read'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.refreshBtn} onPress={loadBriefing}>
              <Text style={styles.refreshBtnText}>🔄 Refresh Briefing</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  const renderSuggestions = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabSectionTitle}>💡 Smart Suggestions</Text>
      <Text style={styles.tabSubtitle}>Based on your reminder patterns</Text>
      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{marginTop: 30}} />
      ) : suggestions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🤔</Text>
          <Text style={styles.emptyText}>No suggestions yet</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadSuggestions}>
            <Text style={styles.refreshBtnText}>Generate Suggestions</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {suggestions.map((s, i) => (
            <View key={i} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionTitle}>💡 {s.title}</Text>
              </View>
              <Text style={styles.suggestionReason}>{s.reason}</Text>
              <Text style={styles.suggestionTime}>
                🕐 {s.suggestedDate} at {s.suggestedTime}
              </Text>
              <TouchableOpacity
                style={styles.addSuggestionBtn}
                onPress={() => {
                  onAddSuggestion(s);
                  onClose();
                }}>
                <Text style={styles.addSuggestionBtnText}>+ Add This Reminder</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.refreshBtn} onPress={loadSuggestions}>
            <Text style={styles.refreshBtnText}>🔄 Get New Suggestions</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const renderPriorities = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabSectionTitle}>📊 Priority Analysis</Text>
      <Text style={styles.tabSubtitle}>AI-ranked by importance</Text>
      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{marginTop: 30}} />
      ) : priorities.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyText}>No pending reminders to analyze</Text>
        </View>
      ) : (
        <>
          {priorities.map(r => (
            <View key={r.id} style={styles.priorityCard}>
              <View
                style={[
                  styles.priorityBar,
                  {backgroundColor: PRIORITY_COLORS[r.priority]},
                ]}
              />
              <View style={styles.priorityContent}>
                <View style={styles.priorityHeader}>
                  <Text style={styles.priorityTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <View
                    style={[
                      styles.priorityBadge,
                      {backgroundColor: PRIORITY_COLORS[r.priority] + '20'},
                    ]}>
                    <Text
                      style={[
                        styles.priorityBadgeText,
                        {color: PRIORITY_COLORS[r.priority]},
                      ]}>
                      {PRIORITY_ICONS[r.priority]} {r.priority}
                    </Text>
                  </View>
                </View>
                <Text style={styles.priorityTime}>
                  🕐 {formatDateTime(r.dateTime)}
                </Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.refreshBtn} onPress={loadPriorities}>
            <Text style={styles.refreshBtnText}>🔄 Re-analyze</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>🤖 AI Assistant</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {[
              {key: 'briefing', label: '🌅 Briefing'},
              {key: 'suggestions', label: '💡 Suggest'},
              {key: 'priorities', label: '📊 Priority'},
            ].map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => handleTabChange(tab.key)}>
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.key && styles.tabTextActive,
                  ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {activeTab === 'briefing' && renderBriefing()}
            {activeTab === 'suggestions' && renderSuggestions()}
            {activeTab === 'priorities' && renderPriorities()}
            <View style={{height: 20}} />
          </ScrollView>
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
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {fontSize: 18, fontWeight: 'bold', color: Colors.text},
  closeBtn: {fontSize: 18, color: Colors.textLight},
  tabs: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {backgroundColor: Colors.primary},
  tabText: {fontSize: 12, color: Colors.textLight, fontWeight: '500'},
  tabTextActive: {color: Colors.white, fontWeight: '600'},
  tabContent: {paddingHorizontal: 16},
  tabSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  tabSubtitle: {fontSize: 12, color: Colors.textLight, marginBottom: 16},
  briefingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  speakerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerIcon: {
    fontSize: 18,
  },
  briefingCard: {
    backgroundColor: Colors.primary + '10',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    marginTop: 12,
    marginBottom: 12,
  },
  briefingText: {fontSize: 15, color: Colors.text, lineHeight: 24},
  briefingActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  speakBtn: {
    backgroundColor: Colors.primary + '10',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  speakBtnText: {color: Colors.primary, fontWeight: '600', fontSize: 13},
  refreshBtn: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  refreshBtnText: {color: Colors.primary, fontWeight: '600'},
  emptyState: {alignItems: 'center', paddingVertical: 30},
  emptyEmoji: {fontSize: 40, marginBottom: 8},
  emptyText: {fontSize: 14, color: Colors.textLight, marginBottom: 16},
  suggestionCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  suggestionHeader: {marginBottom: 6},
  suggestionTitle: {fontSize: 15, fontWeight: '600', color: Colors.text},
  suggestionReason: {fontSize: 12, color: Colors.textLight, marginBottom: 4},
  suggestionTime: {fontSize: 12, color: Colors.primary, marginBottom: 10},
  addSuggestionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addSuggestionBtnText: {color: Colors.white, fontWeight: '600', fontSize: 13},
  priorityCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    elevation: 2,
  },
  priorityBar: {width: 5},
  priorityContent: {flex: 1, padding: 12},
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priorityTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priorityBadgeText: {fontSize: 11, fontWeight: '700'},
  priorityTime: {fontSize: 12, color: Colors.textLight},
});

export default AIFeaturesModal;