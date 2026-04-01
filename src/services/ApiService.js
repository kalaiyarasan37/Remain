// ─────────────────────────────────────────────
// ApiService.js — Central API layer
// Replace BASE_URL with your actual PC IP + port
// ─────────────────────────────────────────────

import Storage from '../utils/Storage';

const BASE_URL = 'http://192.168.1.39:5000/api'; // ← change port to yours

// ── Internal helpers ──────────────────────────

const getToken = async () => {
  const user = await Storage.get('user');
  return user?.token || null;
};

const authHeaders = async () => {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const post = async (url, body, withAuth = false) => {
  const headers = withAuth
    ? await authHeaders()
    : { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const get = async (url) => {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'GET',
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const put = async (url, body) => {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const del = async (url) => {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

// ═════════════════════════════════════════════
// AUTH APIs
// ═════════════════════════════════════════════

export const sendOtp = async (name, mobile) => {
  const body = name ? { name, mobile } : { mobile };
  const res = await post('/auth/send-otp', body);
  
  // Show local notification with OTP if backend provides it in the response
  if (res && res.otp_debug) {
    const NotificationService = require('./NotificationService').default;
    await NotificationService.showOtpNotification(res.otp_debug);
  }
  
  return res;
};

export const verifyOtp = async (mobile, otp) => {
  // POST /api/auth/verify-otp
  // Returns { message, token, user }
  return await post('/auth/verify-otp', { mobile, otp });
};

export const verifyToken = async () => {
  // GET /api/auth/verify-token
  // Used by SplashScreen to validate saved token
  return await get('/auth/verify-token');
};

export const updateProfile = async (payload) => {
  // PUT /api/auth/profile
  // payload: { name, mobile }
  return await put('/auth/profile', payload);
};

// ═════════════════════════════════════════════
// REMINDER APIs
// ═════════════════════════════════════════════

export const createReminder = async (payload) => {
  // POST /api/reminder/create
  // payload: { user_id, message, date, type, time?, location? }
  return await post('/reminder/create', payload, true);
};

export const getReminder = async (reminderId) => {
  // GET /api/reminder/:id
  return await get(`/reminder/${reminderId}`);
};

export const getAllReminders = async (userId) => {
  // GET /api/reminder/all/:userId
  return await get(`/reminder/all/${userId}`);
};

export const updateReminder = async (reminderId, payload) => {
  // PUT /api/reminder/:id
  // payload: { message, date, time?, location?, type }
  return await put(`/reminder/${reminderId}`, payload);
};

export const deleteReminder = async (reminderId) => {
  // DELETE /api/reminder/:id  (soft delete)
  return await del(`/reminder/${reminderId}`);
};

export const filterReminders = async (userId, filters = {}) => {
  // POST /api/reminder/list/:userId
  // filters examples:
  //   {}                          → all active
  //   { filter: 'upcoming' }
  //   { filter: 'today' }
  //   { filter: 'deleted' }
  //   { filter: 'closed' }
  //   { type: 'DAILY' }
  //   { location: 'Home' }
  //   { message: 'doctor' }
  //   { filter:'upcoming', type:'DAILY', location:'Home' }
  return await post(`/reminder/list/${userId}`, filters, true);
};

export const checkConflict = async (payload) => {
  // POST /api/reminder/check-conflict
  return await post('/reminder/check-conflict', payload, true);
};

export const findSimilar = async (payload) => {
  // POST /api/reminder/find-similar
  // payload: { user_id, message }
  return await post('/reminder/find-similar', payload, true);
};

export const getDigest = async (userId, type = 'weekly') => {
  return await get(`/reminder/digest/${userId}?type=${type}`);
};

// ═════════════════════════════════════════════
// AI APIs (Replacing direct Groq calls)
// ═════════════════════════════════════════════

export const transcribeAudio = async (audioBase64) => {
  return await post('/reminder/transcribe', { audioBase64 }, true);
};

export const parseWithAI = async (text) => {
  return await post('/reminder/parse', { text }, true);
};

export const getIntent = async (text, chatHistory) => {
  return await post('/reminder/intent', { text, chatHistory }, true);
};

export const askAI = async (prompt) => {
  return await post('/reminder/ask', { prompt, asJson: false }, true);
};

export const askJSON = async (prompt) => {
  return await post('/reminder/ask', { prompt, asJson: true }, true);
};

export const getSuggestedTime = async (userId) => {
  return await get(`/reminder/suggested-time/${userId}`);
};

// ═════════════════════════════════════════════
// NOTIFICATION APIs
// ═════════════════════════════════════════════

export const getAllNotifications = async (userId) => {
  // GET /api/notification/:userId
  return await get(`/notification/${userId}`);
};

export const getPendingNotifications = async (userId) => {
  // GET /api/notification/:userId?is_notified=false
  return await get(`/notification/${userId}?is_notified=false`);
};

export const getSentNotifications = async (userId) => {
  // GET /api/notification/:userId?is_notified=true
  return await get(`/notification/${userId}?is_notified=true`);
};

export const getNotificationsByDate = async (userId, date) => {
  // GET /api/notification/:userId?date=2025-12-31
  return await get(`/notification/${userId}?date=${date}`);
};

export const getPendingNotificationsByDate = async (userId, date) => {
  // GET /api/notification/:userId?is_notified=false&date=2025-12-31
  return await get(`/notification/${userId}?is_notified=false&date=${date}`);
};

export const checkMobile = async (mobile) => {
  // GET /api/auth/check-mobile/:mobile
  const res = await fetch(`${BASE_URL}/auth/check-mobile/${mobile}`);
  const data = await res.json();
  return data; // { exists: true/false }
};
