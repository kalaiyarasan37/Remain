const cron = require('node-cron');
const db   = require('../config/db');

exports.start = () => {

  // Every minute — mark due notifications
  cron.schedule('* * * * *', async () => {
    try {
      const now  = new Date();
      const yyyy = now.getFullYear();
      const mm   = String(now.getMonth()+1).padStart(2,'0');
      const dd   = String(now.getDate()).padStart(2,'0');
      const HH   = String(now.getHours()).padStart(2,'0');
      const MM   = String(now.getMinutes()).padStart(2,'0');

      const nowDate  = `${yyyy}-${mm}-${dd}`;
      const nowTime  = `${HH}:${MM}:59`;
      const past3    = new Date(now.getTime() - 3*60*1000);
      const pastTime = `${String(past3.getHours()).padStart(2,'0')}:${String(past3.getMinutes()).padStart(2,'0')}:00`;

      const [rows] = await db.query(
        `SELECT n.id FROM notifications n
         JOIN reminders r ON n.message_id=r.id
         WHERE n.notification_date=?
           AND n.notification_time BETWEEN ? AND ?
           AND n.is_notified=false
           AND r.deleted=false AND r.closed=false`,
        [nowDate, pastTime, nowTime]
      );

      if (rows.length) {
        const ids = rows.map(r => r.id);
        await db.query('UPDATE notifications SET is_notified=true WHERE id IN (?)', [ids]);
        console.log(`🔔 [${nowDate} ${HH}:${MM}] ${ids.length} notification(s) ready`);
      }
    } catch (err) { console.error('Notify cron:', err.message); }
  });

  // Every minute — auto close expired reminders & progress DAILY reminders
  cron.schedule('* * * * *', async () => {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // 1. Auto-close ONCE reminders
      const [r1] = await connection.query(
        `UPDATE reminders SET closed=true
         WHERE reminder_type='ONCE'
           AND reminder_date IS NOT NULL
           AND CONCAT(reminder_date,' ',COALESCE(reminder_time,'07:00:00')) < NOW()
           AND closed=false AND deleted=false`
      );
      if (r1.affectedRows) console.log(`⏳ Auto-closed ${r1.affectedRows} ONCE reminder(s)`);

      // 2. Progress DAILY reminders
      // Find expired DAILY reminders
      const [expiredDaily] = await connection.query(
        `SELECT *, DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date 
         FROM reminders
         WHERE reminder_type='DAILY'
           AND reminder_date IS NOT NULL
           AND CONCAT(reminder_date,' ',COALESCE(reminder_time,'07:00:00')) < NOW()
           AND deleted=false`
      );

      for (const d of expiredDaily) {
        console.log(`♻️ Cron: Progressing DAILY id=${d.id} ("${d.message}")`);
        
        // A. Create ONCE clone for the expired date
        await connection.query(
          `INSERT INTO reminders 
           (user_id, message, reminder_date, reminder_time, location, reminder_type, 
            closed, ai_insight, ai_comment, category, priority, location_name, 
            day_of_week, user_lat, user_lng)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            d.user_id, d.message, d.reminder_date, d.reminder_time,
            d.location, 'ONCE', true,
            d.ai_insight, d.ai_comment, d.category,
            d.priority, d.location_name, d.day_of_week,
            d.user_lat, d.user_lng
          ]
        );

        // B. Advance the original to tomorrow
        const nextDt = new Date(new Date(d.reminder_date).getTime() + 24 * 60 * 60 * 1000);
        const nextDateStr = nextDt.toISOString().split('T')[0];
        const nextDayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][nextDt.getDay()];

        await connection.query(
          `UPDATE reminders SET reminder_date=?, day_of_week=?, closed=false WHERE id=?`,
          [nextDateStr, nextDayName, d.id]
        );
      }

      await connection.commit();
    } catch (err) {
      if (connection) await connection.rollback();
      console.error('Expired reminders cron error:', err.message);
    } finally {
      if (connection) connection.release();
    }
  });

  // Sunday 9 AM — weekly digest
  cron.schedule('0 9 * * 0', async () => {
    const groq = require('../services/groqService');
    try {
      const [users] = await db.query('SELECT id,name FROM users WHERE active=true');
      for (const user of users) {
        try {
          const now   = new Date();
          const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
          const past7 = new Date(now.getTime()-7*24*3600*1000);
          const next7 = new Date(now.getTime()+7*24*3600*1000);
          const p7    = `${past7.getFullYear()}-${String(past7.getMonth()+1).padStart(2,'0')}-${String(past7.getDate()).padStart(2,'0')}`;
          const n7    = `${next7.getFullYear()}-${String(next7.getMonth()+1).padStart(2,'0')}-${String(next7.getDate()).padStart(2,'0')}`;

          const [c] = await db.query(`SELECT message,COALESCE(category,'Personal') as category FROM reminders WHERE user_id=? AND closed=true AND updated_at>=?`,[user.id,p7]);
          const [m] = await db.query(`SELECT message FROM reminders WHERE user_id=? AND deleted=true AND updated_at>=?`,[user.id,p7]);
          const [u] = await db.query(`SELECT message,DATE_FORMAT(reminder_date,'%Y-%m-%d') as reminder_date FROM reminders WHERE user_id=? AND closed=false AND deleted=false AND reminder_date BETWEEN ? AND ? ORDER BY reminder_date LIMIT 10`,[user.id,today,n7]);

          const digest = await groq.generateWeeklyDigest(user.name, c, m, u);
          await db.query('INSERT INTO digest_logs (user_id,digest) VALUES (?,?)',[user.id,digest]);
          console.log(`📊 Digest: ${user.name}`);
        } catch (err) { console.error(`Digest ${user.id}:`, err.message); }
      }
    } catch (err) { console.error('Digest cron:', err.message); }
  });

  console.log('✅ All cron jobs started');
};
