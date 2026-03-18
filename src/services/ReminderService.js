import Storage from '../utils/Storage';

const REMINDERS_KEY = 'reminders';

const ReminderService = {
  getAll: async () => {
    const reminders = await Storage.get(REMINDERS_KEY);
    return reminders || [];
  },

  getActive: async () => {
    const reminders = await ReminderService.getAll();
    return reminders.filter(r => !r.isDeleted);
  },

  add: async (reminder) => {
    const reminders = await ReminderService.getAll();
    const newReminder = {
      id: Date.now().toString(),
      title: reminder.title,
      description: reminder.description || '',
      location: reminder.location || '',
      dateTime: reminder.dateTime,
      isVoice: reminder.isVoice || false,
      isCompleted: false,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    reminders.push(newReminder);
    await Storage.set(REMINDERS_KEY, reminders);
    return newReminder;
  },

  update: async (id, updatedData) => {
    const reminders = await ReminderService.getAll();
    const index = reminders.findIndex(r => r.id === id);
    if (index !== -1) {
      reminders[index] = { ...reminders[index], ...updatedData };
      await Storage.set(REMINDERS_KEY, reminders);
      return reminders[index];
    }
    return null;
  },

  // Soft delete — moves to deleted section
  delete: async (id) => {
    const reminders = await ReminderService.getAll();
    const index = reminders.findIndex(r => r.id === id);
    if (index !== -1) {
      reminders[index].isDeleted = true;
      reminders[index].deletedAt = new Date().toISOString();
      await Storage.set(REMINDERS_KEY, reminders);
    }
  },

  // Permanent delete — removes forever
  deletePermanent: async (id) => {
    const reminders = await ReminderService.getAll();
    const filtered = reminders.filter(r => r.id !== id);
    await Storage.set(REMINDERS_KEY, filtered);
  },

  // Restore from deleted
  restore: async (id) => {
    return await ReminderService.update(id, {
      isDeleted: false,
      deletedAt: null,
    });
  },

  complete: async (id) => {
    return await ReminderService.update(id, { isCompleted: true });
  },

  getUpcoming: async () => {
    const reminders = await ReminderService.getAll();
    const now = new Date();
    return reminders
      .filter(r => !r.isCompleted && !r.isDeleted && new Date(r.dateTime) > now)
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  },

  getDeleted: async () => {
    const reminders = await ReminderService.getAll();
    return reminders
      .filter(r => r.isDeleted)
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  },
};

export default ReminderService;