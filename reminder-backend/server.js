require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const authRoutes         = require('./routes/authRoutes');
const reminderRoutes     = require('./routes/reminderRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

app.use('/api/auth',         authRoutes);
app.use('/api/reminder',     reminderRoutes);
app.use('/api/notification', notificationRoutes);

app.get('/', (req, res) => res.json({ status: '✅ AI Reminder Backend Running' }));

const { start: startCron } = require('./cron/cronJobs');
startCron();

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
