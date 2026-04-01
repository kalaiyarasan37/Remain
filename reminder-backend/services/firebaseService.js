const admin = require('firebase-admin');

// IMPORTANT: Initialize with your service account credentials.
// You should download the JSON file from Firebase Console and place it in the backend folder,
// or provide the credentials via environment variables.

try {
  // Attempt to load local service account file if it exists
  // const serviceAccount = require('../config/google-services.json');
  // admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  
  // For now, we'll gracefully catch if it's not initialized
  console.log('Firebase Admin: Ready to be initialized. Please add google-services.json properly.');
} catch (e) {
  console.error('Firebase Admin init skipped:', e.message);
}

/**
 * Sends a silent data message to the device so Notifee can process it in the background
 * and launch the AlarmScreen.
 */
exports.sendAlarmNotification = async (fcmToken, reminderData) => {
  if (!admin.apps.length || !fcmToken) {
    console.warn('Cannot send FCM: Admin not initialized or missing token.');
    return;
  }

  const message = {
    token: fcmToken,
    // We only send 'data' so it's a silent push that wakes up the background handler in React Native.
    // If we included 'notification', the OS would show an immediate top banner, which limits our control.
    data: {
      action: 'TRIGGER_ALARM',
      reminderId: String(reminderData.id),
      title: String(reminderData.message),
      time: String(reminderData.reminder_time),
      location: String(reminderData.location || ''),
      // Any other metadata needed by Notifee AlarmScreen
    },
    android: {
      priority: 'high', // Required to wake up locked devices
    }
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('FCM Alarm sent successfully:', response);
    return response;
  } catch (error) {
    console.error('Error sending FCM Alarm:', error);
  }
};
