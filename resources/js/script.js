import { getCookie, setCookie, deleteCookie } from './utils/cookies.js';
import { renderMoonPhase } from './moon.js';
import { isHoliday } from './time-date-manager.js';
import {
  registerCalendarView,
  initCalendarViews,
  getCalendarView,
} from './ui/calendar-views.js';
import { getTheme } from './ui/theme.js';

const monthsContainer = document.getElementById("months");
const flipClock = document.getElementById("flip-clock");
const clockWrap = document.getElementById("clock-wrap");
const analogClock = document.getElementById("analog-clock");
const hourHand = analogClock?.querySelector(".hand.hour");
const minuteHand = analogClock?.querySelector(".hand.minute");
const fxPriceEl = document.getElementById("fx-price");
const fxChangeEl = document.getElementById("fx-change");
const fxUpdatedEl = document.getElementById("fx-updated");
const fxChartEl = document.getElementById("fx-chart");
const fxMiniChartEl = document.getElementById("fx-mini-chart");
const fxStatusEl = document.getElementById("fx-status");
const fxCardEl = document.querySelector(".fx-card");
const fxKeyForm = document.getElementById("fx-key-form");
const fxKeyInput = document.getElementById("freecurrency-key");
const fxKeyStatus = document.getElementById("fx-key-status");
const fxIndicator = document.getElementById("fx-api-status");
const networkStatusEl = document.getElementById("network-status");
const fxKeyClearBtn = document.getElementById("clear-freecurrency-key");
const fxKeyToggleBtn = document.getElementById("toggle-freecurrency-key");
const fxKeyCopyBtn = document.getElementById("copy-freecurrency-key");
const gistKeyForm = document.getElementById("gist-key-form");
const gistKeyInput = document.getElementById("gist-token");
const gistKeyStatus = document.getElementById("gist-key-status");
const gistKeyClearBtn = document.getElementById("clear-gist-token");
const gistKeyToggleBtn = document.getElementById("toggle-gist-token");
const gistKeyCopyBtn = document.getElementById("copy-gist-token");
const gistUrlInput = document.getElementById("gist-url");
const gistUrlStatus = document.getElementById("gist-url-status");
const saveGistUrlBtn = document.getElementById("save-gist-url");
const clearGistUrlBtn = document.getElementById("clear-gist-url");
const gistUrlToggleBtn = document.getElementById("toggle-gist-url");
const gistUrlCopyBtn = document.getElementById("copy-gist-url");
const settingsRuntimeGridEl = document.getElementById("settings-runtime-grid");
const calendarContextMenu = document.createElement("div");

let fxHistory = null;
let fxChartSize = { width: 0, height: 0 };
let fxMiniSize = { width: 0, height: 0 };
let fxChartEntries = [];
let fxHoverIndex = null;
let gistToken = null;
const fxSessionKey = "fxLatestSession";
const freeCurrencyCookieKey = "freeCurrencyApiKey";
const gistTokenCookieKey = "githubGistToken";
const gistUrlCookieKey = "dashboardGistUrl";

const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const monthNames = [
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

const weekdayNames = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
];

let currentOverviewYear = new Date().getFullYear();
let startOffset = -1;
const visibleMonths = 6;
let isScrolling = false;
let calendarMenuDate = null;

// --- CALENDAR CONTEXT MENU ---
calendarContextMenu.className = "calendar-context-menu";
calendarContextMenu.innerHTML = `
  <div class="calendar-context-header" data-calendar-header></div>
  <div class="calendar-context-divider"></div>
  <button type="button" data-calendar-action="check">Controlla</button>
  <button type="button" data-calendar-action="add">Aggiungi</button>
  <button type="button" data-calendar-action="delete">Cancella</button>
  <button type="button" data-calendar-action="settings">Impostazioni</button>
`;
document.body.appendChild(calendarContextMenu);

// --- DATE FORMAT CONTEXT MENU ---
const dateFormatMenu = document.createElement("div");
dateFormatMenu.className = "date-format-menu";
dateFormatMenu.innerHTML = `
  <button type="button" data-format="full">Domenica 22 Febbraio 2026</button>
  <button type="button" data-format="iso">2026-02-22</button>
  <button type="button" data-format="short">22/02/2026</button>
`;
document.body.appendChild(dateFormatMenu);

// --- CALENDARIO ---
function getMonthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function addDays(date, offset) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + offset);
  return newDate;
}

function startOfISOWeek(date) {
  const newDate = new Date(date);
  const day = (newDate.getDay() + 6) % 7;
  newDate.setDate(newDate.getDate() - day);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

function endOfISOWeek(date) {
  const start = startOfISOWeek(date);
  return addDays(start, 6);
}

function getISOWeekNumber(date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (temp.getUTCDay() + 6) % 7;
  temp.setUTCDate(temp.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(temp.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const diff = temp - firstThursday;
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

function buildMonthCard(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = new Date();
  const todayKey = getMonthKey(today);

  const card = document.createElement("div");
  card.className = "month-card";

  const title = document.createElement("div");
  title.className = "month-title";
  const name = document.createElement("span");
  name.textContent = `${monthNames[month]} ${year}`;
  
  const isCurrentMonth = getMonthKey(date) === todayKey;
  if (isCurrentMonth) {
    card.classList.add("current-month");
  }

  const indicator = document.createElement("span");
  indicator.textContent = isCurrentMonth ? "•" : "";
  title.append(name, indicator);

  const weekdays = document.createElement("div");
  weekdays.className = "weekdays";
  const weekSpacer = document.createElement("span");
  weekSpacer.className = "week-label";
  weekSpacer.textContent = "s.";
  weekdays.appendChild(weekSpacer);
  weekdayLabels.forEach((label, index) => {
    const span = document.createElement("span");
    span.textContent = label;
    if (index === 5 || index === 6) {
      span.classList.add("weekend-header");
    }
    weekdays.appendChild(span);
  });

  const daysGrid = document.createElement("div");
  daysGrid.className = "days";

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const start = startOfISOWeek(firstDay);
  const end = endOfISOWeek(lastDay);

  let current = new Date(start);
  let weekCount = 0;

  while (current <= end) {
    weekCount++;
    const weekCell = document.createElement("div");
    weekCell.className = "week-number";
    // Check if this is the current week
    const currentWeekNumber = getISOWeekNumber(current);
    const todayWeekNumber = getISOWeekNumber(today);
    const isCurrentWeek =
      currentWeekNumber === todayWeekNumber &&
      current.getFullYear() === today.getFullYear();
    // Create dot indicator for current week
    if (isCurrentWeek) {
      const dot = document.createElement("span");
      dot.textContent = "• ";
      dot.className = "week-dot";
      weekCell.appendChild(dot);
    }
    const weekNumberText = document.createElement("span");
    weekNumberText.textContent = getISOWeekNumber(current);
    weekCell.appendChild(weekNumberText);
    daysGrid.appendChild(weekCell);

    for (let i = 0; i < 7; i += 1) {
      const dayDate = addDays(current, i);
      const cell = document.createElement("div");
      cell.className = "day";

      if (dayDate.getDay() === 0 || dayDate.getDay() === 6) {
        cell.classList.add("weekend-day");
      }

      if (dayDate.getMonth() !== month) {
        cell.classList.add("out-of-month");
        cell.textContent = "";
      } else {
        cell.textContent = dayDate.getDate();
        cell.dataset.date = formatDateLocal(dayDate);

        // Holiday Check
        const holiday = isHoliday(dayDate);
        if (holiday) {
          if (holiday.type === 'official') {
            cell.classList.add("holiday-day");
          } else {
            cell.classList.add("user-event-day");
          }
          cell.title = holiday.name;
        }

        // Sunday Check
        if (dayDate.getDay() === 0) {
          cell.classList.add("sunday-red");
        }

        cell.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          calendarMenuDate = new Date(dayDate.getTime());
          showCalendarContextMenu(event.clientX, event.clientY, calendarMenuDate);
        });
      }

      if (
        dayDate.getMonth() === month &&
        dayDate.getDate() === today.getDate() &&
        dayDate.getMonth() === today.getMonth() &&
        dayDate.getFullYear() === today.getFullYear()
      ) {
        cell.classList.add("today");
      }

      daysGrid.appendChild(cell);
    }

    current = addDays(current, 7);
  }

  card.classList.add(`weeks-${weekCount}`);

  card.append(title, weekdays, daysGrid);
  return card;
}

function renderMonths() {
  monthsContainer.innerHTML = "";
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (let i = 0; i < visibleMonths; i += 1) {
    // Logic fix: We explicitly calculate the target year/month and pick the 1st day.
    // This avoids "Feb skip" bug when today is 29th, 30th, 31st.
    const targetMonthIndex = currentMonth + startOffset + i;

    // new Date(y, m, 1) handles month overflow/underflow correctly
    const date = new Date(currentYear, targetMonthIndex, 1);

    monthsContainer.appendChild(buildMonthCard(date));
  }

  // Update navigation indicator
  const navIndicator = document.getElementById("calendar-nav-indicator");
  if (navIndicator) {
    if (startOffset > 0) {
      navIndicator.textContent = "↑";
      navIndicator.title = "Oggi è prima delle date visualizzate";
    } else if (startOffset < -(visibleMonths - 1)) {
      navIndicator.textContent = "↓";
      navIndicator.title = "Oggi è dopo le date visualizzate";
    } else {
      navIndicator.textContent = "•";
      navIndicator.title = "Oggi è tra le date visualizzate";
    }
  }
}

/**
 * Render a compact year overview showing all 12 months at a glance.
 * Each month shows a minimal day grid with today highlighted.
 * @param {HTMLElement} container
 */
function renderYearOverview(container) {
  container.innerHTML = "";
  const now = new Date();
  const year = currentOverviewYear;

  const yearWrap = document.createElement("div");
  yearWrap.className = "year-overview";

  const yearTitle = document.createElement("div");
  yearTitle.className = "year-title";

  const prevBtn = document.createElement("button");
  prevBtn.className = "year-nav-btn";
  prevBtn.textContent = "‹";
  prevBtn.onclick = () => {
    currentOverviewYear--;
    renderYearOverview(container);
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "year-nav-btn";
  nextBtn.textContent = "›";
  nextBtn.onclick = () => {
    currentOverviewYear++;
    renderYearOverview(container);
  };

  const yearLabel = document.createElement("span");
  yearLabel.className = "year-label-text";
  yearLabel.textContent = year + " - " + (year + 1);
  yearLabel.onclick = () => {
    currentOverviewYear = now.getFullYear();
    renderYearOverview(container);
  };

  yearTitle.appendChild(prevBtn);
  yearTitle.appendChild(yearLabel);
  yearTitle.appendChild(nextBtn);
  yearWrap.appendChild(yearTitle);

  const grid = document.createElement("div");
  grid.className = "year-grid";

  // Render 24 months (2 full years) starting from currentOverviewYear
  for (let m = 0; m < 24; m++) {
    const currentYear = year + Math.floor(m / 12);
    const monthIndex = m % 12;

    const mini = document.createElement("div");
    mini.className = "year-month-mini";

    const label = document.createElement("div");
    label.className = "year-month-label";
    // Show month name and year if it's the second year
    label.textContent = monthNames[monthIndex].substring(0, 3) + " " + currentYear;
    
    if (monthIndex === now.getMonth() && currentYear === now.getFullYear()) {
      label.classList.add("current");
    }
    mini.appendChild(label);

    const daysWrap = document.createElement("div");
    daysWrap.className = "year-days";

    const firstDay = new Date(currentYear, monthIndex, 1);
    const lastDay = new Date(currentYear, monthIndex + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

    // Empty cells for offset
    for (let s = 0; s < startDow; s++) {
      const spacer = document.createElement("span");
      spacer.className = "year-day empty";
      daysWrap.appendChild(spacer);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dayEl = document.createElement("span");
      dayEl.className = "year-day";
      dayEl.textContent = d;
      
      const dow = new Date(currentYear, monthIndex, d).getDay();
      if (dow === 0 || dow === 6) dayEl.classList.add("weekend");
      
      if (d === now.getDate() && monthIndex === now.getMonth() && currentYear === now.getFullYear()) {
        dayEl.classList.add("today");
      }
      daysWrap.appendChild(dayEl);
    }

    mini.appendChild(daysWrap);
    grid.appendChild(mini);
  }

  yearWrap.appendChild(grid);
  container.appendChild(yearWrap);
}


function handleWheel(event) {
  event.preventDefault();
  // Only scroll months in grid view
  if (getCalendarView() !== 'grid') return;
  if (isScrolling) return;

  isScrolling = true;
  startOffset += event.deltaY > 0 ? 1 : -1;
  renderMonths();

  setTimeout(() => {
    isScrolling = false;
  }, 120);
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    5
  );
  const timeout = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    renderMonths();
    renderMoonPhase();
    updateDateDisplay();
    scheduleMidnightRefresh();
  }, timeout);
}

function scheduleFxHistoryRefresh() {
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    17,
    5,
    0
  );
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  const timeout = target.getTime() - now.getTime();

  setTimeout(() => {
    fetchFxHistory();
    scheduleFxHistoryRefresh();
  }, timeout);
}

/**
 * Format a date object according to the specified format
 * @param {Date} date
 * @param {string} format - 'full', 'iso', or 'short'
 * @returns {string}
 */
function formatDate(date, format) {
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

/**
 * Update the date display in the time-panel
 */
function updateDateDisplay() {
  const dateDisplayEl = document.querySelector(".date-display-text");
  if (dateDisplayEl) {
    const now = new Date();
    dateDisplayEl.textContent = formatDate(now, "full");
  }
}

function updateClock() {
  if (!flipClock) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const hourEl = flipClock.querySelector('[data-unit="hours"] .flip-value');
  const minuteEl = flipClock.querySelector('[data-unit="minutes"] .flip-value');

  if (hourEl && hourEl.textContent !== hours) {
    const unit = hourEl.closest(".flip-unit");
    hourEl.textContent = hours;
    if (unit) {
      unit.classList.remove("flip-animate");
      void unit.offsetWidth;
      unit.classList.add("flip-animate");
    }
  }

  if (minuteEl && minuteEl.textContent !== minutes) {
    const unit = minuteEl.closest(".flip-unit");
    minuteEl.textContent = minutes;
    if (unit) {
      unit.classList.remove("flip-animate");
      void unit.offsetWidth;
      unit.classList.add("flip-animate");
    }
  }

  if (hourHand && minuteHand) {
    const hourValue = now.getHours() % 12;
    const minuteValue = now.getMinutes();
    const hourDeg = (hourValue + minuteValue / 60) * 30;
    const minuteDeg = minuteValue * 6;
    hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
    minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
  }
}

function scheduleMinuteRefresh() {
  const now = new Date();
  const nextMinute = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes() + 1,
    1
  );
  const timeout = nextMinute.getTime() - now.getTime();

  setTimeout(() => {
    updateClock();
    scheduleMinuteRefresh();
  }, timeout);
}

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarLabel(date) {
  const weekday = weekdayNames[date.getDay()] || "";
  const month = monthNames[date.getMonth()] || "";
  return `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}`;
}

function showCalendarContextMenu(x, y, date) {
  const header = calendarContextMenu.querySelector("[data-calendar-header]");
  if (header) {
    header.textContent = formatCalendarLabel(date);
  }
  calendarContextMenu.style.left = `${x}px`;
  calendarContextMenu.style.top = `${y}px`;
  calendarContextMenu.classList.add("is-visible");
}

function hideCalendarContextMenu() {
  calendarContextMenu.classList.remove("is-visible");
}

// --- CLOCK / TIME ---
function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

function formatElapsedCompact(fromTimestamp) {
  if (!fromTimestamp) return null;
  const elapsedMs = Math.max(0, Date.now() - fromTimestamp);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

// --- FX HELPERS / API KEYS ---
// --- FX CACHE (SESSION) ---

function getFreeCurrencyCookieKey() {
  const persistedKey = getCookie(freeCurrencyCookieKey);
  if (persistedKey) return persistedKey.trim();

  const sessionKey = sessionStorage.getItem(freeCurrencyCookieKey);
  if (!sessionKey) return null;

  const trimmedSessionKey = sessionKey.trim();
  const oneYear = 60 * 60 * 24 * 365;
  setCookie(freeCurrencyCookieKey, trimmedSessionKey, oneYear);
  sessionStorage.removeItem(freeCurrencyCookieKey);
  return trimmedSessionKey;
}

function setFreeCurrencyCookieKey(key) {
  if (!key) return;
  const oneYear = 60 * 60 * 24 * 365;
  setCookie(freeCurrencyCookieKey, key, oneYear);
}

function clearFreeCurrencyCookieKey() {
  deleteCookie(freeCurrencyCookieKey);
  sessionStorage.removeItem(freeCurrencyCookieKey);
}

function maskApiKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}••••${tail}`;
}

function syncSensitiveInputValue(inputEl, storedValue) {
  if (!inputEl) return;
  const isEditingThisField = document.activeElement === inputEl && inputEl.value.trim();
  if (isEditingThisField) return;
  inputEl.value = storedValue || "";
  if (inputEl.type !== "password" && !storedValue) {
    inputEl.type = "password";
  }
}

function syncRevealButtonState(buttonEl, inputEl) {
  if (!buttonEl || !inputEl) return;
  const isVisible = inputEl.type === "text";
  buttonEl.textContent = isVisible ? "🙈" : "👁";
  buttonEl.title = isVisible ? "Nascondi" : "Mostra";
  buttonEl.setAttribute("aria-label", isVisible ? "Nascondi valore" : "Mostra valore");
}

function setupRevealToggle(buttonEl, inputEl) {
  if (!buttonEl || !inputEl) return;
  syncRevealButtonState(buttonEl, inputEl);
  buttonEl.addEventListener("click", () => {
    inputEl.type = inputEl.type === "password" ? "text" : "password";
    syncRevealButtonState(buttonEl, inputEl);
  });
}

function setupCopyButton(buttonEl, getValue, statusEl, successText) {
  if (!buttonEl) return;
  buttonEl.addEventListener("click", async () => {
    const value = typeof getValue === "function" ? String(getValue() || "").trim() : "";
    if (!value) {
      if (statusEl) statusEl.textContent = "Nessun valore da copiare.";
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (statusEl) statusEl.textContent = successText;
    } catch {
      if (statusEl) statusEl.textContent = "Copia non disponibile in questa sessione.";
    }
  });
}

function renderSettingsRuntime(rows) {
  if (!settingsRuntimeGridEl) return;
  settingsRuntimeGridEl.innerHTML = rows
    .map(
      ({ key, value }) =>
        `<div class="runtime-row"><span class="runtime-key">${key}</span><span class="runtime-value">${value}</span></div>`
    )
    .join("");
}

function getExecutionModeLabel() {
  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
  const isDev = args.some(
    (arg) => arg === "--neu-dev-extension" || arg === "--neu-dev-auto-reload" || arg === "--debug-mode"
  );
  return isDev ? "Debug (neu run)" : "Eseguibile (release)";
}

async function updateSettingsRuntimeInfo() {
  const neutralinoAvailable = !!window.Neutralino?.app?.getConfig;
  const fallbackRows = [
    { key: "Modalità", value: getExecutionModeLabel() },
    { key: "Neutralino", value: window.NL_CVERSION ? `client ${window.NL_CVERSION}` : "n/d" },
    { key: "Piattaforma", value: navigator.userAgent || navigator.platform || "n/d" },
    { key: "Origin", value: window.location.origin || "n/d" },
    { key: "Storage dati", value: "Cookie + IndexedDB (scope per origin)" },
    {
      key: "Sessione",
      value: `cookies ${document.cookie ? document.cookie.split(";").filter(Boolean).length : 0}, indexedDB ${
        "indexedDB" in window ? "ok" : "n/a"
      }`,
    },
  ];

  if (!neutralinoAvailable) {
    renderSettingsRuntime(fallbackRows);
    return;
  }

  try {
    const [config, osInfo, arch, dataPath] = await Promise.all([
      window.Neutralino.app.getConfig(),
      window.Neutralino.computer?.getOSInfo?.().catch(() => null),
      window.Neutralino.computer?.getArch?.().catch(() => null),
      window.Neutralino.os?.getPath?.("data").catch(() => null),
    ]);

    renderSettingsRuntime([
      { key: "Modalità", value: getExecutionModeLabel() },
      {
        key: "Neutralino",
        value: `client ${window.NL_CVERSION || config?.cli?.clientVersion || "n/d"} · binary ${
          config?.cli?.binaryVersion || "n/d"
        }`,
      },
      {
        key: "Piattaforma",
        value: `${osInfo?.name || window.NL_OS || "n/d"} ${osInfo?.version || ""} ${arch || ""}`.trim(),
      },
      { key: "Origin", value: `${window.location.origin} (port ${window.NL_PORT || config?.port || "n/d"})` },
      {
        key: "Storage dati",
        value: `${dataPath || "n/d"} · Cookie/IndexedDB legati a origin`,
      },
      {
        key: "Sessione",
        value: `tokenSecurity ${config?.tokenSecurity || "n/d"} · cookies ${
          document.cookie ? document.cookie.split(";").filter(Boolean).length : 0
        } · indexedDB ${"indexedDB" in window ? "ok" : "n/a"}`,
      },
    ]);
  } catch {
    renderSettingsRuntime(fallbackRows);
  }
}

function updateFxKeyStatus() {
  const stored = getFreeCurrencyCookieKey();
  syncSensitiveInputValue(fxKeyInput, stored);
  if (fxKeyStatus) {
    if (stored) {
      fxKeyStatus.textContent = `Chiave salvata (${maskApiKey(stored)}).`;
    } else {
      fxKeyStatus.textContent = "Nessuna chiave salvata.";
    }
  }
  if (fxIndicator) {
    fxIndicator.classList.toggle("active", !!stored);
  }
}

// --- GITHUB GIST TOKEN ---
function getGistCookieKey() {
  const key = getCookie(gistTokenCookieKey);
  return key ? key.trim() : null;
}

function setGistCookieKey(key) {
  if (!key) return;
  const oneYear = 60 * 60 * 24 * 365;
  setCookie(gistTokenCookieKey, key, oneYear);
}

function clearGistCookieKey() {
  deleteCookie(gistTokenCookieKey);
}

function updateGistKeyStatus() {
  const stored = getGistCookieKey();
  syncSensitiveInputValue(gistKeyInput, stored);
  if (gistKeyStatus) {
    if (stored) {
      gistKeyStatus.textContent = `Token salvato (${maskApiKey(stored)}).`;
    } else {
      gistKeyStatus.textContent = "Nessun token salvato.";
    }
  }
}

// --- GITHUB GIST URL ---
function getGistUrlCookie() {
  const url = getCookie(gistUrlCookieKey);
  return url ? url.trim() : null;
}

function setGistUrlCookie(url) {
  if (!url) return;
  const oneYear = 60 * 60 * 24 * 365;
  setCookie(gistUrlCookieKey, url, oneYear);
}

function clearGistUrlCookie() {
  deleteCookie(gistUrlCookieKey);
}

function updateGistUrlStatus() {
  const stored = getGistUrlCookie();
  syncSensitiveInputValue(gistUrlInput, stored);
  if (gistUrlStatus) {
    if (stored) {
      gistUrlStatus.textContent = "URL Gist salvato.";
    } else {
      gistUrlStatus.textContent = "Nessun URL salvato.";
    }
  }
}

function getCachedSessionRate() {
  const raw = getCookie(fxSessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedSessionRate(rate) {
  const payload = {
    rate,
    ts: Date.now(),
  };
  setCookie(fxSessionKey, JSON.stringify(payload), 3600);
}

function isCacheFresh(payload) {
  if (!payload?.ts) return false;
  const ageMs = Date.now() - payload.ts;
  return ageMs < 60 * 60 * 1000;
}

function getBestLocalFxSnapshot() {
  const cached = getCachedSessionRate();
  if (cached && Number.isFinite(cached.rate) && Number.isFinite(cached.ts)) {
    return { rate: cached.rate, ts: cached.ts };
  }

  const intraday = getIntradayCache();
  if (!intraday?.points?.length) return null;
  const lastPoint = intraday.points[intraday.points.length - 1];
  if (!lastPoint || !Number.isFinite(lastPoint.r)) return null;
  const ts = new Date(lastPoint.t).getTime();
  if (!Number.isFinite(ts)) return null;
  return { rate: lastPoint.r, ts };
}

function updateNetworkStatus(lastDataTimestamp = null) {
  if (!networkStatusEl) return;
  const online = navigator.onLine;
  networkStatusEl.classList.toggle("online", online);
  networkStatusEl.classList.toggle("offline", !online);

  if (online) {
    networkStatusEl.textContent = "Online";
    return;
  }

  if (!lastDataTimestamp) {
    networkStatusEl.textContent = "Offline · no data";
    return;
  }

  const age = formatElapsedCompact(lastDataTimestamp);
  networkStatusEl.textContent = age ? `Offline · dati vecchi ${age}` : "Offline · dati vecchi";
}

function applyFxSnapshot(snapshot, stale = false) {
  if (!snapshot || !Number.isFinite(snapshot.rate)) return false;
  const when = Number.isFinite(snapshot.ts) ? new Date(snapshot.ts) : new Date();
  fxPriceEl.textContent = snapshot.rate.toFixed(4);

  const staleSuffix = stale
    ? ` · dati vecchi ${formatElapsedCompact(when.getTime()) || ""}`.trimEnd()
    : "";
  fxUpdatedEl.textContent = `Aggiornamento: ${formatDate(when)} ${formatTime(when)}${staleSuffix}`;

  if (fxStatusEl) {
    fxStatusEl.classList.toggle("cached", stale);
  }
  addIntradayPoint(snapshot.rate);
  updateNetworkStatus(when.getTime());
  return true;
}

// --- FX API KEY (SESSIONE UTENTE) ---

// --- FX PAYLOAD PARSING ---
// Extract a numeric USD rate from multiple provider payload shapes
function extractRateFromPayload(payload) {
  if (!payload) return null;
  // FreeCurrencyAPI v1: { data: { USD: 1.123 } }
  if (payload.data && typeof payload.data.USD !== 'undefined') return parseFloat(payload.data.USD);
  // FreeCurrencyAPI newer shape: { data: { USD: { value: 1.123 } } }
  if (payload.data && payload.data.USD && typeof payload.data.USD === 'object') {
    const usdObj = payload.data.USD;
    if (typeof usdObj.value !== 'undefined') return parseFloat(usdObj.value);
    if (typeof usdObj.rate !== 'undefined') return parseFloat(usdObj.rate);
    if (typeof usdObj.amount !== 'undefined') return parseFloat(usdObj.amount);
  }
  // If FreeCurrencyAPI returned a full `data` map (base may be USD by default),
  // compute EUR->USD as USD / EUR when both present.
  if (payload.data && typeof payload.data.USD !== 'undefined' && typeof payload.data.EUR !== 'undefined') {
    const usd = parseFloat(payload.data.USD);
    const eur = parseFloat(payload.data.EUR);
    if (!isNaN(usd) && !isNaN(eur) && eur !== 0) return usd / eur;
  }
  // exchange-rate style: { rates: { USD: 1.123 } }
  if (payload.rates && typeof payload.rates.USD !== 'undefined') return parseFloat(payload.rates.USD);
  // alternate nesting: { data: { rates: { USD: 1.123 } } }
  if (payload.data && payload.data.rates && typeof payload.data.rates.USD !== 'undefined') return parseFloat(payload.data.rates.USD);
  if (payload['Realtime Currency Exchange Rate'] && payload['Realtime Currency Exchange Rate']['5. Exchange Rate']) {
    return parseFloat(payload['Realtime Currency Exchange Rate']['5. Exchange Rate']);
  }
  // Some APIs return nested `result` or similar structures
  if (payload.result && payload.result.rates && typeof payload.result.rates.USD !== 'undefined') return parseFloat(payload.result.rates.USD);
  if (payload.result && typeof payload.result.USD !== 'undefined') return parseFloat(payload.result.USD);
  // Direct USD field
  if (typeof payload.USD !== 'undefined') return parseFloat(payload.USD);
  return null;
}

// --- FX INTRADAY CACHE ---
function getIntradayCache() {
  const raw = localStorage.getItem("fxIntraday");
  if (!raw) return { date: formatDate(new Date()), points: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { date: formatDate(new Date()), points: [] };
  }
}

function setIntradayCache(cache) {
  localStorage.setItem("fxIntraday", JSON.stringify(cache));
}

function addIntradayPoint(rate) {
  if (!rate) return;
  const now = new Date();
  const todayKey = formatDate(now);
  const cache = getIntradayCache();
  if (cache.date !== todayKey) {
    cache.date = todayKey;
    cache.points = [];
  }
  const hourKey = `${todayKey}T${String(now.getHours()).padStart(2, "0")}:00`;
  const existing = cache.points.findIndex((p) => p.t === hourKey);
  const point = { t: hourKey, r: rate };
  if (existing >= 0) {
    cache.points[existing] = point;
  } else {
    cache.points.push(point);
  }
  cache.points = cache.points.slice(-24);
  setIntradayCache(cache);
  drawFxMiniChart();
}

// --- FX HISTORY CACHE ---
function getHistoryRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);
  return { start: formatDateLocal(start), end: formatDateLocal(end) };
}

function readCachedHistory() {
  const raw = localStorage.getItem("fxHistory");
  const updated = localStorage.getItem("fxHistoryUpdated");
  if (!raw || !updated) return null;
  return { data: JSON.parse(raw), updated };
}

function cacheHistory(data) {
  localStorage.setItem("fxHistory", JSON.stringify(data));
  localStorage.setItem("fxHistoryUpdated", formatDate(new Date()));
}

// --- FX HISTORY FETCH/DERIVED ---
function updateFxTrend() {
  if (!fxChangeEl || !fxHistory) return;
  const sortedDates = Object.keys(fxHistory).sort();
  if (sortedDates.length < 2) return;
  const latestDate = sortedDates[sortedDates.length - 1];
  const prevDate = sortedDates[sortedDates.length - 2];
  const latestRate = fxHistory[latestDate]?.USD;
  const prevRate = fxHistory[prevDate]?.USD;
  if (!latestRate || !prevRate) return;
  const diff = latestRate - prevRate;
  const pct = (diff / prevRate) * 100;
  const sign = diff >= 0 ? "+" : "";
  fxChangeEl.textContent = `Frankfurter: ${latestRate.toFixed(4)} · Δ ${sign}${diff.toFixed(
    4
  )} (${sign}${pct.toFixed(2)}%)`;
  fxChangeEl.classList.toggle("negative", diff < 0);
}

async function fetchFxHistory() {
  try {
    const { start, end } = getHistoryRange();
    const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=USD`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Errore richiesta FX history");
    const data = await response.json();
    fxHistory = data.rates;
    cacheHistory(fxHistory);
    drawFxChart();
    updateFxTrend();
  } catch (error) {
    console.error(error);
    if (fxChangeEl) {
      fxChangeEl.textContent = "Grafico FX non disponibile";
      fxChangeEl.classList.add("negative");
    }
  }
}

function ensureFxHistory() {
  const cached = readCachedHistory();
  const todayKey = formatDate(new Date());
  if (cached) {
    fxHistory = cached.data;
    drawFxChart();
    updateFxTrend();
    if (cached.updated !== todayKey) {
      fetchFxHistory();
    }
  } else {
    fetchFxHistory();
  }
}

// --- FX LATEST FETCH ---
async function fetchFxLatest() {
  if (!fxPriceEl || !fxChangeEl || !fxUpdatedEl) return;
  try {
    const localSnapshot = getBestLocalFxSnapshot();
    updateNetworkStatus(localSnapshot?.ts || null);

    if (!navigator.onLine) {
      if (!applyFxSnapshot(localSnapshot, true) && fxUpdatedEl) {
        fxUpdatedEl.textContent = "Aggiornamento: offline, nessun dato locale";
      }
      return;
    }

    if (fxStatusEl) fxStatusEl.classList.remove("cached");

    // Check local session cache (1 hour duration)
    const cached = getCachedSessionRate();
    if (cached && isCacheFresh(cached)) {
      applyFxSnapshot({ rate: cached.rate, ts: cached.ts }, true);
      return;
    }
    // Prefer FreeCurrencyAPI (key inserita dall'utente in questa sessione)
    let rate = null;
    try {
      const freeKey = getFreeCurrencyCookieKey();
      if (freeKey) {
        const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${encodeURIComponent(
          freeKey
        )}&base_currency=EUR&currencies=USD`;
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            const payload = await resp.json();
            rate = extractRateFromPayload(payload);
          } else {
            console.warn('FreeCurrencyAPI responded', resp.status);
          }
        } catch (err) {
          console.warn('FreeCurrencyAPI fetch failed', err);
        }
      }

      if (!rate || isNaN(rate)) {
        console.warn('No rate retrieved from FreeCurrencyAPI');
        applyFxSnapshot(localSnapshot, true);
        return; // nothing to show
      }

      setCachedSessionRate(rate);
      applyFxSnapshot({ rate, ts: Date.now() }, false);
    } catch (err) {
      console.error(err);
      applyFxSnapshot(localSnapshot, true);
    }
  } catch (error) {
    console.error(error);
    const localSnapshot = getBestLocalFxSnapshot();
    applyFxSnapshot(localSnapshot, true);
  }
}

// --- FX CHART (ANNUAL) ---
function resizeFxChart() {
  if (!fxChartEl) return;
  const container = fxChartEl.parentElement;
  if (!container) return;
  const styles = window.getComputedStyle(container);
  const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const targetWidth = Math.max(0, container.clientWidth - paddingX);
  const targetHeight = Math.max(0, container.clientHeight - paddingY);
  if (targetWidth === fxChartSize.width && targetHeight === fxChartSize.height) return;

  const ratio = window.devicePixelRatio || 1;
  fxChartEl.width = targetWidth * ratio;
  fxChartEl.height = targetHeight * ratio;
  fxChartEl.style.height = `${targetHeight}px`;
  fxChartEl.style.width = `${targetWidth}px`;
  fxChartSize = { width: targetWidth, height: targetHeight };
  drawFxChart();
}

function drawFxChart() {
  if (!fxChartEl || !fxHistory) return;
  const ctx = fxChartEl.getContext("2d");
  if (!ctx) return;

  // Determine if current theme is light or dark
  const currentTheme = getTheme();
  const isLight = currentTheme === 'light' || currentTheme === 'mac1990';

  // Define colors based on theme type
  const colors = {
    grid: isLight ? 'rgba(0, 50, 100, 0.08)' : 'rgba(122, 166, 194, 0.12)',
    line: isLight ? '#3a7db8' : '#7aa6c2',
    hoverLine: isLight ? 'rgba(58, 125, 184, 0.3)' : 'rgba(155, 179, 168, 0.5)',
    indicator: isLight ? '#2a69a3' : '#7aa6c2',
    tooltipBg: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(16, 25, 32, 0.9)',
    tooltipBorder: isLight ? 'rgba(58, 125, 184, 0.4)' : 'rgba(122, 166, 194, 0.6)',
    tooltipText: isLight ? '#1a3050' : '#e7f0f6',
    avgLine: isLight ? 'rgba(78, 138, 114, 0.6)' : 'rgba(155, 179, 168, 0.75)'
  };

  const ratio = window.devicePixelRatio || 1;
  const width = fxChartEl.width;
  const height = fxChartEl.height;
  ctx.clearRect(0, 0, width, height);

  const entries = Object.entries(fxHistory)
    .map(([date, value]) => {
      const raw = value?.USD;
      const rate = typeof raw === "number" ? raw : parseFloat(raw);
      return { date, rate };
    })
    .filter((entry) => Number.isFinite(entry.rate))
    .sort((a, b) => a.date.localeCompare(b.date));

  fxChartEntries = entries;

  if (!entries.length) return;

  const rates = entries.map((entry) => entry.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const padding = 22 * ratio;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const scaleX = chartWidth / (entries.length - 1);
  const scaleY = chartHeight / (max - min || 1);

  const gridSteps = 6;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1 * ratio;
  for (let i = 0; i <= gridSteps; i += 1) {
    const y = padding + (chartHeight / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  for (let i = 0; i <= gridSteps; i += 1) {
    const x = padding + (chartWidth / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2 * ratio;
  ctx.beginPath();
  entries.forEach((entry, index) => {
    const x = padding + index * scaleX;
    const y = height - padding - (entry.rate - min) * scaleY;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  if (fxHoverIndex !== null && entries[fxHoverIndex]) {
    const entry = entries[fxHoverIndex];
    const x = padding + fxHoverIndex * scaleX;
    const y = height - padding - (entry.rate - min) * scaleY;

    ctx.strokeStyle = colors.hoverLine;
    ctx.lineWidth = 1 * ratio;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();

    ctx.fillStyle = colors.indicator;
    ctx.beginPath();
    ctx.arc(x, y, 3.5 * ratio, 0, Math.PI * 2);
    ctx.fill();

    const tooltipText = `${entry.date}  ·  ${entry.rate.toFixed(4)}`;
    ctx.font = `${11 * ratio}px "Droid Sans Mono", monospace`;
    const textWidth = ctx.measureText(tooltipText).width;
    const padX = 8 * ratio;
    const padY = 6 * ratio;
    const boxWidth = textWidth + padX * 2;
    const boxHeight = 22 * ratio;

    let boxX = x - boxWidth / 2;
    boxX = Math.max(padding, Math.min(boxX, width - padding - boxWidth));
    const boxY = Math.max(padding, y - boxHeight - 10 * ratio);

    ctx.fillStyle = colors.tooltipBg;
    ctx.strokeStyle = colors.tooltipBorder;
    ctx.lineWidth = 1 * ratio;
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxWidth, boxHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.tooltipText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tooltipText, boxX + boxWidth / 2, boxY + boxHeight / 2 + 0.5 * ratio);
  }

  const avg = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  const avgY = height - padding - (avg - min) * scaleY;
  ctx.setLineDash([6 * ratio, 6 * ratio]);
  ctx.strokeStyle = colors.avgLine;
  ctx.lineWidth = 1.5 * ratio;
  ctx.beginPath();
  ctx.moveTo(padding, avgY);
  ctx.lineTo(width - padding, avgY);
  ctx.stroke();
  ctx.setLineDash([]);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const monthStart = new Date(now);
  monthStart.setMonth(now.getMonth() - 1);
  const weekStartKey = formatDateLocal(weekStart);
  const monthStartKey = formatDateLocal(monthStart);
  const weekEntries = entries.filter((entry) => entry.date >= weekStartKey);
  const monthEntries = entries.filter((entry) => entry.date >= monthStartKey);
  const weekAvg =
    weekEntries.reduce((sum, entry) => sum + entry.rate, 0) / Math.max(weekEntries.length, 1);
  const monthAvg =
    monthEntries.reduce((sum, entry) => sum + entry.rate, 0) /
    Math.max(monthEntries.length, 1);

  ctx.fillStyle = "#9bb3a8";
  ctx.font = `${11 * ratio}px "Droid Sans Mono", monospace`;
  ctx.textAlign = "left";
  ctx.fillText(min.toFixed(4), padding, height - padding + 14 * ratio);
  ctx.textAlign = "right";
  ctx.fillText(max.toFixed(4), width - padding, padding - 6 * ratio);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Medie: 7gg ${weekAvg.toFixed(4)} · 30gg ${monthAvg.toFixed(4)} · periodo ${avg.toFixed(4)}`,
    padding,
    Math.max(2 * ratio, padding - 14 * ratio)
  );
}

function setupFxChartTooltip() {
  if (!fxChartEl) return;

  fxChartEl.addEventListener("mousemove", (event) => {
    if (!fxChartEntries.length) return;
    const rect = fxChartEl.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = fxChartEl.width;
    const height = fxChartEl.height;
    const padding = 22 * ratio;
    const chartWidth = width - padding * 2;

    const x = (event.clientX - rect.left) * ratio;
    if (x < padding || x > width - padding) {
      if (fxHoverIndex !== null) {
        fxHoverIndex = null;
        drawFxChart();
      }
      return;
    }

    const scaleX = chartWidth / Math.max(fxChartEntries.length - 1, 1);
    const index = Math.round((x - padding) / scaleX);
    const clamped = Math.max(0, Math.min(index, fxChartEntries.length - 1));

    if (fxHoverIndex !== clamped) {
      fxHoverIndex = clamped;
      drawFxChart();
    }
  });

  fxChartEl.addEventListener("mouseleave", () => {
    if (fxHoverIndex !== null) {
      fxHoverIndex = null;
      drawFxChart();
    }
  });
}

// --- FX CHART (INTRADAY) ---
function resizeFxMiniChart() {
  if (!fxMiniChartEl) return;
  const parent = fxMiniChartEl.parentElement;
  if (!parent) return;
  const targetWidth = Math.floor(parent.clientWidth);
  const targetHeight = 46;
  if (targetWidth === fxMiniSize.width && targetHeight === fxMiniSize.height) return;

  const ratio = window.devicePixelRatio || 1;
  fxMiniChartEl.width = targetWidth * ratio;
  fxMiniChartEl.height = targetHeight * ratio;
  fxMiniChartEl.style.width = `${targetWidth}px`;
  fxMiniChartEl.style.height = `${targetHeight}px`;
  fxMiniSize = { width: targetWidth, height: targetHeight };
  drawFxMiniChart();
}

function drawFxMiniChart() {
  if (!fxMiniChartEl) return;
  const ctx = fxMiniChartEl.getContext("2d");
  if (!ctx) return;

  const cache = getIntradayCache();
  const points = cache.points;
  const ratio = window.devicePixelRatio || 1;
  const width = fxMiniChartEl.width;
  const height = fxMiniChartEl.height;
  ctx.clearRect(0, 0, width, height);

  if (!points.length) return;

  const rates = points.map((p) => p.r);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const padding = 6 * ratio;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const scaleX = chartWidth / Math.max(points.length - 1, 1);
  const scaleY = chartHeight / (max - min || 1);

  ctx.strokeStyle = "rgba(155, 179, 168, 0.6)";
  ctx.lineWidth = 2 * ratio;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = padding + index * scaleX;
    const y = height - padding - (point.r - min) * scaleY;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

// --- FX SCHEDULING ---
function scheduleIntradayRefresh() {
  const now = new Date();
  const startHour = 7;
  const endHour = 18;
  const currentHour = now.getHours();

  let next;
  if (currentHour < startHour) {
    next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 5, 0);
  } else if (currentHour >= endHour) {
    next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      startHour,
      5,
      0
    );
  } else {
    next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      currentHour + 1,
      5,
      0
    );
  }

  const timeout = next.getTime() - now.getTime();
  setTimeout(() => {
    fetchFxLatest();
    scheduleIntradayRefresh();
  }, timeout);
}

async function openExternalLink(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("URL non valido");
  }

  if (!window.Neutralino?.os?.open) {
    throw new Error("API Neutralino os.open non disponibile");
  }

  await window.Neutralino.os.open(url);
}

// --- INIT / LISTENERS ---
function initDashboard() {
  monthsContainer.addEventListener("wheel", handleWheel, { passive: false });
  document.addEventListener("mousedown", (event) => {
    if (!calendarContextMenu.contains(event.target)) {
      hideCalendarContextMenu();
    }
  });

  calendarContextMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-action]");
    if (!button) return;
    hideCalendarContextMenu();
  });
  monthsContainer.addEventListener("mousedown", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    if (getCalendarView() !== 'grid') return;
    startOffset = -1;
    renderMonths();
  });

  // --- Calendar Views ---
  // Register the default grid view (reuses existing renderMonths)
  registerCalendarView('grid', ' ▦ ', () => {
    renderMonths();
  });

  // Register a compact year overview
  registerCalendarView('year', ' ⊞ ', (container) => {
    const navIndicator = document.getElementById("calendar-nav-indicator");
    if (navIndicator) {
      navIndicator.textContent = "";
      navIndicator.title = "";
    }
    renderYearOverview(container);
  });

  // Initialise the view system (default = grid, renders immediately)
  initCalendarViews(
    monthsContainer,
    document.getElementById('calendar-view-toggle'),
    'grid'
  );

  scheduleMidnightRefresh();
  updateClock();
  scheduleMinuteRefresh();
  ensureFxHistory();
  fetchFxLatest();
  scheduleIntradayRefresh();
  scheduleFxHistoryRefresh();
  resizeFxChart();
  resizeFxMiniChart();
  setupFxChartTooltip();

  window.addEventListener("resize", () => {
    resizeFxChart();
    resizeFxMiniChart();
  });

  if (fxCardEl) {
    fxCardEl.addEventListener("click", () => {
      document.body.classList.toggle("show-trading");
    });
  }

  const tradingPanel = document.getElementById("trading-panel");
  if (tradingPanel) {
    tradingPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const tradingLinks = tradingPanel.querySelectorAll("a[href]");
    tradingLinks.forEach((link) => {
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await openExternalLink(link.href);
        } catch (error) {
          console.error("Errore apertura link esterno", error);
          if (fxUpdatedEl) {
            fxUpdatedEl.textContent = "Errore apertura link esterno";
          }
          if (fxChangeEl) {
            fxChangeEl.textContent = "Controlla permessi Native API / browser predefinito";
            fxChangeEl.classList.add("negative");
          }
          alert("Impossibile aprire il link esterno. Verifica browser predefinito e permessi Native API.");
        }
      });
    });
  }

  // --- Date Display & Format Menu ---
  const dateDisplayEl = document.getElementById("date-display");
  if (dateDisplayEl) {
    // Update date display on page load and at midnight
    updateDateDisplay();

    // Right-click to show date format menu
    dateDisplayEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const now = new Date();
      
      // Update menu button texts with current date
      const fullButton = dateFormatMenu.querySelector('[data-format="full"]');
      const isoButton = dateFormatMenu.querySelector('[data-format="iso"]');
      const shortButton = dateFormatMenu.querySelector('[data-format="short"]');
      
      if (fullButton) fullButton.textContent = formatDate(now, "full").replace(/\n/g, " ");
      if (isoButton) isoButton.textContent = formatDate(now, "iso");
      if (shortButton) shortButton.textContent = formatDate(now, "short");
      
      const rect = dateDisplayEl.getBoundingClientRect();
      dateFormatMenu.style.left = `${rect.left}px`;
      dateFormatMenu.style.top = `${rect.bottom + 8}px`;
      dateFormatMenu.classList.add("is-visible");
    });
  }

  // Date format menu button click handlers
  dateFormatMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-format]");
    if (!button) return;

    const format = button.getAttribute("data-format");
    const now = new Date();
    let formattedDate = formatDate(now, format);

    // For "full" format in clipboard, remove newlines and keep single space
    if (format === "full") {
      formattedDate = formattedDate.replace(/\n/g, " ");
    }

    // Copy to clipboard
    navigator.clipboard.writeText(formattedDate).then(() => {
      // Visual feedback: add temporary class
      button.classList.add("copied");
      setTimeout(() => {
        button.classList.remove("copied");
      }, 300);
    }).catch((err) => {
      console.error("Errore nella copia negli appunti:", err);
    });

    // Close menu
    dateFormatMenu.classList.remove("is-visible");
  });

  // Close date format menu when clicking outside
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#date-display") && !event.target.closest(".date-format-menu")) {
      dateFormatMenu.classList.remove("is-visible");
    }
  });

  if (clockWrap && flipClock && analogClock) {
    clockWrap.addEventListener("click", () => {
      clockWrap.classList.toggle("is-analog");
      const isAnalog = clockWrap.classList.contains("is-analog");
      flipClock.setAttribute("aria-hidden", isAnalog ? "true" : "false");
      analogClock.setAttribute("aria-hidden", isAnalog ? "false" : "true");
    });
  }

  window.addEventListener("online", () => {
    updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
    fetchFxLatest();
  });

  window.addEventListener("offline", () => {
    const snapshot = getBestLocalFxSnapshot();
    updateNetworkStatus(snapshot?.ts || null);
    applyFxSnapshot(snapshot, true);
  });

  setInterval(() => {
    if (!navigator.onLine) {
      updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
    }
  }, 60000);

  // Tabs are now initialised in main.js via tabs.js module

  if (fxKeyForm) {
    fxKeyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = fxKeyInput?.value?.trim();
      if (!value) {
        if (fxKeyStatus) fxKeyStatus.textContent = "Inserisci una chiave valida.";
        return;
      }
      setFreeCurrencyCookieKey(value);
      updateFxKeyStatus();
    });
  }

  if (fxKeyClearBtn) {
    fxKeyClearBtn.addEventListener("click", () => {
      clearFreeCurrencyCookieKey();
      updateFxKeyStatus();
    });
  }

  if (gistKeyForm) {
    gistKeyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = gistKeyInput?.value?.trim();
      if (!value) {
        if (gistKeyStatus) gistKeyStatus.textContent = "Inserisci un token valido.";
        return;
      }
      setGistCookieKey(value);
      gistToken = value;
      updateGistKeyStatus();
    });
  }

  if (gistKeyClearBtn) {
    gistKeyClearBtn.addEventListener("click", () => {
      clearGistCookieKey();
      gistToken = null;
      updateGistKeyStatus();
    });
  }

  if (saveGistUrlBtn) {
    saveGistUrlBtn.addEventListener("click", () => {
      const value = gistUrlInput?.value?.trim();
      if (!value) {
        if (gistUrlStatus) gistUrlStatus.textContent = "Inserisci un URL valido.";
        return;
      }
      setGistUrlCookie(value);
      updateGistUrlStatus();
    });
  }

  if (clearGistUrlBtn) {
    clearGistUrlBtn.addEventListener("click", () => {
      clearGistUrlCookie();
      updateGistUrlStatus();
    });
  }

  setupRevealToggle(fxKeyToggleBtn, fxKeyInput);
  setupRevealToggle(gistKeyToggleBtn, gistKeyInput);
  setupRevealToggle(gistUrlToggleBtn, gistUrlInput);

  setupCopyButton(
    fxKeyCopyBtn,
    () => getFreeCurrencyCookieKey() || fxKeyInput?.value,
    fxKeyStatus,
    "Chiave FX copiata."
  );
  setupCopyButton(
    gistKeyCopyBtn,
    () => getGistCookieKey() || gistKeyInput?.value,
    gistKeyStatus,
    "Token GitHub copiato."
  );
  setupCopyButton(
    gistUrlCopyBtn,
    () => getGistUrlCookie() || gistUrlInput?.value,
    gistUrlStatus,
    "URL Gist copiato."
  );

  updateFxKeyStatus();
  updateGistKeyStatus();
  updateGistUrlStatus();
  updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
  updateSettingsRuntimeInfo();
}

export { initDashboard };
