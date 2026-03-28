# RemainApp — Complete Project Summary
**Last Updated: March 26, 2026**
**Development Environment: WSL2 Ubuntu 22.04 on Windows**

---

## Tech Stack
- **React Native**: 0.76.5 (New Architecture enabled — `newArchEnabled=true`)
- **Platform**: Android only
- **Device**: Moto G64 5G (Android 15)
- **AI Models**:
  - `openai/gpt-oss-120b` — Human-like text (briefing, suggestions)
  - `llama-3.3-70b-versatile` — JSON parsing (voice, intent, priority)
  - `whisper-large-v3-turbo` — Audio transcription
- **Wake Word**: Picovoice Porcupine v4
- **Notifications**: @notifee/react-native

---

## Project File Structure
```
RemainApp/
├── src/
│   ├── screens/
│   │   ├── SplashScreen.jsx          ← Auto-routes to Login or Home
│   │   ├── LoginScreen.jsx           ← Mobile only + 6-digit OTP (redesigned)
│   │   ├── RegisterScreen.jsx        ← Name + mobile + 6-digit OTP (NEW)
│   │   ├── HomeScreen.jsx            ← Calendar, upcoming, AI FAB, voice FAB
│   │   ├── AddReminderScreen.jsx     ← Add/Edit, voice input, duplicate check
│   │   ├── ReminderListScreen.jsx    ← All/Upcoming/Completed/Deleted tabs
│   │   └── ProfileScreen.jsx        ← Edit name, logout
│   ├── services/
│   │   ├── ReminderService.js        ← CRUD, auto-complete, markComplete, softDelete
│   │   ├── VoiceService.js           ← Record → Whisper → Llama JSON parse
│   │   ├── IntentService.js          ← Query intent parsing (add vs query)
│   │   ├── PicovoiceService.js       ← Wake word, pause/resume around recording
│   │   ├── NotificationService.js    ← Schedule/cancel via notifee
│   │   ├── AIService.js              ← Briefing, suggestions, priority, duplicate
│   │   └── AppForegroundService.js  ← JS wrapper for native foreground module
│   ├── components/
│   │   ├── VoiceAssistantModal.jsx   ← Listening UI, silence detection, results
│   │   └── AIFeaturesModal.jsx      ← Briefing/Suggestions/Priority tabs
│   ├── constants/
│   │   ├── Config.js                 ← API keys, model names, Picovoice key
│   │   └── Colors.js                 ← primary:#6C63FF, secondary:#FF6584...
│   ├── navigation/
│   │   └── AppNavigator.jsx         ← Splash→Login→Register→Home→screens
│   └── utils/
│       └── Storage.js               ← AsyncStorage wrapper
├── android/app/src/main/java/com/remainapp/
│   ├── MainActivity.kt              ← Handles WAKE_WORD_TRIGGERED intent
│   ├── MainApplication.kt           ← Registers AppForegroundPackage
│   ├── AppForegroundModule.java     ← Native: notification + foreground launch
│   └── AppForegroundPackage.java    ← Registers AppForegroundModule
├── android/app/src/main/assets/
│   └── Hey-remainder_en_android_v4_0_0.ppn  ← Porcupine wake word file
├── .env                             ← GROQ_API_KEY (never commit)
├── index.js                         ← notifee.onBackgroundEvent handler
└── PROJECT_SUMMARY.md               ← This file
```

---

## Features Implemented ✅

### 1. Authentication Flow
- **LoginScreen**: Mobile number only + 6-digit OTP with auto-focus/backspace
- **RegisterScreen**: Name + mobile + 6-digit OTP (NEW separate screen)
- Existing user → "No Account Found" alert → redirects to Register with phone prefilled
- New user → "Already Registered" alert → redirects to Login with phone prefilled
- SplashScreen auto-routes: `user?.isLoggedIn` → Home, else → Login
- Backend hookup points marked with mock blocks:
  - `POST /auth/send-otp { phone }`
  - `POST /auth/verify-otp { phone, otp }`
  - `POST /auth/register/send-otp { name, phone }`
  - `POST /auth/register/verify { name, phone, otp }`

### 2. App Icon
- Custom AI-generated bell logo (purple #6C63FF)
- All mipmap sizes: hdpi, mdpi, xhdpi, xxhdpi, xxxhdpi
- Fix: `find ... -name "*Zone.Identifier*" -delete` prevents build errors
- Tool recommendation: icon.kitchen (padding=0, dark background)

### 3. Reminder Management
- Add reminder: message, location, custom date/time picker modals
- **Edit reminder**: pre-filled form with Update button
- Soft delete → Deleted section with restore option
- Permanent delete with confirmation
- Auto-complete when reminder time passes (no overdue concept)
- Reminder detail modal: mark done, edit, delete, close

### 4. Calendar View (HomeScreen)
- Full month calendar with ‹ › navigation
- Today highlighted with purple circle
- Dates with reminders show purple dot indicator
- Tap date → shows that day's reminders below calendar
- Empty date → "+ Add Reminder" shortcut button

### 5. Voice Features
- **Recording**: react-native-audio-recorder-player@3.6.10
- **Transcription**: Groq Whisper (whisper-large-v3-turbo)
- **Parsing**: Groq Llama JSON extraction
- Supports Tamil, English, Thanglish mixed language
- Auto-fills: message, location, date, time from voice
- **Silence detection**: Audio level monitoring, auto-stop after 1.5s silence
- Threshold: `db < -14` (calibrated for Moto G64)

### 6. Voice Assistant (Query Mode)
- "Show reminders at office" → filters by location
- "What's tomorrow's schedule?" → filters by date
- "Show upcoming reminders" → sorted upcoming list
- Intent detection: add_reminder vs query_reminders
- AI generates natural language summary of results
- "Ask Again" button in results

### 7. Wake Word Detection (DISABLED FOR NOW)
- **Current Status**: Disabled to prevent build/runtime errors during development.
- **Previous Implementation**: Picovoice Porcupine v4 ("Hey RemainApp")
- **Attempted Migration**: DaVoice `react-native-wakeword` ("Need Help Now" trial)
- **Next Steps**: Awaiting correct license/model configuration. The service file `DaVoiceService.js` currently exports a safe stub to prevent crashes. Pending future implementation.

### 8. Notifications (via @notifee/react-native)
- Scheduled at exact reminder time
- Early warning logic:
  - Reminder within 1 hour → notify 5 min before
  - Reminder more than 1 hour away → notify 1 hour before
- Works when app is killed
- Works on lock screen (VISIBILITY_PUBLIC)
- Background event handler in index.js
- Auto-reschedules when reminder is edited

### 9. AI Features (AIFeaturesModal — 🤖 FAB)
- **Daily Briefing tab**: Morning summary of today's reminders (GPT-OSS 120B)
- **Smart Suggestions tab**: AI suggests reminders based on usage patterns
- **Priority Analysis tab**: Ranks all reminders HIGH/MEDIUM/LOW with color coding
- **Duplicate Detection**: Warns before saving similar reminder (on save)
- All accessible via 🤖 FAB on HomeScreen

### 10. Advanced AI Context Suite
- **Smart Repeat Suggestions**: Real-time analysis of the last 7 days; auto-prompts to convert repetitive tasks to `DAILY`.
- **Smart Location Chips**: Filters historical locations with AI fuzzy matching for 1-tap fast auto-fill during text entry.
- **Reminder Conflict Detector**: Backend API validation blocks overlapping schedules within ±120 mins with an override alert.
- **Daily & Weekly AI Digests**: Dedicated HomeScreen notification banner that calculates completion stats and fetches a highly personalized, motivational summary from the Groq API.
- **Notification Context Linking**: (Previously Built) Deep-links unread reminders to AI analysis modals for traffic/weather considerations upon tapping the notification bubble.

---

## AI Model Architecture
```
Human-like text responses:
  getDailyBriefing()     → openai/gpt-oss-120b
  getSmartSuggestions()  → openai/gpt-oss-120b
  generateSummary()      → openai/gpt-oss-120b

Reliable JSON parsing:
  parseWithAI()          → llama-3.3-70b-versatile
  getIntent()            → llama-3.3-70b-versatile
  getPriority()          → llama-3.3-70b-versatile
  checkDuplicate()       → llama-3.3-70b-versatile

Audio transcription:
  transcribeAudio()      → whisper-large-v3-turbo
```

---

## Packages Installed
```json
{
  "@react-native-async-storage/async-storage": "latest",
  "@react-navigation/native": "latest",
  "@react-navigation/stack": "^7.8.6",
  "react-native-gesture-handler": "latest",
  "react-native-safe-area-context": "latest",
  "react-native-screens": "3.34.0",
  "react-native-tts": "latest",
  "@react-native-voice/voice": "3.2.4",
  "react-native-audio-recorder-player": "3.6.10",
  "@picovoice/porcupine-react-native": "4.0.0",
  "react-native-fs": "latest",
  "react-native-dotenv": "latest",
  "axios": "latest",
  "@notifee/react-native": "latest"
}
```

---

## Android Native Modules
### AppForegroundModule.java
- `bringToForeground()`: Shows high-priority notification with fullscreen intent
- `addListener()` / `removeListeners()`: Required NativeEventEmitter stubs
- Notification channel: `wake_word_channel` (IMPORTANCE_HIGH)

### MainActivity.kt
- `onNewIntent()`: Receives WAKE_WORD_TRIGGERED=true flag
- `sendWakeWordEvent()`: Emits WAKE_WORD_DETECTED to React Native via DeviceEventManagerModule

---

## Environment Setup (WSL2)
```bash
# Node
node --version  # v18.20.8
npm --version   # 10.8.2

# Java
java -version   # OpenJDK 17.0.18

# Android SDK at ~/Android/Sdk
# platform-tools, platforms;android-34/35, build-tools;34.0.0/35.0.0
# NDK 26.1.10909125, CMake 3.22.1

# Connect phone each session (Admin PowerShell):
usbipd attach --wsl --busid 2-1
# Then in Ubuntu:
adb devices  # Should show ZA222KPF54 device
```

---

## Build Commands
```bash
# Normal run (fast, uses cache)
cd ~/Projects/RemainApp
npx react-native run-android

# Full clean build
rm -rf android/app/build
rm -rf android/app/.cxx
rm -rf android/.gradle
npx react-native run-android

# Install specific APK
adb install -r ~/Projects/RemainApp/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk

# View logs
adb logcat | grep -E "AppForeground|MainActivity|ReactNative"

# Save build log
npx react-native run-android 2>&1 | tee ~/build.log
```

---

## gradle.properties (Important Settings)
```properties
newArchEnabled=true
kotlinVersion=2.1.0
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
android.useAndroidX=true
android.enableJetifier=true
org.gradle.daemon=true
org.gradle.parallel=true
```

## gradlew (Important Fix)
```batch
set GRADLE_USER_HOME=C:\GradleHome
```
*(Set in gradlew.bat to avoid file locking on D: drive)*

---

## Known Issues & Fixes

### 🔴 Voice Assistant JSON Parse Error (ACTIVE)
- **Error**: `No JSON found in response`
- **Cause**: GPT-OSS 120B is a reasoning model — outputs thinking text before JSON
- **Fix Applied**: 
  1. Use regex `match(/\{[\s\S]*\}/)` to extract JSON
  2. Use `llama-3.3-70b-versatile` for all JSON-requiring functions
  3. Added fallback: if GPT-OSS fails → retry with Llama
- **Files**: IntentService.js, VoiceService.js, AIService.js
- **Status**: Partially fixed, intermittent

### 🟡 Gradle Clean Warning (NON-CRITICAL)
- **Error**: `externalNativeBuildCleanDebug FAILED`
- **Cause**: CMake tries to clean already-cleaned codegen directories
- **Impact**: None — actual build succeeds after this
- **Workaround**: Use `rm -rf android/app/build` instead of `./gradlew clean`

### 🟡 Porcupine Init Error on First Run (NON-CRITICAL)
- **Error**: `Tried to use permissions API while not attached to Activity`
- **Cause**: First init attempt runs before Activity is ready
- **Impact**: None — second attempt (after app fully loads) succeeds
- **Status**: Working fine, error is cosmetic

### 🟡 Zone.Identifier Build Error (FIXED)
- **Cause**: Copying files from Windows to WSL creates metadata files
- **Fix**: `find ~/Projects/RemainApp/android/app/src/main/res -name "*Zone.Identifier*" -delete`

---

## Data Models

### Reminder Object
```javascript
{
  id: Date.now().toString(),
  title: string,
  description: '',
  location: string | '',
  dateTime: ISO string,
  isVoice: boolean,
  isCompleted: boolean,
  isDeleted: boolean,
  deletedAt: string | null,
  createdAt: ISO string,
  snoozeCount: number,    // for smart snooze
}
```

### User Object
```javascript
{
  name: string,
  phone: string,
  countryCode: '+91',
  isLoggedIn: true,
}
```

---

## Config.js Keys
```javascript
GROQ_API_KEY: from @env
GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions'
GROQ_MODEL: 'openai/gpt-oss-120b'        // human text
GROQ_MODEL_FAST: 'openai/gpt-oss-20b'    // fast tasks
GROQ_MODEL_JSON: 'llama-3.3-70b-versatile' // JSON parsing
PICOVOICE_ACCESS_KEY: '2D9XiqWpm7Ok5OyNWM31kXnaKLezz36YZNuPMk71b2FufSO6s0Wn4Q=='
WAKE_WORD_FILE: 'Hey-remainder_en_android_v4_0_0.ppn'
```

---

## Pending Features
- [ ] Fix JSON parse error permanently (switch all JSON calls to Llama)
- [ ] Background wake word foreground service (persistent background)
- [ ] Location-based reminders (geofencing)
- [ ] Push to GitHub (API keys in .env secured)
- [ ] Backend API integration (mock blocks ready in Login/Register)
- [ ] Play Store deployment
- [ ] iOS support (requires Mac)

---

## Groq Free Tier Limits
- llama-3.3-70b-versatile: 500,000 tokens/day FREE
- whisper-large-v3-turbo: 2 hours audio/day FREE
- openai/gpt-oss-120b: Limited free tier (paid after limit)
- Rate limit exceeded → API pauses, never billed on free tier

---

## Important Notes
1. **Never commit .env file** — contains GROQ_API_KEY
2. **Picovoice key in Config.js** — rotate before production release
3. **USB reconnect needed each WSL session** — run usbipd attach command
4. **newArchEnabled=true** — required for Porcupine v4 to work
5. **Kotlin 2.1.0** — required for async-storage new arch support
6. **react-native-screens@3.34.0** — pinned version (3.35+ breaks codegen)