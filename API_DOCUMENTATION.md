# RemainApp APIs

## Existing Core APIs

Step 1 → POST /api/auth/send-otp (register new user) 
Step 2 → POST /api/auth/verify-otp (get token → auto saved) 
Step 3 → GET /api/auth/verify-token (confirm token valid) 
Step 4 → POST /api/reminder/create (ONCE — full details) 
Step 5 → POST /api/reminder/create (ONCE — no time, no location) 
Step 6 → POST /api/reminder/create (DAILY — full details) 
Step 7 → POST /api/reminder/create (DAILY — no time) 
Step 8 → POST /api/reminder/create (Tamil message) 
Step 9 → POST /api/reminder/create (Hindi message) 
Step 10 → GET /api/notification/1 (see all AI labels) 
Step 11 → POST /api/reminder/list/1 body: {} (all active) 
Step 12 → POST /api/reminder/list/1 body: {"filter":"upcoming"} 
Step 13 → POST /api/reminder/list/1 body: {"filter":"today"} 
Step 14 → POST /api/reminder/list/1 body: {"filter":"deleted"} 
Step 15 → POST /api/reminder/list/1 body: {"filter":"closed"} 
Step 16 → POST /api/reminder/list/1 body: {"type":"DAILY"} 
Step 17 → POST /api/reminder/list/1 body: {"location":"Home"} 
Step 18 → GET /api/reminder/1 (get single reminder) 
Step 19 → PUT /api/reminder/1 body: {"message":"Update..."} 
Step 20 → DELETE /api/reminder/1 (soft delete) 
Step 21 → POST /api/reminder/check-conflict body: {"user_id":1, "message":"Gym", "reminder_date":"2026-03-24", "reminder_time":"18:00:00"} 
Step 22 → GET /api/reminder/suggested-time/1 
Step 23 → GET /api/reminder/digest/1?type=weekly 
Step 24 → GET /api/notification/1?is_notified=false (pending alerts) 
Step 25 → GET /api/notification/1?is_notified=true (sent alerts) 
Step 26 → GET /api/notification/1?date=2026-03-24 
Step 27 → POST /api/reminder/location-check body: {"user_id":1, "lat":12.9716, "lng":77.5946} 

## Newly Added AI Proxy Endpoints
*Added today to migrate AI from frontend to backend*

Step 28 → POST /api/reminder/transcribe 
- **Body:** `{ "audioBase64": "..." }`
- **Purpose:** Converts voice audio to text securely.

Step 29 → POST /api/reminder/parse 
- **Body:** `{ "text": "remind me to..." }`
- **Purpose:** Centralized NLP parsing for general text/voice-to-reminder mapping.

Step 30 → POST /api/reminder/parse-filter 
- **Body:** `{ "text": "show my upcoming..." }`
- **Purpose:** Parses natural language filtering queries into structured query objects.

Step 31 → POST /api/reminder/intent 
- **Body:** `{ "text": "delete my last reminder", "chatHistory": [...] }`
- **Purpose:** Analyzes the active AI chat flow and determines NLP intent to execute specific actions (add, delete, select, etc.).

Step 32 → POST /api/reminder/ask 
- **Body:** `{ "prompt": "...", "asJson": true/false }`
- **Purpose:** A broad proxy format used by existing AI features (briefings, suggestions) to communicate with Groq without the API Key existing on the client device.
