require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* -------------------- DATE HELPERS -------------------- */

const getTodayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
};

const getDayName = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAYS[new Date(y, m - 1, d).getDay()];
};

/* -------------------- SAFE JSON PARSER -------------------- */

const safeJSONParse = (text) => {
  if (!text) return null;

  // 1. Strip markdown code blocks
  let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 2. Extract only the valid JSON substring starting with { or [
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  const firstBracket = cleanText.indexOf('[');
  const lastBracket = cleanText.lastIndexOf(']');

  // Determine if it's an object or array
  let startIndex = firstBrace;
  let endIndex = lastBrace;
  
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
     startIndex = firstBracket;
     endIndex = lastBracket;
  }

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    cleanText = cleanText.substring(startIndex, endIndex + 1);
  }

  try {
    return JSON.parse(cleanText);
  } catch (e1) {
    try {
      const fixed = cleanText
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      return JSON.parse(fixed);
    } catch (e2) {
      console.error("JSON parse entirely failed on:", cleanText);
      return null;
    }
  }
};

/* -------------------- GROQ CALL (WITH FALLBACK + TIMEOUT) -------------------- */

const callGroq = async (prompt, maxTokens = 300, temperature = 0.3) => {
  const primaryModel  = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const fallbackModel = process.env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";

  const makeCall = async (model) => {
    if (!model) throw new Error("Model is undefined");

    return await Promise.race([
      groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "Return valid JSON or text only" },
          { role: "user", content: prompt }
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Groq timeout")), 8000)
      )
    ]);
  };

  try {
    const res = await makeCall(primaryModel);
    return res.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('Primary model failed:', err.message);

    try {
      const res = await makeCall(fallbackModel);
      return res.choices[0]?.message?.content?.trim() || '';
    } catch (fallbackErr) {
      console.error('Fallback model failed:', fallbackErr.message);
      return '';
    }
  }
};

/* -------------------- EXPORTS -------------------- */

exports.getDayName = getDayName;
exports.DAYS = DAYS;

/* -------------------- NOTIFICATION LABEL -------------------- */

exports.generateNotifyLabel = async (message, notifDate) => {
  try {
    const today = getTodayStr();
    const isToday = notifDate === today;
    const day = getDayName(notifDate);
    const prefix = isToday ? 'Today:' : day ? `${day}:` : '';

    const result = await callGroq(
      `Generate a SHORT notification title (max 8 words) for: "${message}"
${prefix ? `Start with "${prefix}"` : ''}
Return ONLY text.`,
      30, 0.3
    );

    return result || `${day || 'Upcoming'} Reminder`;
  } catch {
    return 'Reminder Alert';
  }
};

/* -------------------- FULL ANALYSIS -------------------- */

exports.analyseReminderFull = async (message, date, location) => {
  try {
    const day = date ? getDayName(date) : null;

    const raw = await callGroq(
      `Return ONLY valid JSON:
Reminder: "${message}"
Date: ${date || 'none'} (${day || ''})
Location: ${location || 'none'}

{
  "category": "Work|Personal|Health|Other",
  "priority": 1-10,
  "is_outdoor": true/false,
  "location_name": "string or null",
  "insight": "short tip",
  "ai_comment": "helpful comment"
}`,
      200, 0.3
    );

    const parsed = safeJSONParse(raw);
    if (!parsed) throw new Error("Invalid JSON");

    return parsed;

  } catch (err) {
    console.error('analyseReminderFull error:', err.message);
    return {
      category: 'Personal',
      priority: 5,
      is_outdoor: false,
      location_name: null,
      insight: null,
      ai_comment: null,
    };
  }
};

/* -------------------- PARSE REMINDER -------------------- */

exports.parseReminderText = async (text) => {
  try {
    const today = getTodayStr();

    const raw = await callGroq(
      `Extract reminder details.

Text: "${text}"
Today: ${today}

Return ONLY JSON:
{
  "message": "",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM:SS or null",
  "location": "string or null",
  "type": "ONCE or DAILY"
}`,
      200, 0.1
    );

    const parsed = safeJSONParse(raw);

    if (!parsed) {
      return {
        message: text,
        date: null,
        time: null,
        location: null,
        type: "ONCE"
      };
    }

    return parsed;

  } catch (err) {
    console.error('parseReminderText error:', err.message);
    return null;
  }
};

/* -------------------- FILTER PARSER -------------------- */

exports.parseFilterText = async (text) => {
  try {
    const raw = await callGroq(
      `Extract filter JSON:
"${text}"

{
  "filter": "",
  "message": "",
  "date_from": "",
  "date_to": ""
}`,
      150, 0.1
    );

    return safeJSONParse(raw);

  } catch {
    return null;
  }
};

/* -------------------- TIME SUGGESTION -------------------- */

exports.suggestBestTime = async (history) => {
  try {
    const raw = await callGroq(
      `Suggest best time:
${JSON.stringify(history)}

{"suggested_time":"HH:MM:SS"}`,
      80, 0.3
    );

    return safeJSONParse(raw) || { suggested_time: '09:00:00' };

  } catch {
    return { suggested_time: '09:00:00' };
  }
};

/* -------------------- DIGEST GENERATION -------------------- */

exports.generateDigest = async (userName, completed, missed, upcoming, typeLabel) => {
  try {
    const day = DAYS[new Date().getDay()];
    const isDaily = typeLabel.toLowerCase() === 'daily';
    const period = isDaily ? 'today' : 'this week';
    
    const raw = await callGroq(
      `Generate a structured personal ${typeLabel.toLowerCase()} digest for ${userName} (today is ${day}).
Completed: ${completed.length} — ${completed.slice(0,5).map(r=>r.message).join(', ')}
Missed: ${missed.length} — ${missed.slice(0,3).map(r=>r.message).join(', ')}
Upcoming: ${upcoming.length} — ${upcoming.slice(0,5).map(r=>r.message).join(', ')}

IMPORTANT: Format the response as a structured summary with clear sections separated by line breaks.
Use this exact format:
📊 Summary
You have X tasks done and Y upcoming ${period}.

✅ Completed
- List completed tasks briefly (1 line each, max 3)

📋 Coming Up
- List upcoming tasks briefly (1 line each, max 3)

💪 Keep Going!
One warm motivating sentence.

Return ONLY the formatted text. No markdown headers, no json. Use emojis for section titles. Each section on its own line.`,
      300, 0.7
    );

    return raw || `Stay on track ${period}!`;

  } catch (err) {
    console.error('generateDigest error:', err.message);
    return `Have a great ${typeLabel.toLowerCase()}!`;
  }
};

/* -------------------- GENERAL AI CALLS -------------------- */
exports.ask = async (prompt, maxTokens = 500) => {
  return await callGroq(prompt, maxTokens, 0.3);
};

exports.askJSON = async (prompt, maxTokens = 500) => {
  const raw = await callGroq(prompt + "\nReturn ONLY JSON.", maxTokens, 0.1);
  return safeJSONParse(raw);
};

/* -------------------- AUDIO TRANSCRIPTION -------------------- */
exports.transcribeAudio = async (filePath) => {
  const fs = require('fs');
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-large-v3-turbo',
    response_format: 'json',
    temperature: 0,
    // No `language` param → Whisper auto-detects (Tamil, English, Tanglish)
    // No `task: 'translate'` → keeps original language (no forced English translation)
  });
  return transcription.text;
};

exports.cleanTranscription = async (text) => {
  // We no longer send the transcription to an LLM for "cleaning".
  // Whisper is already highly accurate, and sending short questions
  // (like "Today's schedule?") to the LLM caused it to answer the 
  // question instead of just cleaning the text.
  return text.trim();
};

exports.processSmartReminder = async (transcribedText) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const timeStr = today.getHours().toString().padStart(2, '0') + ':' + today.getMinutes().toString().padStart(2, '0');
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

  const prompt = `You are an AI assistant for a reminder app.
The current date is ${todayStr} and current time is ${timeStr}.

The input may contain:
- Tamil, English, or mixed language (Tanglish)
- Speech recognition errors

Your tasks:
1. Correct transcription errors (fix obvious ASR/speech recognition mistakes)
2. Detect language ("Tamil", "English", or "Tanglish")
3. Extract:
   - task: the core action or reminder title
   - date: resolved to YYYY-MM-DD ("today" = ${todayStr}, "tomorrow" = ${tomorrow})
   - time: resolved to HH:MM 24-hour format
   - location: place name if mentioned, else null
   - type: "ONCE" for one-time, "DAILY" for recurring reminders
4. Return ONLY a strict JSON object — no markdown, no explanation
5. Also generate a natural sentence (natural_message) in the SAME language as the input confirming the reminder
6. Set confidence (0.0–1.0): deduct for missing fields, ambiguous words, or unclear intent

Date/time rules:
- If no date mentioned and task sounds recurring → type = "DAILY", date = ${todayStr}
- If no time mentioned → set confidence below 0.7
- If no task detected → set confidence below 0.5

Input: "${transcribedText}"

Return ONLY this JSON (no extra text):
{
  "task": "string — the reminder title",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "location": "string or null",
  "type": "ONCE or DAILY",
  "language": "Tamil | English | Tanglish",
  "natural_message": "confirmation sentence in same language as input",
  "confidence": 0.0
}`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content?.trim() || '';
    const parsed = safeJSONParse(content);
    if (!parsed) return null;

    // Post-process confidence: auto-penalise missing critical fields
    let conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7;
    if (!parsed.task || parsed.task === 'null') conf = Math.min(conf, 0.4);
    if (!parsed.time || parsed.time === 'null') conf = Math.min(conf, 0.65);
    if (!parsed.date || parsed.date === 'null') conf = Math.min(conf, 0.7);
    parsed.confidence = parseFloat(conf.toFixed(2));

    return parsed;
  } catch (err) {
    console.error('processSmartReminder error:', err.message);
    return null;
  }
};

/* -------------------- NEW INTENT SERVICE -------------------- */
exports.getIntent = async (text, chatHistory = []) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const timeStr = today.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const systemPrompt = `You are a strict intent classifier for a reminder app.
Current date: ${todayStr}, Time: ${timeStr}.
The text may be in English, Tamil, or Thanglish.

────────────────────────────────────────
INTENT CATEGORIES (pick exactly one):
────────────────────────────────────────

1. get_count   → user wants to KNOW THE NUMBER of reminders
   Keywords: how many, count, how much, எத்தனை, count பண்ணு
   Example: "how many reminders today?", "count of upcoming reminders"

2. show_list   → user wants to SEE / DISPLAY the list of reminders
   Keywords: show, display, list, tell me, காட்டு, சொல்லு, view
   Example: "show me", "display those", "list my reminders", "show those 5"
   NOTE: if user says "those reminders", "those 5", "them" → this is show_list of the LAST query type

3. add_reminder → user wants to CREATE a new reminder
   {"intent":"add_reminder","message":"cleaned task text","location":null,"date":"YYYY-MM-DD or null","time":"HH:MM or null","type":"ONCE|DAILY"}

4. update_reminder → user wants to EDIT/CHANGE an existing reminder
   {"intent":"update_reminder","reminder_id":null,"reminder_hint":"keyword","updates":{"message":null,"date":null,"time":null,"location":null,"type":null}}

5. delete_reminder → user wants to REMOVE a reminder
   {"intent":"delete_reminder","reminder_id":null,"reminder_hint":"keyword"}

6. conversational → greetings, small talk, or questions completely unrelated to reminders
   {"intent":"conversational","response":"short friendly answer"}

────────────────────────────────────────
FOR get_count, return:
{"intent":"get_count","query_type":"today|upcoming|completed|all","date":"${todayStr} or null","location":null}

FOR show_list, return:
{"intent":"show_list","query_type":"today|upcoming|completed|all","date":"${todayStr} or null","location":null,"is_followup":true_if_user_said_those_or_them}

────────────────────────────────────────
⚠️  CRITICAL RULES — must follow strictly:
────────────────────────────────────────
1. NEVER use a number the user mentions (e.g. "five", "5", "3") as the actual reminder count.
   Users refer to what THEY THINK — actual counts come from the database only.
2. If user says "those reminders", "display those", "show them", "those 5 reminders"
   → intent = show_list with is_followup = true
   → use query_type from the MOST RECENT query_reminders/get_count/show_list in chat history
3. If user says "today", query_type = "today" with date = ${todayStr}
4. If user says "upcoming", query_type = "upcoming"
5. Never return extra keys. Return ONLY valid strict JSON.

Date rules:
- "tomorrow" = ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "today"    = ${todayStr}

Return ONLY strict JSON. No explanation.`;

    // Map history to official API format for real conversational memory
    // Filter out messages that don't have valid text content to prevent API errors
    const messagesArr = [
      { role: "system", content: systemPrompt },
      ...chatHistory
        .filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim() !== '')
        .slice(-10)
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content.trim()
        })),
      { role: "user", content: text }
    ];

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messagesArr,
        temperature: 0,
        response_format: { type: "json_object" }
      });
      const result = JSON.parse(response.choices[0]?.message?.content);
      return result;
    } catch (err) {
      console.error('getIntent error details:', err.message);
      return { intent: "conversational", response: "Sorry, I couldn't process your request." };
    }
};