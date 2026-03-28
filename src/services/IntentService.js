import Config from '../constants/Config';
import Storage from '../utils/Storage';
import { filterReminders } from '../services/ApiService';

const IntentService = {

  getIntent: async (text) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const timeStr = today.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const prompt = `You are a smart reminder assistant. Analyze the user's voice command and determine their intent.

Current date: ${todayStr}
Current time: ${timeStr}

User said: "${text}"

The text may be in English, Tamil, or Thanglish.

Determine the intent and return ONLY a JSON object.

If user wants to ADD a reminder:
{"intent":"add_reminder","message":"full reminder text","location":null_or_location,"date":"YYYY-MM-DD","time":"HH:MM"}

If user wants to QUERY reminders:
{"intent":"query_reminders","query_type":"all|upcoming|completed|by_location|by_date|by_time","location":null_or_location,"date":null_or_"YYYY-MM-DD","time":null_or_"HH:MM","summary_request":"what the user asked in simple english"}

Query type rules:
- "show all reminders" or "show my reminders" → query_type: "all"
- "upcoming reminders" or "what's next" → query_type: "upcoming"
- "completed reminders" or "done reminders" → query_type: "completed"
- "reminders at [place]" or "reminders in [place]" → query_type: "by_location"
- "tomorrow's reminders" or "today's reminders" → query_type: "by_date"
- "evening reminders" or "morning reminders" → query_type: "by_time"

Date rules:
- "tomorrow" = ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "today" = ${todayStr}
- "next week" = ${new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]}

Time rules:
- "morning" = 06:00 to 12:00
- "afternoon" = 12:00 to 17:00
- "evening" = 17:00 to 21:00
- "night" = 21:00 to 23:59

Tamil/Thanglish hints:
- "naalai" = tomorrow
- "indru" = today
- "kaalai" = morning
- "maalai" = evening
- "iravu" = night
- "show pannunga" or "kaatu" = show/query

Return ONLY JSON. No explanation. No markdown. No backticks.
CRITICAL: Output ONLY the JSON object. Start with { end with }. Zero other text.`;

    const response = await fetch(Config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: Config.GROQ_MODEL_JSON,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const content = data.choices[0].message.content.trim();
    console.log('Intent raw response:', content);
    const cleaned = content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    return JSON.parse(jsonMatch[0]);
  },

  // ── Now calls backend API instead of local storage ──
  queryReminders: async (intent) => {
    const userData = await Storage.get('user');
    const userId = userData?.id;
    if (!userId) return [];

    try {
      let filters = {};

      switch (intent.query_type) {
        case 'all':
          filters = {};
          break;

        case 'upcoming':
          filters = { filter: 'upcoming' };
          break;

        case 'completed':
          filters = { filter: 'closed' };
          break;

        case 'by_location':
          if (intent.location) {
            filters = { location: intent.location };
          }
          break;

        case 'by_date':
          if (intent.date) {
            filters = { date_from: intent.date, date_to: intent.date };
          }
          break;

        case 'by_time':
          if (intent.time) {
            filters = { time: intent.time };
          }
          break;

        default:
          filters = { filter: 'upcoming' };
      }

      const data = await filterReminders(userId, filters);

      // Map API fields to shape generateSummary expects
      return (data.reminders || []).map(r => ({
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
  generateSummary: async (results, summaryRequest) => {
    if (results.length === 0) {
      return `No reminders found for "${summaryRequest}".`;
    }

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

Found ${results.length} reminder(s):
${JSON.stringify(remindersList, null, 2)}

Give a brief, natural, conversational summary in 2-3 sentences.
Mention key details like count, locations, times.
Be concise and helpful.
If Tamil/Thanglish was used in the request, respond in simple English.`;

    const response = await fetch(Config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: Config.GROQ_MODEL_JSON,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    const data = await response.json();
    if (data.error || !data.choices) {
      return `Found ${results.length} reminder(s) matching your request.`;
    }

    return data.choices[0].message.content.trim();
  },
};

export default IntentService;