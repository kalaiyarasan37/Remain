import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import Colors from '../constants/Colors';
import Storage from '../utils/Storage';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import Sound from 'react-native-sound';

Sound.setCategory('Playback');

const DEFAULT_SOUNDS = [
  { id: 'alarm.ogg', label: 'Default Alarm', type: 'bundled' },
  { id: 'chime.ogg', label: 'Space Chime', type: 'bundled' },
  { id: 'beep.ogg', label: 'Short Beep', type: 'bundled' },
];

const ProfileScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [aiConfirmSetting, setAiConfirmSetting] = useState('ask_every_time');
  const [alarmSound, setAlarmSound] = useState('alarm.ogg');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewSound = useRef(null);

  useEffect(() => {
    loadUser();
    return () => {
      if (previewSound.current) {
        previewSound.current.stop();
        previewSound.current.release();
      }
    };
  }, []);

  const loadUser = async () => {
    const userData = await Storage.get('user');
    setUser(userData);
    setName(userData?.name || '');
    // Load AI confirmation preference
    const aiSetting = await Storage.get('ai_confirm_setting');
    setAiConfirmSetting(aiSetting || 'ask_every_time');
    
    // Load Alarm Sound preference
    const savedSound = await Storage.get('alarm_sound');
    if (savedSound) {
      setAlarmSound(savedSound);
    }
  };

  const handleSelectSound = async (soundId, type) => {
    setAlarmSound(soundId);
    await Storage.set('alarm_sound', soundId);
    playPreview(soundId, type);
  };

  const playPreview = (soundId, type) => {
    if (previewSound.current) {
      previewSound.current.stop();
      previewSound.current.release();
      previewSound.current = null;
      setIsPlayingPreview(false);
    }
    
    // Bundled sounds use MAIN_BUNDLE base path, custom files use absolute path (base path = '')
    const basePath = type === 'bundled' ? Sound.MAIN_BUNDLE : '';
    
    previewSound.current = new Sound(soundId, basePath, (error) => {
      if (error) {
        console.log('failed to load preview', error);
        Alert.alert('Playback Error', 'Could not play the selected audio file.');
        return;
      }
      setIsPlayingPreview(true);
      previewSound.current.play((success) => {
        setIsPlayingPreview(false);
      });
    });
  };

  const handleCustomUpload = async () => {
    try {
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.audio],
      });
      
      const fileName = `custom_alarm_${Date.now()}_${res.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
      const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
      
      await RNFS.copyFile(res.uri, destPath);
      handleSelectSound(destPath, 'custom');
      
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // user cancelled
      } else {
        console.error('File pick error:', err);
        Alert.alert('Upload Failed', 'There was an issue selecting the audio file.');
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Invalid Name', 'Please enter a valid name.');
      return;
    }
    const updated = { ...user, name: name.trim() };
    
    try {
      const { updateProfile } = require('../services/ApiService');
      await updateProfile({ name: updated.name, mobile: updated.phone });
      
      await Storage.set('user', updated);
      setUser(updated);
      setIsEditing(false);
      Alert.alert('Saved', 'Your name has been updated successfully!');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to update name on server. Please try again.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await Storage.remove('user');
          navigation.replace('Login');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
          <Text style={styles.avatarName}>{user?.name || 'User'}</Text>
          <Text style={styles.avatarPhone}>
            {user?.countryCode} {user?.phone}
          </Text>
        </View>

        {/* Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>

          {/* Name Field */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldInfo}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  placeholderTextColor={Colors.textLight}
                />
              ) : (
                <Text style={styles.fieldValue}>{user?.name || '-'}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                if (isEditing) {
                  handleSave();
                } else {
                  setIsEditing(true);
                }
              }}>
              <Text style={styles.editBtnText}>
                {isEditing ? '💾 Save' : '✏️ Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Phone Field */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldInfo}>
              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <Text style={styles.fieldValue}>
                {user?.countryCode} {user?.phone}
              </Text>
            </View>
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedText}>🔒 Fixed</Text>
            </View>
          </View>
        </View>

        {/* AI Settings Card */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>AI Assistant Settings</Text>

          <Text style={styles.aiSettingLabel}>
            🤖 When AI updates or deletes a reminder:
          </Text>

          <TouchableOpacity
            style={[
              styles.aiOption,
              aiConfirmSetting === 'ask_every_time' && styles.aiOptionActive,
            ]}
            onPress={async () => {
              setAiConfirmSetting('ask_every_time');
              await Storage.set('ai_confirm_setting', 'ask_every_time');
            }}
          >
            <View style={styles.aiOptionRadio}>
              {aiConfirmSetting === 'ask_every_time' && (
                <View style={styles.aiOptionRadioFill} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.aiOptionTitle,
                aiConfirmSetting === 'ask_every_time' && styles.aiOptionTitleActive,
              ]}>🔐 Ask every time</Text>
              <Text style={styles.aiOptionDesc}>
                AI will ask for confirmation before modifying reminders
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.aiOption,
              aiConfirmSetting === 'no_confirm' && styles.aiOptionActive,
            ]}
            onPress={async () => {
              setAiConfirmSetting('no_confirm');
              await Storage.set('ai_confirm_setting', 'no_confirm');
            }}
          >
            <View style={styles.aiOptionRadio}>
              {aiConfirmSetting === 'no_confirm' && (
                <View style={styles.aiOptionRadioFill} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.aiOptionTitle,
                aiConfirmSetting === 'no_confirm' && styles.aiOptionTitleActive,
              ]}>⚡ Execute without asking</Text>
              <Text style={styles.aiOptionDesc}>
                AI will update/delete reminders immediately without confirmation
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Alarm Settings Card */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>Alarm Sound Options</Text>

          <Text style={styles.aiSettingLabel}>
            🎵 Select the sound to play for notifications:
          </Text>

          {DEFAULT_SOUNDS.map((sound) => (
             <TouchableOpacity
               key={sound.id}
               style={[
                 styles.aiOption,
                 alarmSound === sound.id && styles.aiOptionActive,
               ]}
               onPress={() => handleSelectSound(sound.id, sound.type)}
             >
               <View style={styles.aiOptionRadio}>
                 {alarmSound === sound.id && (
                   <View style={styles.aiOptionRadioFill} />
                 )}
               </View>
               <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                 <Text style={[
                   styles.aiOptionTitle,
                   { marginBottom: 0 },
                   alarmSound === sound.id && styles.aiOptionTitleActive,
                 ]}>{sound.label}</Text>
                 {(alarmSound === sound.id && isPlayingPreview) && (
                   <Text style={{ fontSize: 10, color: Colors.primary }}>🔊 Playing...</Text>
                 )}
               </View>
             </TouchableOpacity>
          ))}
          
          <View
            style={[
              styles.aiOption,
              alarmSound.includes(RNFS.DocumentDirectoryPath) && styles.aiOptionActive,
              { flexDirection: 'column', alignItems: 'stretch' }
            ]}
          >
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              onPress={() => {
                if (alarmSound.includes(RNFS.DocumentDirectoryPath)) {
                   handleSelectSound(alarmSound, 'custom');
                } else {
                   handleCustomUpload();
                }
              }}
            >
              <View style={styles.aiOptionRadio}>
                {alarmSound.includes(RNFS.DocumentDirectoryPath) && (
                  <View style={styles.aiOptionRadioFill} />
                )}
              </View>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[
                    styles.aiOptionTitle,
                    { marginBottom: 0 },
                    alarmSound.includes(RNFS.DocumentDirectoryPath) && styles.aiOptionTitleActive,
                  ]}>📁 Custom Sound</Text>
                  {alarmSound.includes(RNFS.DocumentDirectoryPath) && (
                    <Text style={styles.aiOptionDesc} numberOfLines={1}>
                      {alarmSound.split('/').pop()}
                    </Text>
                  )}
                </View>
                {(alarmSound.includes(RNFS.DocumentDirectoryPath) && isPlayingPreview) && (
                  <Text style={{ fontSize: 10, color: Colors.primary }}>🔊 Playing...</Text>
                )}
              </View>
            </TouchableOpacity>
            
            {alarmSound.includes(RNFS.DocumentDirectoryPath) && (
              <TouchableOpacity 
                style={{ marginTop: 10, marginLeft: 34, alignSelf: 'flex-start' }} 
                onPress={handleCustomUpload}>
                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>📤 Upload Different File</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.white,
  },
  avatarName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  avatarPhone: {
    fontSize: 14,
    color: Colors.textLight,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 20,
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  fieldInfo: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  fieldInput: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  editBtn: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  editBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  lockedBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  lockedText: {
    color: Colors.textLight,
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  logoutBtn: {
    backgroundColor: Colors.error,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  aiSettingLabel: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 12,
    lineHeight: 20,
  },
  aiOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 12,
  },
  aiOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  aiOptionRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiOptionRadioFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  aiOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  aiOptionTitleActive: {
    color: Colors.primary,
  },
  aiOptionDesc: {
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 16,
  },
});

export default ProfileScreen;