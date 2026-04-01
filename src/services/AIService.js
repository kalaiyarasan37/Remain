import { askAI, askJSON } from './ApiService';

const AIService = {

   // For human text responses (briefing, summary)
   ask: async (prompt, maxTokens = 500, fast = false) => {
      try {
         const data = await askAI(prompt);
         return data.response;
      } catch (e) {
         console.error('AIService ask error:', e.message);
         throw e;
      }
   },

   // For JSON responses (suggestions, priority, duplicate)
   askJSON: async (prompt, maxTokens = 500) => {
      try {
         const data = await askJSON(prompt);
         // Return stringified JSON so existing parsing logic works seamlessly
         return JSON.stringify(data);
      } catch (e) {
         throw e;
      }
   },

   // Feature 1 — Smart Suggestions
   getSmartSuggestions: async (reminders) => {
      const now = new Date();
      const recentTitles = reminders
         .slice(0, 20)
         .map(r => ({
            title: r.title,
            dayOfWeek: new Date(r.dateTime).toLocaleDateString('en', { weekday: 'long' }),
            hour: new Date(r.dateTime).getHours(),
            isCompleted: r.isCompleted,
         }));

      const prompt = `You are a smart reminder assistant. Analyze these past reminders and suggest 3 new reminders the user might need.

Past reminders: ${JSON.stringify(recentTitles)}
Today's full date: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en', { weekday: 'long' })})
Current time: ${now.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
Current year: ${now.getFullYear()}

Return ONLY a JSON array of 3 suggestions with dates in ${now.getFullYear()} or later:
[
  {"title": "suggestion text", "reason": "why you suggest this", "suggestedTime": "HH:MM", "suggestedDate": "YYYY-MM-DD"},
  ...
]
No explanation. No markdown. Just JSON array.`;

      try {
         const result = await AIService.askJSON(prompt, 300);
         const cleaned = result.replace(/```json|```/g, '').trim();
         const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
         if (!jsonMatch) {
            console.error('No JSON array found in response');
            return [];
         }
         return JSON.parse(jsonMatch[0]);
      } catch (e) {
         console.error('Smart suggestions error:', e);
         return [];
      }
   },

   // Feature 2 — Priority Scoring
   getPriority: async (title, dateTime) => {
      const prompt = `Analyze this reminder and return its priority level.

Reminder: "${title}"
Scheduled: ${new Date(dateTime).toLocaleString('en-IN')}

Priority rules:
- HIGH: meetings, doctor, deadline, interview, exam, emergency, payment, surgery, flight
- MEDIUM: call, buy, send, submit, check, follow up, appointment
- LOW: personal, optional, someday, maybe, leisure, entertainment

Return ONLY one of these exact words: HIGH, MEDIUM, LOW`;

      try {
         const result = await AIService.askJSON(prompt, 10);
         const priority = result.trim().toUpperCase();
         if (['HIGH', 'MEDIUM', 'LOW'].includes(priority)) { return priority; }
         return 'MEDIUM';
      } catch (e) {
         return 'MEDIUM';
      }
   },

   // Feature 3 — Daily Briefing (keeps GPT-OSS for human text)
   getDailyBriefing: async (todayReminders, allUpcoming) => {
      if (todayReminders.length === 0 && allUpcoming.length === 0) {
         return "🎉 No reminders today!\n\nEnjoy your free day and relax. You deserve it!";
      }

      const prompt = `Create a structured morning briefing for these reminders.

Today's reminders: ${JSON.stringify(todayReminders.map(r => ({
         title: r.title,
         time: new Date(r.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
         location: r.location || null,
      })))}

Upcoming (next 3 days): ${JSON.stringify(allUpcoming.slice(0, 5).map(r => ({
         title: r.title,
         date: new Date(r.dateTime).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }),
      })))}

IMPORTANT: Format the response with clear sections and line breaks. Use this format:
☀️ Good morning!
You have X reminders today.

📌 Today's Tasks
- Task name at Time (Location if any)
- Task name at Time

📅 Coming Up
- Task on Date

💡 Tip
One short motivating or practical tip.

Return ONLY the structured text. No markdown, no json. Use emojis for section titles.`;

      try {
         return await AIService.ask(prompt, 300);
      } catch (e) {
         return `📌 You have ${todayReminders.length} reminder(s) today.\n\nStay organized and have a great day!`;
      }
   },

   // Feature 4 — Duplicate Detection
   checkDuplicate: async (newTitle, newDateTime, existingReminders) => {
      const upcoming = existingReminders
         .filter(r => !r.isDeleted && !r.isCompleted)
         .slice(0, 20)
         .map(r => ({
            id: r.id,
            title: r.title,
            dateTime: r.dateTime,
         }));

      if (upcoming.length === 0) { return null; }

      const prompt = `Check if this new reminder is a duplicate of any existing ones.

New reminder: "${newTitle}" at ${new Date(newDateTime).toLocaleString('en-IN')}

Existing reminders: ${JSON.stringify(upcoming)}

If duplicate found, return JSON: {"isDuplicate": true, "duplicateId": "id", "reason": "why they are similar"}
If no duplicate, return JSON: {"isDuplicate": false}

Return ONLY JSON. No explanation.`;

      try {
         const result = await AIService.askJSON(prompt, 100);
         const cleaned = result.replace(/```json|```/g, '').trim();
         const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
         if (!jsonMatch) { return { isDuplicate: false }; }
         return JSON.parse(jsonMatch[0]);
      } catch (e) {
         return { isDuplicate: false };
      }
   },

   // Feature 5 — Notification Context
   getReminderContext: async (title, location, time) => {
      let realWeatherText = "Weather data unavailable.";
      if (location && location !== 'Not specified') {
         try {
            // 1. Get Coordinates using Nominatim since it can parse exact street addresses perfectly
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`, {
               headers: { 'User-Agent': 'RemainApp/1.0' }
            });
            const geoData = await geoRes.json();
            
            if (geoData && geoData.length > 0) {
               const { lat, lon, name } = geoData[0];
               const shortName = name || location.split(',')[0];
               
               // 2. Get Real Weather
               const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation`);
               const weatherData = await weatherRes.json();
               
               if (weatherData && weatherData.current) {
                  const temp = weatherData.current.temperature_2m;
                  const rain = weatherData.current.precipitation;
                  realWeatherText = `${temp}°C near ${shortName}. ` + (rain > 0 ? `Currently raining (${rain}mm).` : `No rain currently.`);
               }
            }
         } catch (e) {
            console.log("Weather fetch failed", e);
         }
      }

      const prompt = `The user has just clicked a reminder notification.
Title: "${title}"
Location: "${location || 'Not specified'}"
Time: ${time}
Real-Time Weather: ${realWeatherText}

Provide 2-3 brief, helpful preparation suggestions tailored to this reminder.
CRITICAL RULES:
1. ONLY mention the weather using the exact "Real-Time Weather" data provided above. Be specific (e.g. mention the exact temperature).
2. DO NOT invent or guess local traffic conditions or specific neighborhood events (never mention "school runs" unless the title is about a school).
3. Focus on practical advice, items to bring, or time-of-day general preparations logical for this task.
Be conversational but concise. Plain text only, no markdown.`;
      
      try {
         return await AIService.ask(prompt, 250); // Using the main model for better reasoning
      } catch (e) {
         return "No specific suggestions available at the moment.";
      }
   },

   // Feature 6 — Smart Repeat Suggestions
   checkRepeatSuggest: async (currentMessage, recentReminders) => {
      if (!currentMessage || !recentReminders || recentReminders.length < 3) return false;

      // Filter recent reminders from the last 7 days
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      
      const recentTitles = recentReminders
         .filter(r => new Date(r.dateTime) > lastWeek)
         .map(r => r.title);

      if (recentTitles.length < 3) return false;

      const prompt = `You are an AI assistant. The user is creating a new reminder: "${currentMessage}".
Here are their reminders from the past 7 days: ${JSON.stringify(recentTitles)}.

Does the new reminder look like a very common repeatable task they've done at least 3 times recently?
Return ONLY JSON:
{"suggestDaily": true} or {"suggestDaily": false}`;

      try {
         const result = await AIService.askJSON(prompt, 50);
         const cleaned = result.replace(/```json|```/g, '').trim();
         const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
         if (!jsonMatch) return false;
         const parsed = JSON.parse(jsonMatch[0]);
         return parsed.suggestDaily === true;
      } catch (e) {
         return false;
      }
   },

   // Feature 7 — Smart Location Suggestions
   suggestLocation: async (inputText, pastLocations) => {
      if (!inputText || inputText.length < 2 || !pastLocations || pastLocations.length === 0) return [];

      const prompt = `The user is typing a location for their task/reminder: "${inputText}".
Here are their past unique locations: ${JSON.stringify(pastLocations)}.

Suggest up to 3 past locations that they most likely mean, prioritizing spelling similarity and context.
Return ONLY a JSON array of strings: ["Location 1", "Location 2"]`;

      try {
         const result = await AIService.askJSON(prompt, 100);
         const cleaned = result.replace(/```json|```/g, '').trim();
         const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
         if (!jsonMatch) return [];
         return JSON.parse(jsonMatch[0]);
      } catch (e) {
         return [];
      }
   },
};

export default AIService;