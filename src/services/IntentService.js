import Config from '../constants/Config';
import Storage from '../utils/Storage';

const IntentService = {

  // Determine intent from transcribed text
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

Return ONLY JSON. No explanation. No markdown. No backticks.`;

    const response = await fetch(Config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: Config.GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const content = data.choices[0].message.content.trim();
    const cleaned = content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    return JSON.parse(cleaned);
  },

  // Query reminders based on intent filters
  queryReminders: async (intent) => {
    const REMINDERS_KEY = 'reminders';
    const all = await Storage.get(REMINDERS_KEY) || [];
    const active = all.filter(r => !r.isDeleted);
    const now = new Date();

    let results = [];

    switch (intent.query_type) {
      case 'all':
        results = active;
        break;

      case 'upcoming':
        results = active.filter(
          r => !r.isCompleted && new Date(r.dateTime) > now,
        ).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
        break;

      case 'completed':
        results = active.filter(r => r.isCompleted);
        break;

      case 'by_location':
        if (intent.location) {
          results = active.filter(
            r =>
              r.location &&
              r.location.toLowerCase().includes(intent.location.toLowerCase()),
          );
        }
        break;

      case 'by_date':
        if (intent.date) {
          results = active.filter(r => {
            const reminderDate = new Date(r.dateTime)
              .toISOString()
              .split('T')[0];
            return reminderDate === intent.date;
          });
        }
        break;

      case 'by_time':
        if (intent.time) {
          const [filterHour] = intent.time.split(':').map(Number);
          results = active.filter(r => {
            const reminderHour = new Date(r.dateTime).getHours();
            // Match within 3 hour window
            return Math.abs(reminderHour - filterHour) <= 3;
          });
        }
        break;

      default:
        results = active.filter(
          r => !r.isCompleted && new Date(r.dateTime) > now,
        );
    }

    return results;
  },

  // Generate AI summary of query results
  generateSummary: async (results, summaryRequest) => {
    if (results.length === 0) {
      return `No reminders found for "${summaryRequest}".`;
    }

    const remindersList = results.slice(0, 10).map(r => ({
      message: r.title,
      location: r.location || 'No location',
      dateTime: new Date(r.dateTime).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
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
        model: Config.GROQ_MODEL,
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