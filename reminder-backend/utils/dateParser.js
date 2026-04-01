const moment = require("moment");

function normalizeDate(dateStr) {
  if (!dateStr) return moment().format("YYYY-MM-DD");

  dateStr = dateStr.toLowerCase();

  if (dateStr.includes("tomorrow")) {
    return moment().add(1, "day").format("YYYY-MM-DD");
  }

  if (dateStr.includes("today")) {
    return moment().format("YYYY-MM-DD");
  }

  if (dateStr.includes("yesterday")) {
    return moment().subtract(1, "day").format("YYYY-MM-DD");
  }

  // If already valid date
  if (moment(dateStr, "YYYY-MM-DD", true).isValid()) {
    return dateStr;
  }

  // fallback
  return moment().format("YYYY-MM-DD");
}

module.exports = normalizeDate;