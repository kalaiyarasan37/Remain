import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import Colors from '../constants/Colors';
import { getDigest } from '../services/ApiService';
import Storage from '../utils/Storage';
import Tts from 'react-native-tts';

const AIDigestModal = ({ visible, onClose, type = 'daily', onNavigate }) => {
   const [loading, setLoading] = useState(true);
   const [digestData, setDigestData] = useState(null);
   const [autoSpeak, setAutoSpeak] = useState(true);
   const [isSpeaking, setIsSpeaking] = useState(false);
   const hasSpoken = useRef(false);

   // Load TTS preference
   useEffect(() => {
      const loadPref = async () => {
         const pref = await Storage.get('digestAutoSpeak');
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
         fetchDigest();
      } else {
         setDigestData(null);
         Tts.stop();
         setIsSpeaking(false);
      }
   }, [visible, type]);

   // Auto-speak when digest loads
   useEffect(() => {
      if (digestData?.digest && autoSpeak && !hasSpoken.current && !loading) {
         hasSpoken.current = true;
         speakDigest(digestData.digest);
      }
   }, [digestData, loading, autoSpeak]);

   const speakDigest = (text) => {
      if (!text) return;
      Tts.stop();
      // Clean text for TTS - remove emojis for cleaner speech
      const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[✅✓📊📋💪☀️📌📅💡🌅🎉✨]/gu, '').trim();
      Tts.speak(cleanText);
   };

   const toggleAutoSpeak = async () => {
      const newVal = !autoSpeak;
      setAutoSpeak(newVal);
      await Storage.set('digestAutoSpeak', newVal);
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

   const fetchDigest = async () => {
      setLoading(true);
      try {
         const user = await Storage.get('user');
         if (user?.id) {
            const data = await getDigest(user.id, type);
            setDigestData(data);
         }
      } catch (e) {
         console.log('Failed to fetch digest:', e);
         setDigestData({ digest: `Unable to load your AI Digest right now. Error: ${e.message}`, stats: null });
      } finally {
         setLoading(false);
      }
   };

   return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
         <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <View style={styles.header}>
                  <View style={styles.headerLeft}>
                     <Text style={styles.headerTitle}>✨ {type === 'weekly' ? 'Weekly' : 'Daily'} AI Digest</Text>
                  </View>
                  <View style={styles.headerRight}>
                     <TouchableOpacity onPress={toggleAutoSpeak} style={styles.speakerBtn}>
                        <Text style={styles.speakerIcon}>{autoSpeak ? '🔊' : '🔇'}</Text>
                     </TouchableOpacity>
                     <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                     </TouchableOpacity>
                  </View>
               </View>

               {loading ? (
                  <View style={styles.loadingContainer}>
                     <ActivityIndicator size="large" color={Colors.primary} />
                     <Text style={styles.loadingText}>Generating your personalized summary...</Text>
                  </View>
               ) : (
                  <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                     
                     {digestData?.stats && (
                        <View style={styles.statsRow}>
                           <TouchableOpacity 
                              style={styles.statBox} 
                              onPress={() => onNavigate && onNavigate('completed')}
                              activeOpacity={0.7}
                           >
                              <Text style={styles.statValue}>{digestData.stats.completed}</Text>
                              <Text style={styles.statLabel}>Done</Text>
                           </TouchableOpacity>
                           <TouchableOpacity 
                              style={styles.statBox} 
                              onPress={() => onNavigate && onNavigate('upcoming')}
                              activeOpacity={0.7}
                           >
                              <Text style={styles.statValue}>{digestData.stats.upcoming}</Text>
                              <Text style={styles.statLabel}>Next</Text>
                           </TouchableOpacity>
                        </View>
                     )}

                     <View style={styles.card}>
                        <Text style={styles.digestText}>
                           {digestData?.digest}
                        </Text>
                     </View>

                     {/* Manual speak button */}
                     {digestData?.digest && (
                        <TouchableOpacity 
                           style={styles.speakActionBtn} 
                           onPress={() => {
                              if (isSpeaking) {
                                 Tts.stop();
                              } else {
                                 speakDigest(digestData.digest);
                              }
                           }}>
                           <Text style={styles.speakActionText}>
                              {isSpeaking ? '⏹ Stop Speaking' : '🔊 Read Aloud'}
                           </Text>
                        </TouchableOpacity>
                     )}

                  </ScrollView>
               )}
            </View>
         </View>
      </Modal>
   );
};

const styles = StyleSheet.create({
   modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
   },
   modalContent: {
      backgroundColor: Colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '80%',
      minHeight: '50%',
   },
   header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
   },
   headerLeft: {
      flex: 1,
   },
   headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
   },
   headerTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: Colors.primary,
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
   closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
   },
   closeBtnText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: Colors.textLight,
   },
   loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
   },
   loadingText: {
      marginTop: 16,
      color: Colors.textLight,
      fontSize: 14,
   },
   scrollContent: {
      flexGrow: 0,
   },
   statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 20,
      gap: 12,
   },
   statBox: {
      flex: 1,
      backgroundColor: Colors.white,
      padding: 16,
      borderRadius: 16,
      alignItems: 'center',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
   },
   statValue: {
      fontSize: 24,
      fontWeight: 'bold',
      color: Colors.primary,
      marginBottom: 4,
   },
   statLabel: {
      fontSize: 12,
      color: Colors.textLight,
      fontWeight: '600',
      textTransform: 'uppercase',
   },
   card: {
      backgroundColor: Colors.primary + '10',
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: Colors.primary + '30',
      marginBottom: 12,
   },
   digestText: {
      fontSize: 15,
      color: Colors.text,
      lineHeight: 24,
      fontWeight: '500',
   },
   speakActionBtn: {
      backgroundColor: Colors.white,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 20,
   },
   speakActionText: {
      color: Colors.primary,
      fontWeight: '600',
      fontSize: 14,
   },
});

export default AIDigestModal;
