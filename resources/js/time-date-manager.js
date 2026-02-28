/**
 * Time & Date Manager
 * Handles temporal calculations and holiday management.
 * @module time-date-manager
 */

/**
 * Standard Italian holidays (fixed dates)
 */
const FIXED_HOLIDAYS = [
  { day: 1, month: 0, name: 'Capodanno' },
  { day: 6, month: 0, name: 'Epifania' },
  { day: 25, month: 3, name: 'Liberazione' },
  { day: 1, month: 4, name: 'Festa dei Lavoratori' },
  { day: 2, month: 5, name: 'Festa della Repubblica' },
  { day: 15, month: 7, name: 'Ferragosto' },
  { day: 1, month: 10, name: 'Ognissanti' },
  { day: 8, month: 11, name: 'Immacolata Concezione' },
  { day: 25, month: 11, name: 'Natale' },
  { day: 26, month: 11, name: 'Santo Stefano' }
];

const STORAGE_KEY = 'dashboard_user_holidays';
const easterCache = new Map();

/**
 * Checks if a date is a holiday.
 * @param {Date} date 
 * @returns {{name: string, type: 'official'|'user'}|null}
 */
export function isHoliday(date) {
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  // 1. Fixed Holidays
  const fixed = FIXED_HOLIDAYS.find(h => h.day === day && h.month === month);
  if (fixed) return { name: fixed.name, type: 'official' };

  // 2. Dynamic Holidays (Easter)
  if (!easterCache.has(year)) {
    const easter = calculateEaster(year);
    const monday = new Date(easter);
    monday.setDate(easter.getDate() + 1);
    easterCache.set(year, { 
      eDay: easter.getDate(), eMonth: easter.getMonth(),
      mDay: monday.getDate(), mMonth: monday.getMonth()
    });
  }
  const e = easterCache.get(year);
  if (day === e.eDay && month === e.eMonth) return { name: 'Pasqua', type: 'official' };
  if (day === e.mDay && month === e.mMonth) return { name: 'Lunedì dell\'Angelo', type: 'official' };

  // 3. User Holidays
  let userHolidays = [];
  try {
    userHolidays = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {}

  const user = userHolidays.find(h => h.day === day && h.month === month + 1 && h.name);
  if (user) return { name: user.name, type: 'user' };

  return null;
}

/**
 * Initialize time and date features
 */
export function initTimeDateManager() {
  setupCalculator();
  setupHolidays();
}

/**
 * --- Date Calculator Logic ---
 */
function setupCalculator() {
  const startInput = document.getElementById('date-start');
  const endInput = document.getElementById('date-end');
  const resultEl = document.getElementById('date-diff-result');

  if (!startInput || !endInput || !resultEl) return;

  const updateDiff = () => {
    const startStr = startInput.value.trim();
    const endStr = endInput.value.trim();

    if (!startStr || !endStr) {
      resultEl.textContent = 'Inserire le date';
      return;
    }

    const startDate = parseFlexibleDate(startStr);
    const endDate = parseFlexibleDate(endStr);

    if (!startDate || !endDate) {
      resultEl.textContent = 'errore input';
      return;
    }

    const diffMs = endDate - startDate;
    resultEl.textContent = formatDuration(diffMs);
  };

  startInput.addEventListener('input', updateDiff);
  endInput.addEventListener('input', updateDiff);
}

/**
 * Parses date strings in various formats.
 * Supports: 
 * - YYYY/MM/DD HH:MM
 * - DD/MM/YYYY HH:MM
 * - HH:MM (today)
 * - DD/MM/YYYY
 * - YYYY-MM-DD
 * @param {string} str 
 * @returns {Date|null}
 */
function parseFlexibleDate(str) {
  // Try HH:MM first (today)
  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (timeOnly) {
    const d = new Date();
    d.setHours(parseInt(timeOnly[1], 10), parseInt(timeOnly[2], 10), 0, 0);
    return d;
  }

  // Regex patterns
  const isoPattern = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/;
  const itPattern = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;

  let match = isoPattern.exec(str);
  if (match) {
    const [_, y, m, d, hh, mm] = match;
    const date = new Date(y, m - 1, d, hh || 0, mm || 0);
    if (date.getFullYear() == y && date.getMonth() == m - 1 && date.getDate() == d) {
      return date;
    }
    return null;
  }

  match = itPattern.exec(str);
  if (match) {
    const [_, d, m, y, hh, mm] = match;
    const date = new Date(y, m - 1, d, hh || 0, mm || 0);
    // Validation to handle cases like 31/02/2024
    if (date.getFullYear() == y && date.getMonth() == m - 1 && date.getDate() == d) {
      return date;
    }
    return null;
  }

  // Fallback to native - but very restrictive to avoid accidental wrong parses
  const timestamp = Date.parse(str);
  if (!isNaN(timestamp)) {
    // Check if it's too ambiguous (e.g. 01/02/03)
    // We prefer being strict.
    return new Date(timestamp);
  }

  return null;
}

/**
 * Formats duration in ms to human readable IT string
 * @param {number} ms 
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 0) return 'Data fine precedente a inizio';
  if (ms === 0) return 'Nessuna differenza';

  let remaining = Math.abs(ms);
  
  const DAYS_MS = 24 * 60 * 60 * 1000;
  const HOURS_MS = 60 * 60 * 1000;
  const MINS_MS = 60 * 1000;

  const days = Math.floor(remaining / DAYS_MS);
  remaining %= DAYS_MS;
  const hours = Math.floor(remaining / HOURS_MS);
  remaining %= HOURS_MS;
  const minutes = Math.floor(remaining / MINS_MS);

  const parts = [];
  if (days > 0) parts.push(`${days} giorn${days === 1 ? 'o' : 'i'}`);
  if (hours > 0) parts.push(`${hours} or${hours === 1 ? 'a' : 'e'}`);
  if (minutes > 0) parts.push(`${minutes} minut${minutes === 1 ? 'o' : 'i'}`);

  if (parts.length === 0) return 'meno di un minuto';

  // Join with Italian grammar
  if (parts.length === 1) return parts[0];
  const last = parts.pop();
  return `${parts.join(', ')} e ${last}`;
}

/**
 * --- Holiday Table Logic ---
 */
function setupHolidays() {
  const body = document.getElementById('holidays-body');
  if (!body) return;

  const renderTable = () => {
    body.innerHTML = '';
    const currentYear = new Date().getFullYear();
    const easter = calculateEaster(currentYear);
    const easterMonday = new Date(easter);
    easterMonday.setDate(easter.getDate() + 1);

    // 1. Add Easter and Easter Monday
    const dynamicHolidays = [
      { date: easter, name: 'Pasqua', type: 'dynamic' },
      { date: easterMonday, name: 'Lunedì dell\'Angelo', type: 'dynamic' }
    ];

    dynamicHolidays.forEach(h => {
      appendRow(body, h.date.getDate(), h.date.getMonth() + 1, h.name, 'Calculated');
    });

    // 2. Add Fixed Holidays
    FIXED_HOLIDAYS.forEach(h => {
      appendRow(body, h.day, h.month + 1, h.name, 'Fissa');
    });

    // 3. Add User Holidays (from localStorage or default 7 empty)
    let userHolidays = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      userHolidays = stored ? JSON.parse(stored) : [];
    } catch (e) {
      userHolidays = [];
    }

    // Ensure at least 7 slots are shown
    for (let i = 0; i < 7; i++) {
      const h = userHolidays[i] || { day: '', month: '', name: '' };
      appendUserRow(body, h.day || '', h.month || '', h.name || '', i);
    }
  };

  renderTable();
}

function appendRow(parent, day, month, name, type) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}</td>
    <td>${name}</td>
    <td class="holiday-type">${type}</td>
  `;
  parent.appendChild(tr);
}

function appendUserRow(parent, day, month, name, index) {
  const tr = document.createElement('tr');
  tr.className = 'user-holiday-row';
  tr.innerHTML = `
    <td>
      <input type="text" class="h-input-date" value="${day && month ? day+'/'+month : ''}" placeholder="GG/MM">
    </td>
    <td>
      <input type="text" class="h-input-name" value="${name}" placeholder="Nome evento">
    </td>
    <td>
      <button class="h-save-btn" data-index="${index}">Salva</button>
    </td>
  `;

  const saveBtn = tr.querySelector('.h-save-btn');
  saveBtn.onclick = () => saveUserHoliday(tr, index);

  parent.appendChild(tr);
}

function saveUserHoliday(row, index) {
  const dateStr = row.querySelector('.h-input-date').value.trim();
  const name = row.querySelector('.h-input-name').value.trim();
  
  const dateMatch = /^(\d{1,2})[/-](\d{1,2})$/.exec(dateStr);
  if (!dateMatch && dateStr !== '') {
    alert('Formato data non corretto (GG/MM)');
    return;
  }

  let userHolidays = [];
  try {
    userHolidays = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {}

  // Fill up to index if needed
  while (userHolidays.length <= index) userHolidays.push({});

  if (dateMatch) {
    userHolidays[index] = { day: parseInt(dateMatch[1], 10), month: parseInt(dateMatch[2], 10), name };
  } else {
    userHolidays[index] = { day: '', month: '', name: '' };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(userHolidays));
  
  const btn = row.querySelector('.h-save-btn');
  btn.textContent = 'OK';
  setTimeout(() => btn.textContent = 'Salva', 2000);
}

/**
 * Computus (Butcher's Algorithm)
 * @param {number} year 
 * @returns {Date}
 */
function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

// Initialise when the module is imported if needed, or explicitly call
initTimeDateManager();
