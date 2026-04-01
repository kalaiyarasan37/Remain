const db = require('../config/db');

exports.getNotifications = async (req, res) => {
  try {
    const { user_id }           = req.params;
    const { is_notified, date } = req.query;
    let conds  = ['n.user_id=?'];
    let params = [user_id];

    if (is_notified !== undefined) {
      conds.push('n.is_notified=?');
      params.push(is_notified==='true' ? 1 : 0);
    }
    if (date) { conds.push('n.notification_date=?'); params.push(date); }

    const [rows] = await db.query(
      `SELECT n.*,
         DATE_FORMAT(n.notification_date,'%Y-%m-%d') as notification_date,
         r.message, r.ai_insight, r.ai_comment, r.location,
         r.reminder_type, r.reminder_date as original_reminder_date,
         COALESCE(r.category,'Personal') as category,
         COALESCE(r.priority,5) as priority
       FROM notifications n
       JOIN reminders r ON n.message_id=r.id
       WHERE ${conds.join(' AND ')}
       ORDER BY n.notification_date ASC, n.notification_time ASC`,
      params
    );
    res.json({ total: rows.length, notifications: rows });
  } catch (err) {
    console.error('getNotifications error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getDueNotifications = async (req, res) => {
  try {
    const { user_id } = req.params;
    const now  = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth()+1).padStart(2,'0');
    const dd   = String(now.getDate()).padStart(2,'0');
    const HH   = String(now.getHours()).padStart(2,'0');
    const MM   = String(now.getMinutes()).padStart(2,'0');

    const nowDate  = `${yyyy}-${mm}-${dd}`;
    const nowTime  = `${HH}:${MM}:59`;
    const past3    = new Date(now.getTime() - 3 * 60 * 1000);
    const pastTime = `${String(past3.getHours()).padStart(2,'0')}:${String(past3.getMinutes()).padStart(2,'0')}:00`;

    const [rows] = await db.query(
      `SELECT n.*,
         DATE_FORMAT(n.notification_date,'%Y-%m-%d') as notification_date,
         r.message, r.ai_insight, r.ai_comment, r.location,
         r.reminder_type,
         COALESCE(r.category,'Personal') as category,
         COALESCE(r.priority,5) as priority
       FROM notifications n
       JOIN reminders r ON n.message_id=r.id
       WHERE n.user_id=?
         AND n.notification_date=?
         AND n.notification_time BETWEEN ? AND ?
         AND n.is_notified=false
         AND r.deleted=false AND r.closed=false`,
      [user_id, nowDate, pastTime, nowTime]
    );
    res.json({ total: rows.length, notifications: rows });
  } catch (err) {
    console.error('getDueNotifications error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.markNotified = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ message: 'ids required' });
    await db.query('UPDATE notifications SET is_notified=true WHERE id IN (?)', [ids]);
    res.json({ message: 'Marked', count: ids.length });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};
