import Config from '../constants/Config';
import Storage from '../utils/Storage';
import { filterReminders } from '../services/ApiService';

const IntentService = {

  getIntent: async (text, chatHistory = []) => {
    try {
      const { getIntent } = require('./ApiService');
      return await getIntent(text, chatHistory);
    } catch (e) {
      console.error('getIntent error:', e);
      return { intent: "conversational", response: "Sorry, I couldn't process your request." };
    }
  },

  // ── Now calls backend API instead of local storage ──
  queryReminders: async (intent) => {
    const userData = await Storage.get('user');
    const userId = userData?.id;
    if (!userId) return [];

    try {
      const { getAllReminders } = require('./ApiService');
      const apiData = await getAllReminders(userId);
      
      // Combine all active to fix the 4 daily reminders issue
      const allActive = [
         ...(apiData.reminders.today || []),
         ...(apiData.reminders.upcoming || []),
         ...(apiData.reminders.past || []),
         ...(apiData.reminders.closed || []),
      ];

      let filtered = allActive;

      // Use additive filtering instead of a switch to handle queries like "completed today"
      if (intent.query_type === 'upcoming') {
        filtered = filtered.filter(r => !r.closed && !r.deleted);
      }
      if (intent.query_type === 'completed') {
        filtered = filtered.filter(r => r.closed === true || r.closed === 1);
      }
      if (intent.date) {
        filtered = filtered.filter(r => r.reminder_date === intent.date);
      }
      if (intent.location) {
        filtered = filtered.filter(r => r.location && r.location.toLowerCase().includes(intent.location.toLowerCase()));
      }
      if (intent.time) {
        filtered = filtered.filter(r => r.reminder_time === intent.time);
      }

      // Map API fields to shape generateSummary expects
      return filtered.map(r => ({
        id: r.id,
        title: r.message || '',
        location: r.location || '',
        dateTime: r.reminder_date && r.reminder_time
          ? `${r.reminder_date}T${r.reminder_time}`
          : null,
        isCompleted: r.closed || false,
        isDeleted: r.deleted || false,
        type: r.reminder_type || 'ONCE',
      }));

    } catch (err) {
      console.error('queryReminders error:', err);
      return [];
    }
  },

  // generateSummary unchanged — works with mapped data
  generateSummary: async (results, summaryRequest, countOnly = false) => {
    // ── Count-only mode: just tell the user how many ──────
    if (countOnly) {
      const n = results.length;
      if (n === 0) return `You have no reminders for that query.`;
      if (n === 1) return `You have **1 reminder**. Say "show me" to see it.`;
      return `You have **${n} reminder${n > 1 ? 's' : ''}**. Say "show me" or "display those" to see the list.`;
    }

    if (results.length === 0) {
      return `No reminders found. You're all clear! 🎉`;
    }

    const EXACT_COUNT = results.length; // The one true count — from the database

    const remindersList = results.slice(0, 10).map(r => ({
      message: r.title,
      location: r.location || 'No location',
      dateTime: r.dateTime
        ? new Date(r.dateTime).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : 'No date',
      status: r.isCompleted ? 'completed' : 'pending',
    }));

    const prompt = `You are a helpful reminder assistant.
User asked: "${summaryRequest}"

⚠️ REAL DATA from database — EXACT count is ${EXACT_COUNT}. DO NOT change this number under any circumstances.
Reminders (${EXACT_COUNT} total):
${JSON.stringify(remindersList, null, 2)}

Rules:
1. The count is EXACTLY ${EXACT_COUNT}. Never say a different number.
2. Answer the user's question naturally in 1–2 friendly sentences.
3. Do NOT repeat all the dates/times/locations — those appear in cards below your message.
4. If Tamil/Thanglish was used in the request, respond in simple English.`;

    try {
      const { askAI } = require('./ApiService');
      const data = await askAI(prompt);
      return data.response;
    } catch (e) {
      return `Found ${EXACT_COUNT} reminder${EXACT_COUNT !== 1 ? 's' : ''} matching your request.`;
    }
  },
};

export default IntentService;