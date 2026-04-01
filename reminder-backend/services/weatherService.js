require('dotenv').config();
const https = require('https');
const db    = require('../config/db');

const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '';

const fetchWeather = (location) => new Promise((resolve, reject) => {
  if (!WEATHER_API_KEY) {
    resolve(`Weather data unavailable. Location: ${location}`);
    return;
  }
  const loc = encodeURIComponent(location);
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${loc}&appid=${WEATHER_API_KEY}&units=metric&cnt=8`;
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.cod !== '200' && json.cod !== 200) {
          resolve(`Could not fetch weather for ${location}`);
          return;
        }
        const items = json.list?.slice(0, 4) || [];
        const summary = items.map(i =>
          `${i.dt_txt}: ${i.weather[0].description}, ${Math.round(i.main.temp)}°C`
        ).join('; ');
        resolve(summary || 'Weather data unavailable');
      } catch { resolve('Weather parse error'); }
    });
  }).on('error', () => resolve('Weather fetch error'));
});

exports.getWeatherForLocation = async (location) => {
  try {
    const [cached] = await db.query(
      `SELECT forecast, fetched_at FROM weather_cache
       WHERE location = ? AND fetched_at > DATE_SUB(NOW(), INTERVAL 3 HOUR)
       ORDER BY fetched_at DESC LIMIT 1`,
      [location]
    );
    if (cached.length > 0) return cached[0].forecast;

    const forecast = await fetchWeather(location);
    await db.query(
      'INSERT INTO weather_cache (location, forecast) VALUES (?,?)',
      [location, forecast]
    );
    return forecast;
  } catch (err) {
    console.error('getWeatherForLocation error:', err.message);
    return null;
  }
};
