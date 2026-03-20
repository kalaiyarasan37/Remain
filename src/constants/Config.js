import { GROQ_API_KEY } from '@env';

const Config = {
  API_BASE_URL: 'https://your-api.com/api',
  OTP_EXPIRY_SECONDS: 60,
  APP_NAME: 'RemainApp',
  MAX_REMINDERS: 100,
  VOICE_LOCALE: 'en-IN',
  GROQ_API_KEY: GROQ_API_KEY,
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  PICOVOICE_ACCESS_KEY: '2D9XiqWpm7Ok5OyNWM31kXnaKLezz36YZNuPMk71b2FufSO6s0Wn4Q==',
  WAKE_WORD_FILE: 'Hey-remainder_en_android_v4_0_0.ppn',
};

export default Config;