import Storage from '../utils/Storage';
import NotificationService from './NotificationService';
import {
  createReminder,
  getAllReminders,
  filterReminders,
  updateReminder,
  deleteReminder,
  getReminder,
} from './ApiService';

const ReminderService = {

  // ── helper: get userId from storage ──────────
  _getUserId: async () => {
    const user = await Storage.get('user');
    return user?.id || null;
  },

  // ── map backend reminder → app format ────────
  _map: (r) => ({
    id: String(r.id),
    title: r.message,
    location: r.location || '',
    dateTime: `${r.reminder_date}T${r.reminder_time}`,
    type: r.reminder_type,
    isCompleted: r.closed || false,
    isDeleted: r.deleted || false,
    deletedAt: r.deleted ? r.updated_at : null,
    createdAt: r.created_at,
    dateStatus: r.date_status,
  }),

  // ── GET ALL (grouped from backend) ───────────
  getAll: async () => {
    try {
      const userId = await ReminderService._getUserId();
      if (!userId) return [];
      const data = await getAllReminders(userId);
      const groups = data.reminders || {};
      const all = [
        ...(groups.today    || []),
        ...(groups.upcoming || []),
        ...(groups.past     || []),
        ...(groups.closed   || []),
        ...(groups.deleted  || []),
      ];
      return all.map(ReminderService._map);
    } catch (e) {
      console.error('ReminderService.getAll error:', e.message);
      return [];
    }
  },

  // ── GET ACTIVE (not deleted) ─────────────────
  getActive: async () => {
    try {
      const userId = await ReminderService._getUserId();
      if (!userId) return [];
      const data = await filterReminders(userId, {});
      return (data.reminders || []).map(ReminderService._map);
    } catch (e) {
      console.error('ReminderService.getActive error:', e.message);
      return [];
    }
  },

  // ── GET UPCOMING ─────────────────────────────
  getUpcoming: async () => {
    try {
      const userId = await ReminderService._getUserId();
      if (!userId) return [];
      const data = await filterReminders(userId, { filter: 'upcoming' });
      return (data.reminders || []).map(ReminderService._map);
    } catch (e) {
      console.error('ReminderService.getUpcoming error:', e.message);
      return [];
    }
  },

  // ── GET DELETED ──────────────────────────────
  getDeleted: async () => {
    try {
      const userId = await ReminderService._getUserId();
      if (!userId) return [];
      const data = await filterReminders(userId, { filter: 'deleted' });
      return (data.reminders || []).map(ReminderService._map);
    } catch (e) {
      console.error('ReminderService.getDeleted error:', e.message);
      return [];
    }
  },

  // ── ADD ──────────────────────────────────────
  // Note: AddReminderScreen calls createReminder() directly from ApiService
  // This is kept for any internal use
  add: async (reminder) => {
    try {
      const userId = await ReminderService._getUserId();
      if (!userId) throw new Error('Not logged in');
      const d = new Date(reminder.dateTime);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
      const data = await createReminder({
        user_id: userId,
        message: reminder.title,
        date: dateStr,
        time: timeStr,
        location: reminder.location || undefined,
        type: 'ONCE',
      });
      const mapped = ReminderService._map(data.reminder);
      // Schedule local notification
      await NotificationService.scheduleForReminder(mapped);
      return mapped;
    } catch (e) {
      console.error('ReminderService.add error:', e.message);
      throw e;
    }
  },

  // ── UPDATE ───────────────────────────────────
  update: async (id, updatedData) => {
    try {
      // If marking complete or deleted — use backend
      if (updatedData.isCompleted !== undefined || updatedData.isDeleted !== undefined) {
        // complete and delete have their own methods — call those
        if (updatedData.isCompleted) return await ReminderService.complete(id);
        if (updatedData.isDeleted)   return await ReminderService.softDelete(id);
      }
      // Otherwise update fields
      const d = updatedData.dateTime ? new Date(updatedData.dateTime) : null;
      const payload = {};
      if (updatedData.title)    payload.message  = updatedData.title;
      if (updatedData.location !== undefined) payload.location = updatedData.location;
      if (d) {
        payload.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        payload.time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
      }
      if (updatedData.type) payload.type = updatedData.type;
      const data = await updateReminder(id, payload);
      return ReminderService._map(data.reminder);
    } catch (e) {
      console.error('ReminderService.update error:', e.message);
      throw e;
    }
  },

  // ── COMPLETE ─────────────────────────────────
  complete: async (id) => {
    try {
      // Backend uses PUT with closed flag — check your backend
      // If backend has no close endpoint use update:
      await updateReminder(id, { closed: true });
      await NotificationService.cancelForReminder(id);
    } catch (e) {
      console.error('ReminderService.complete error:', e.message);
    }
  },

  markComplete: async (id) => {
    return await ReminderService.complete(id);
  },

  // ── SOFT DELETE ──────────────────────────────
  delete: async (id) => {
    try {
      await deleteReminder(id);
      await NotificationService.cancelForReminder(id);
    } catch (e) {
      console.error('ReminderService.delete error:', e.message);
      throw e;
    }
  },

  softDelete: async (id) => {
    return await ReminderService.delete(id);
  },

  // ── RESTORE ──────────────────────────────────
  restore: async (id) => {
    try {
      // Backend restore — PUT with deleted: false
      const data = await updateReminder(id, { deleted: false });
      return ReminderService._map(data.reminder);
    } catch (e) {
      console.error('ReminderService.restore error:', e.message);
      throw e;
    }
  },

  // ── PERMANENT DELETE ─────────────────────────
  // Backend only has soft delete — permanent delete not in API docs
  // Keeping for UI compatibility, maps to soft delete
  deletePermanent: async (id) => {
    return await ReminderService.delete(id);
  },

  // ── FILTER (for voice assistant / query mode) ─
  filter: async (filters = {}) => {
    try {
      const userId = await ReminderService._getUserId();
      if (!userId) return [];
      const data = await filterReminders(userId, filters);
      return (data.reminders || []).map(ReminderService._map);
    } catch (e) {
      console.error('ReminderService.filter error:', e.message);
      return [];
    }
  },
};

export default ReminderService;