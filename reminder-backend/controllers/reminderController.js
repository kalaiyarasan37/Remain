const db                  = require('../config/db');
const notificationService = require('../services/notificationService');
const groqService         = require('../services/groqService');
const weatherService      = require('../services/weatherService');

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

// ── Check conflict ──────────────────────────────────────────
exports.checkConflict = async (req, res) => {
  try {
    const { user_id, date, time, message, exclude_id } = req.body;
    if (!user_id || !date || !message) return res.json({ conflict: false });
    const cleanDate = safeDate(date);
    if (!cleanDate) return res.json({ conflict: false });

    const params = [user_id, cleanDate];
    let query = `
      SELECT id, message,
         DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date,
         reminder_time, location
      FROM reminders
      WHERE user_id=? AND deleted=false AND closed=false
        AND reminder_date=?
    `;
    
    if (exclude_id) {
       query += ' AND id!=?';
       params.push(exclude_id);
    }

    const [rows] = await db.query(query, params);
    if (!rows.length) return res.json({ conflict: false });

    // Helper to get alphanumeric lowercase tokens ignoring common short words if multiple
    const getTokens = (str) =>
      str.toLowerCase()
         .replace(/[^a-z0-9\s]/g, '')
         .split(/\s+/)
         .filter(w => w.length > 2 || str.split(/\s+/).length <= 2);

    const newTokens = getTokens(message);
    if (newTokens.length === 0) return res.json({ conflict: false });

    const reqTimeStr = time || '07:00:00';
    const reqDateObj = new Date(`1970-01-01T${reqTimeStr}`);

    for (const r of rows) {
      const existingTokens = getTokens(r.message);
      if (existingTokens.length === 0) continue;

      // Calculate intersection and overlap score
      const intersection = newTokens.filter(t => existingTokens.includes(t));
      const overlapScore = intersection.length / Math.min(newTokens.length, existingTokens.length);

      // We consider "similar" if 50% of the shorter message's words are in the other
      if (overlapScore >= 0.5 || message.toLowerCase().trim() === r.message.toLowerCase().trim()) {
         
         const existTimeStr = r.reminder_time || '07:00:00';
         const existDateObj = new Date(`1970-01-01T${existTimeStr}`);

         const diffMins = Math.abs(reqDateObj - existDateObj) / 60000;

         if (diffMins <= 30) {
            return res.json({
               conflict: true,
               conflictType: 'message_and_time',
               conflicts: [r]
            });
         } else {
            return res.json({
               conflict: true,
               conflictType: 'message_only',
               conflicts: [r]
            });
         }
      }
    }

    return res.json({ conflict: false });
  } catch (err) {
    console.error('checkConflict error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Find similar for location suggestion ───────────────────
exports.findSimilar = async (req, res) => {
  try {
    const { user_id, message } = req.body;
    if (!user_id || !message) return res.json({ found: false });

    const [rows] = await db.query(
      `SELECT r.id, r.message, r.location 
       FROM reminders r 
       WHERE r.user_id=? AND r.location IS NOT NULL AND r.location != '' AND r.deleted=false
       ORDER BY r.created_at DESC`,
      [user_id]
    );

    if (!rows.length) return res.json({ found: false });

    const getTokens = (str) =>
      str.toLowerCase()
         .replace(/[^a-z0-9\s]/g, '')
         .split(/\s+/)
         .filter(w => w.length > 2 || str.split(/\s+/).length <= 2);

    const newTokens = getTokens(message);
    if (newTokens.length === 0) return res.json({ found: false });

    for (const r of rows) {
      const existingTokens = getTokens(r.message);
      if (existingTokens.length === 0) continue;

      const intersection = newTokens.filter(t => existingTokens.includes(t));
      const overlapScore = intersection.length / Math.min(newTokens.length, existingTokens.length);

      if (overlapScore >= 0.6 || message.toLowerCase().trim() === r.message.toLowerCase().trim()) {
        return res.json({ found: true, reminder: r });
      }
    }

    return res.json({ found: false });
  } catch (err) {
    console.error('findSimilar error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Suggested time ──────────────────────────────────────────
exports.getSuggestedTime = async (req, res) => {
  try {
    const { user_id } = req.params;
    const [rows] = await db.query(
      `SELECT reminder_time, COUNT(*) as total, SUM(closed=true) as completed
       FROM reminders WHERE user_id=? AND deleted=false AND reminder_time IS NOT NULL
       GROUP BY reminder_time ORDER BY completed DESC, total DESC LIMIT 10`,
      [user_id]
    );
    if (!rows.length)
      return res.json({ suggested_time: '09:00:00', reason: 'Morning 9 AM is a great start.', peak_hours: ['09:00'] });

    const history  = rows.map(r => ({ time: r.reminder_time, completed: parseInt(r.completed)||0, total: parseInt(r.total) }));
    const result   = await groqService.suggestBestTime(history);
    res.json(result);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── Weekly & Daily digest ───────────────────────────────────
exports.getWeeklyDigest = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { type } = req.query; // 'daily' or 'weekly'
    const isDaily = type === 'daily';

    const [[user]]    = await db.query('SELECT name FROM users WHERE id=?', [user_id]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now    = new Date();
    const today  = safeDate(now);
    
    let pastDate, nextDate;
    if (isDaily) {
      // Only count today (12:00 AM to 11:59 PM)
      pastDate = today;
      nextDate = today;
    } else {
      pastDate = safeDate(new Date(now.getTime() - 7*24*3600*1000));
      nextDate = safeDate(new Date(now.getTime() + 7*24*3600*1000));
    }

    const [completed] = await db.query(
      `SELECT message, COALESCE(category,'Personal') as category
       FROM reminders WHERE user_id=? AND closed=true AND DATE(reminder_date)=?`,
      [user_id, isDaily ? today : pastDate]
    );
    // Missed concept removed — not used in this project
    const [upcoming] = await db.query(
      `SELECT message, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date
       FROM reminders WHERE user_id=? AND closed=false AND deleted=false
         AND reminder_date BETWEEN ? AND ?
       ORDER BY reminder_date ASC LIMIT 10`,
      [user_id, today, nextDate]
    );

    const typeLabel = isDaily ? 'Daily' : 'Weekly';
    const digest = await groqService.generateDigest(user.name, completed, [], upcoming, typeLabel);
    
    try {
      await db.query(
        'INSERT INTO digest_logs (user_id, digest) VALUES (?,?) ON DUPLICATE KEY UPDATE digest=VALUES(digest)', 
        [user_id, digest]
      );
    } catch (dbErr) {
      console.log('Skipping digest db logging:', dbErr.message);
    }
    
    res.json({ digest, stats: { completed: completed.length, upcoming: upcoming.length } });
  } catch (err) {
    console.error('getWeeklyDigest error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── Create reminder ─────────────────────────────────────────
exports.createReminder = async (req, res) => {
  try {
    const { user_id, message, date, time, location, type, user_lat, user_lng } = req.body;

    if (!user_id || !message || !type)
      return res.status(400).json({ message: 'user_id, message, type required' });
    if (!['ONCE','DAILY'].includes(type))
      return res.status(400).json({ message: 'type must be ONCE or DAILY' });
    if (type === 'ONCE' && !date)
      return res.status(400).json({ message: 'date required for ONCE type' });

    const finalDate     = safeDate(date);
    const finalTime     = time     || '07:00:00';
    const finalLocation = (location && location.trim()) ? location.trim() : 'Home';
    const dayOfWeek     = finalDate ? groqService.getDayName(finalDate) : null;

    console.log(`📅 Creating: date=${finalDate} time=${finalTime} location=${finalLocation}`);

    // AI full analysis
    const analysis = await groqService.analyseReminderFull(
      message, finalDate, finalLocation, user_lat, user_lng
    );

    // Weather check for outdoor reminders
    let weatherWarning = null;
    if (analysis.is_outdoor) {
      try {
        const loc      = analysis.location_name || finalLocation;
        const forecast = await weatherService.getWeatherForLocation(loc);
        if (forecast) {
          const wx = await groqService.analyseWeatherForReminder(message, loc, forecast);
          if (wx.affected && wx.severity !== 'none') {
            weatherWarning = wx;
          }
        }
      } catch (wxErr) { console.log('Weather check skipped:', wxErr.message); }
    }

    const [result] = await db.query(
      `INSERT INTO reminders
       (user_id, message, reminder_date, reminder_time, location, reminder_type,
        ai_insight, ai_comment, category, priority, location_name, day_of_week,
        user_lat, user_lng)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user_id, message, finalDate, finalTime, finalLocation, type,
        analysis.insight    || null,
        analysis.ai_comment || null,
        analysis.category   || 'Personal',
        analysis.priority   || 5,
        analysis.location_name || finalLocation,
        dayOfWeek,
        user_lat  || null,
        user_lng  || null,
      ]
    );

    const [[reminder]] = await db.query(
      `SELECT *, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date FROM reminders WHERE id=?`,
      [result.insertId]
    );

    console.log(`✅ Saved: id=${reminder.id} date=${reminder.reminder_date}`);
    await notificationService.generateNotifications(reminder);

    res.status(201).json({
      message:         'Reminder created',
      reminder,
      ai_insight:      analysis.insight,
      ai_comment:      analysis.ai_comment,
      category:        analysis.category,
      priority:        analysis.priority,
      priority_reason: analysis.priority_reason,
      weather_warning: weatherWarning,
      day_of_week:     dayOfWeek,
    });
  } catch (err) {
    console.error('createReminder error:', err.message);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};

// ── List reminders ──────────────────────────────────────────
exports.listReminders = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { filter, location, time, message, type, date_from, date_to, is_closed, is_deleted, category } = req.body;

    let conds  = ['r.user_id=?'];
    let params = [user_id];

    if (filter === 'upcoming')  { conds.push('r.deleted=false','r.closed=false','r.reminder_date>=CURDATE()'); }
    else if (filter==='today')  { conds.push('r.deleted=false','r.reminder_date=CURDATE()'); }
    else if (filter==='closed') { conds.push('r.closed=true','r.deleted=false'); }
    else if (filter==='deleted'){ conds.push('r.deleted=true'); }
    else {
      conds.push(is_deleted===true ? 'r.deleted=true' : 'r.deleted=false');
      if (is_closed===true)  conds.push('r.closed=true');
      if (is_closed===false) conds.push('r.closed=false');
    }

    if (location) { conds.push('r.location LIKE ?');     params.push(`%${location.trim()}%`); }
    if (time)     { conds.push('r.reminder_time=?');      params.push(time.trim()); }
    if (message)  { conds.push('r.message LIKE ?');       params.push(`%${message.trim()}%`); }
    if (category) { conds.push('r.category=?');           params.push(category); }
    if (type && ['ONCE','DAILY'].includes(type.toUpperCase())) {
      conds.push('r.reminder_type=?'); params.push(type.toUpperCase());
    }
    if (date_from){ conds.push('r.reminder_date>=?'); params.push(safeDate(date_from)||date_from); }
    if (date_to)  { conds.push('r.reminder_date<=?'); params.push(safeDate(date_to)  ||date_to); }

    const [rows] = await db.query(
      `SELECT r.*, DATE_FORMAT(r.reminder_date,'%Y-%m-%d') as reminder_date,
         CASE
           WHEN r.reminder_date IS NULL     THEN 'no-date'
           WHEN r.reminder_date=CURDATE()   THEN 'today'
           WHEN r.reminder_date>CURDATE()   THEN 'upcoming'
           ELSE 'past'
         END AS date_status
       FROM reminders r
       WHERE ${conds.join(' AND ')}
       ORDER BY COALESCE(r.priority,5) DESC,
         CASE WHEN r.reminder_date IS NULL THEN 1 ELSE 0 END,
         r.reminder_date ASC, r.reminder_time ASC`,
      params
    );
    res.json({ total: rows.length, reminders: rows });
  } catch (err) {
    console.error('listReminders error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Get all reminders ───────────────────────────────────────
exports.getAllReminders = async (req, res) => {
  try {
    const { user_id } = req.params;
    const [[user]]    = await db.query(
      'SELECT id,name,mobile_no FROM users WHERE id=? AND active=true', [user_id]
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [reminders] = await db.query(
      `SELECT r.*, DATE_FORMAT(r.reminder_date,'%Y-%m-%d') as reminder_date,
         CASE
           WHEN r.reminder_date IS NULL     THEN 'no-date'
           WHEN r.reminder_date=CURDATE()   THEN 'today'
           WHEN r.reminder_date>CURDATE()   THEN 'upcoming'
           ELSE 'past'
         END AS date_status
       FROM reminders r WHERE r.user_id=?
       ORDER BY COALESCE(r.priority,5) DESC,
         r.deleted ASC, r.closed ASC,
         CASE WHEN r.reminder_date IS NULL THEN 1 ELSE 0 END,
         r.reminder_date ASC, r.reminder_time ASC`,
      [user_id]
    );

    const grouped = {
      today:    reminders.filter(r => r.date_status==='today'    && !r.deleted && !r.closed),
      upcoming: reminders.filter(r => r.date_status==='upcoming' && !r.deleted && !r.closed),
      past:     reminders.filter(r => r.date_status==='past'     && !r.deleted && !r.closed),
      no_date:  reminders.filter(r => r.date_status==='no-date'  && !r.deleted && !r.closed),
      closed:   reminders.filter(r =>  r.closed  && !r.deleted),
      deleted:  reminders.filter(r =>  r.deleted),
    };

    res.json({
      user,
      summary: {
        total:    reminders.length,
        today:    grouped.today.length,
        upcoming: grouped.upcoming.length,
        past:     grouped.past.length,
        no_date:  grouped.no_date.length,
        closed:   grouped.closed.length,
        deleted:  grouped.deleted.length,
      },
      reminders: grouped,
    });
  } catch (err) {
    console.error('getAllReminders error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const [[r]]  = await db.query(
      `SELECT *, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date
       FROM reminders WHERE id=? AND deleted=false`, [id]
    );
    if (!r) return res.status(404).json({ message: 'Not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.updateReminder = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const body = req.body;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Fetch current state
    const [rows] = await connection.query(
      `SELECT *, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date FROM reminders WHERE id=?`, [id]
    );
    const existing = rows[0];
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ message: 'Not found' });
    }

    // 2. Merge with body
    const message = body.message  || existing.message;
    const type    = body.type     || existing.reminder_type;
    const date    = body.date     || existing.reminder_date;
    const time    = body.time     || existing.reminder_time;
    const loc     = body.location !== undefined ? body.location : existing.location;
    const closed  = body.closed   !== undefined ? body.closed   : existing.closed;
    const lat     = body.user_lat || existing.user_lat;
    const lng     = body.user_lng || existing.user_lng;

    const finalDate     = safeDate(date);
    const finalTime     = time || '07:00:00';
    const finalLocation = loc || 'Home';
    const dayOfWeek     = finalDate ? groqService.getDayName(finalDate) : existing.day_of_week;

    // 3. Handle DAILY recurrence logic
    // If it was DAILY and we are closing it -> create a ONCE clone for today and move DAILY to tomorrow
    if (existing.reminder_type === 'DAILY' && body.closed === true) {
      console.log(`♻️ DAILY Progression for id=${id}: Creating ONCE clone and advancing.`);
      
      // A. Create ONCE clone for the date it was just completed for
      await connection.query(
        `INSERT INTO reminders 
         (user_id, message, reminder_date, reminder_time, location, reminder_type, 
          closed, ai_insight, ai_comment, category, priority, location_name, 
          day_of_week, user_lat, user_lng)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          existing.user_id, existing.message, existing.reminder_date, existing.reminder_time,
          existing.location, 'ONCE', true, // Closed ONCE clone
          existing.ai_insight, existing.ai_comment, existing.category,
          existing.priority, existing.location_name, existing.day_of_week,
          existing.user_lat, existing.user_lng
        ]
      );

      // B. Advance the original DAILY to tomorrow
      const nextDate = new Date(new Date(existing.reminder_date).getTime() + 24 * 60 * 60 * 1000);
      const nextDateStr = safeDate(nextDate);
      const nextDayName = groqService.getDayName(nextDateStr);

      await connection.query(
        `UPDATE reminders 
         SET reminder_date=?, day_of_week=?, closed=false 
         WHERE id=?`,
        [nextDateStr, nextDayName, id]
      );
    } else {
      // Normal update
      let analysis = {
        insight:    existing.ai_insight,
        ai_comment: existing.ai_comment,
        category:   existing.category,
        priority:   existing.priority,
        location_name: existing.location_name
      };

      if (body.message || body.location) {
        analysis = await groqService.analyseReminderFull(message, finalDate, finalLocation, lat, lng);
      }

      await connection.query(
        `UPDATE reminders
         SET message=?, reminder_date=?, reminder_time=?, location=?,
             reminder_type=?, ai_insight=?, ai_comment=?, category=?,
             priority=?, location_name=?, day_of_week=?, user_lat=?, user_lng=?,
             closed=?
         WHERE id=?`,
        [
          message, finalDate, finalTime, finalLocation, type,
          analysis.insight, analysis.ai_comment, analysis.category,
          analysis.priority, analysis.location_name, dayOfWeek,
          lat, lng, closed, id
        ]
      );
    }

    await connection.commit();

    // Refresh notifications if time/date/closed changed
    // Refresh notifications if core fields or type/closed changed
    if (body.date || body.time || body.message || body.closed !== undefined || body.type || body.reminder_type) {
       await db.query('DELETE FROM notifications WHERE message_id=? AND is_notified=false', [id]);
       const [updatedRem] = await db.query(
         `SELECT *, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date FROM reminders WHERE id=?`, [id]
       );
       if (updatedRem && updatedRem[0]) {
          await notificationService.generateNotifications(updatedRem[0]);
       }
    }

    const [[finalRem]] = await db.query(
      `SELECT *, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date FROM reminders WHERE id=?`, [id]
    );

    res.json({ message: 'Updated', reminder: finalRem });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('updateReminder error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (connection) connection.release();
  }
};

exports.deleteReminder = async (req, res) => {
  try {
    const { id }   = req.params;
    const [result] = await db.query(
      'UPDATE reminders SET deleted=true WHERE id=? AND deleted=false', [id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Not found' });
    await db.query('DELETE FROM notifications WHERE message_id=? AND is_notified=false', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── Location check ──────────────────────────────────────────
exports.checkLocationReminders = async (req, res) => {
  try {
    const { user_id, lat, lng } = req.body;
    if (!user_id || !lat || !lng)
      return res.status(400).json({ message: 'user_id, lat, lng required' });

    const [reminders] = await db.query(
      `SELECT id, message, location, location_name, ai_comment
       FROM reminders
       WHERE user_id=? AND deleted=false AND closed=false
         AND location_name IS NOT NULL`,
      [user_id]
    );

    const nearby = [];
    for (const r of reminders) {
      // Calculate approximate distance using simple lat/lng diff
      // In production use real geocoding API
      // For now alert if reminder has a location and user is near a major city
      const comment = await groqService.getLocationComment(
        r.message, r.location_name || r.location, lat, lng, 1.5
      );
      if (comment) {
        nearby.push({ ...r, location_alert: comment });
      }
    }

    res.json({ total: nearby.length, nearby });
  } catch (err) {
    console.error('checkLocationReminders error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
