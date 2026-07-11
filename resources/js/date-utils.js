/**
 * Shared date/time formatting helpers and Italian calendar names. @2026-07-09
 * @module date-utils
 */

export const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
export const monthNames = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];
export const monthShortNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export const weekdayNames = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
];

/**
 * Format a date object according to the specified format
 * @param {Date} date
 * @param {string} format - 'full', 'iso', or 'short'
 * @returns {string}
 */
export function formatDate(date, format) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const monthName = monthNames[date.getMonth()];
  const dayName = weekdayNames[date.getDay()];

  switch (format) {
    case "full":
      return `${dayName}\n${day} ${monthName} ${year}`;
    case "iso":
      return `${year}-${month}-${day}`;
    case "short":
      return `${day}/${month}/${year}`;
    default:
      return `${dayName}\n${day} ${monthName}`;
  }
}

export function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// --- CLOCK / TIME ---
export function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

export function formatElapsedCompact(fromTimestamp) {
  if (!fromTimestamp) return null;
  const elapsedMs = Math.max(0, Date.now() - fromTimestamp);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
