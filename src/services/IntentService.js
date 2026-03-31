import Config from '../constants/Config';
import Storage from '../utils/Storage';
import { filterReminders } from '../services/ApiService';

const IntentService = {

  getIntent: async (text, chatHistory = []) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const timeStr = today.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const systemPrompt = `You are a smart reminder assistant. Analyze the user's voice command/message and determine their intent.

Current date: ${todayStr}
Current time: ${timeStr}

The text may be in English, Tamil, or Thanglish.

Determine the intent and return ONLY a JSON object. If the user is just chatting or asking a follow-up question that isn't a direct command, use the "conversational" intent and provide your text response.

If user wants to ADD a reminder:
{"intent":"add_reminder","message":"full reminder text","location":null_or_location,"date":"YYYY-MM-DD","time":"HH:MM"}

If user wants to QUERY reminders:
{"intent":"query_reminders","query_type":"all|upcoming|completed|by_location|by_date|by_time","location":null_or_location,"date":null_or_"YYYY-MM-DD","time":null_or_"HH:MM","summary_request":"what the user asked in simple english"}

If user wants to UPDATE a reminder:
{"intent":"update_reminder","reminder_id":"exact ID if known from chat history, else null","reminder_hint":"keyword identifying the reminder if ID is null","updates":{"message":"new message or null","date":"YYYY-MM-DD or null","time":"HH:MM or null","location":"new location or null","type":"ONCE or DAILY or null"}}
Only include non-null fields in updates.

If user wants to DELETE a reminder:
{"intent":"delete_reminder","reminder_id":"exact ID if known from chat history, else null","reminder_hint":"keyword identifying the reminder if ID is null"}

If the user is just talking, asking general questions, or following up on previous reminders without a specific CRUD action:
{"intent":"conversational","response":"your helpful conversational reply based on the chat history (in simple English)"}

Intent detection rules:
- "change", "update", "modify", "reschedule", "move to", "push to" → update_reminder
- "delete", "remove", "cancel", "get rid of" → delete_reminder
- "add", "remind me", "create", "set a reminder" → add_reminder
- "show", "list", "what", "how many", "any" → query_reminders
- Greetings, thanks, or general queries → conversational

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
- "maathu" or "change pannu" = update
- "delete pannu" or "neekkunga" = delete

Return ONLY JSON. No explanation. No markdown. No backticks.
CRITICAL: Output ONLY the JSON object. Start with { end with }. Zero other text.`;

    // Map chat history to Groq format with detailed Reminder context (Memory Chain Link)
    const historyMessages = chatHistory.slice(-20).map(msg => {
      let content = msg.content;
      // If AI showed reminders, inject their Exact IDs and data into the memory!
      if (msg.type === 'assistant' && msg.reminders && msg.reminders.length > 0) {
        const reminderContext = msg.reminders.map((r, i) => `${i+1}. [ID: ${r.id}] "${r.title}" at ${r.dateTime || 'No Time'} (Location: ${r.location || 'None'})`).join('\n');
        content += `\n\n[SYSTEM CONTEXT - You showed the user these reminders previously. Use exact ID if user refers to them:]\n${reminderContext}`;
      }
      return {
        role: msg.type === 'user' ? 'user' : 'assistant',
        content,
      };
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: `[Latest message] ${text}\n\nREMEMBER: Return ONLY a valid JSON object. No other text.` }
    ];

    const response = await fetch(Config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: Config.GROQ_MODEL_JSON,
        messages: messages,
        temperature: 0.1,
        max_tokens: 350,
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

      switch (intent.query_type) {
        case 'all':
          break; // leave allActive

        case 'upcoming':
          filtered = allActive.filter(r => !r.closed && !r.deleted);
          break;

        case 'completed':
          filtered = allActive.filter(r => r.closed);
          break;

        case 'by_location':
          if (intent.location) {
            filtered = allActive.filter(r => r.location && r.location.toLowerCase().includes(intent.location.toLowerCase()));
          }
          break;

        case 'by_date':
          if (intent.date) {
            filtered = allActive.filter(r => r.reminder_date === intent.date);
          }
          break;

        case 'by_time':
          if (intent.time) {
            filtered = allActive.filter(r => r.reminder_time === intent.time);
          }
          break;

        default:
          filtered = allActive.filter(r => !r.closed && !r.deleted);
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

Give a brief 1-sentence introduction to the list (e.g. "Here are your pending tasks.").
DO NOT list the individual reminder details in text form, as they will be displayed as visual UI cards below your message.
Be extremely concise.
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