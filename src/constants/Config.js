import { GROQ_API_KEY } from '@env';

const Config = {
  API_BASE_URL: 'http://192.168.1.39:5000/api',
  OTP_EXPIRY_SECONDS: 60,
  APP_NAME: 'RemainApp',
  MAX_REMINDERS: 100,
  VOICE_LOCALE: 'en-IN',
  GROQ_API_KEY: GROQ_API_KEY,
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',

  // Primary model - GPT-OSS 120B (most human-like, free tier available)
  GROQ_MODEL: 'openai/gpt-oss-120b',

  // Fallback model - if 120b hits rate limit switch to this
  GROQ_MODEL_FAST: 'openai/gpt-oss-20b',

  // For JSON parsing (intent, priority, duplicate, voice parse)
  GROQ_MODEL_JSON: 'llama-3.3-70b-versatile',

  DAVOICE_LICENSE_KEY: 'MTc3NzU4MjgwMDAwMA==-DjFidRwm0IRAGfH/z5nbjGYCrKtm0Q+sc2LNoexBnm8=',
  
  // PICOVOICE_ACCESS_KEY: '2D9XiqWpm7Ok5OyNWM31kXnaKLezz36YZNuPMk71b2FufSO6s0Wn4Q==',
  // WAKE_WORD_FILE: 'Hey-remainder_en_android_v4_0_0.ppn',
};

export default Config;