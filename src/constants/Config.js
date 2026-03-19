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
};

export default Config;