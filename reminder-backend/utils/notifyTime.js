const getNotifyTime = (reminder_time, notify_before) => {
  const date = new Date(reminder_time);

  if (notify_before === "1_hour") {
    date.setHours(date.getHours() - 1);
  } else if (notify_before === "1_day") {
    date.setDate(date.getDate() - 1);
  } else if (notify_before === "custom_30min") {
    date.setMinutes(date.getMinutes() - 30);
  }

  return date;
};

module.exports = { getNotifyTime };