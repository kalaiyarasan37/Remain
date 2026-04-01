const db   = require('../config/db');
const groq = require('./groqService');

const safeDate = (d) => {
  if (!d) return null;
  if (typeof d === 'string') {
    const s = d.includes('T') ? d.split('T')[0] : d.split(' ')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return null;
};

const addMins = (dateStr, hh, mm, mins) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d, hh, mm, 0);
  dt.setMinutes(dt.getMinutes() + mins);
  return {
    date: `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`,
    time: `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:00`,
  };
};

// Check if reminder is within 4 hours from now
const isWithin4Hours = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return false;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm]   = timeStr.split(':').map(Number);
  const reminderDt = new Date(y, mo - 1, d, hh, mm, 0);
  const now        = new Date();
  const diffHours  = (reminderDt - now) / (1000 * 60 * 60);
  return diffHours >= 0 && diffHours <= 4;
};

exports.generateNotifications = async (reminder) => {
  try {
    const type         = reminder.reminder_type;
    const message      = reminder.message;
    const reminderDate = safeDate(reminder.reminder_date);
    const timeStr      = reminder.reminder_time
      ? String(reminder.reminder_time).slice(0, 8)
      : '07:00:00';
    const [hStr, mStr] = timeStr.split(':');
    const h   = parseInt(hStr) || 7;
    const m   = parseInt(mStr) || 0;
    const onT = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;

    const now      = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    if (reminder.closed) return;
    const notifications = [];
    const nowDt = new Date();

    // ── ONCE ──
    if (type === 'ONCE') {
      if (!reminderDate) return;

      const labelOn = await groq.generateNotifyLabel(message, reminderDate, reminderDate);
      if (new Date(`${reminderDate}T${onT}`) > nowDt) {
        notifications.push({ date: reminderDate, time: onT, label: labelOn });
      }

      // Only add 60-min-before if NOT within 4 hours from now
      if (!isWithin4Hours(reminderDate, onT)) {
        const before  = addMins(reminderDate, h, m, -60);
        if (new Date(`${before.date}T${before.time}`) > nowDt) {
          const label60 = await groq.generateNotifyLabel(message, before.date, reminderDate);
          notifications.push({ date: before.date, time: before.time, label: `⏰ 1 hr: ${label60}` });
        }
      }
    }

    // ── DAILY with end date ──
    if (type === 'DAILY' && reminderDate) {
      const [ey, em, ed] = reminderDate.split('-').map(Number);
      const endDate = new Date(ey, em - 1, ed);
      let   cur     = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      while (cur <= endDate) {
        const cy  = cur.getFullYear();
        const cm  = String(cur.getMonth() + 1).padStart(2, '0');
        const cd  = String(cur.getDate()).padStart(2, '0');
        const iso = `${cy}-${cm}-${cd}`;
        if (new Date(`${iso}T${onT}`) > nowDt) {
          const label = await groq.generateNotifyLabel(message, iso, reminderDate);
          notifications.push({ date: iso, time: onT, label });
        }

        // Last day: add 60-min-before if not within 4 hours
        if (iso === reminderDate && !isWithin4Hours(iso, onT)) {
          const before  = addMins(iso, h, m, -60);
          if (new Date(`${before.date}T${before.time}`) > nowDt) {
            const label60 = await groq.generateNotifyLabel(message, before.date, reminderDate);
            notifications.push({ date: before.date, time: before.time, label: `⏰ 1 hr: ${label60}` });
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    // ── DAILY without end date — 365 days ──
    if (type === 'DAILY' && !reminderDate) {
      let cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(cur.getTime() + 365 * 24 * 3600 * 1000);
      while (cur <= end) {
        const cy  = cur.getFullYear();
        const cm  = String(cur.getMonth() + 1).padStart(2, '0');
        const cd  = String(cur.getDate()).padStart(2, '0');
        const iso = `${cy}-${cm}-${cd}`;
        const label = await groq.generateNotifyLabel(message, iso, null);
        notifications.push({ date: iso, time: onT, label });
        cur.setDate(cur.getDate() + 1);
      }
    }

    if (!notifications.length) return;

    const values = notifications.map(n => [
      reminder.id, reminder.user_id, n.date, n.time, false, n.label,
    ]);

    await db.query(
      `INSERT INTO notifications
       (message_id, user_id, notification_date, notification_time, is_notified, notify_label)
       VALUES ?`,
      [values]
    );
    console.log(`✅ ${notifications.length} notification(s) for reminder ${reminder.id} [${type}]`);
  } catch (err) {
    console.error('generateNotifications error:', err.message);
  }
};
