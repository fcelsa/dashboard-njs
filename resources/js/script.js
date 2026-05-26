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
const fxUpdatedEl = document.getElementById("fx-updated");
const fxAvg7El = document.getElementById("fx-avg-7");
const fxAvg30El = document.getElementById("fx-avg-30");
const fxAvgYtdEl = document.getElementById("fx-avg-ytd");
const fxWeeklyMinEl = document.getElementById("fx-weekly-min");
const fxWeeklyMaxEl = document.getElementById("fx-weekly-max");
const fxChartEl = document.getElementById("fx-chart");
const fxStatusEl = document.getElementById("fx-status");
const networkStatusEl = document.getElementById("network-status");
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
let fxHistoryProvider = null;
let fxChartSize = { width: 0, height: 0 };
let fxChartEntries = [];
let fxHoverIndex = null;
let gistToken = null;
const fxSessionKey = "fxLatestSession";
const gistTokenCookieKey = "githubGistToken";
const gistUrlCookieKey = "dashboardGistUrl";
const FX_DAILY_FETCH_HOURS = [16];

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
const monthShortNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

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

function scheduleFxDailyRefresh() {
  const now = new Date();
  const target = getNextScheduledTarget(FX_DAILY_FETCH_HOURS, now);
  const timeout = target.getTime() - now.getTime();
  setTimeout(async () => {
    await runDailyFxRefresh();
    scheduleFxDailyRefresh();
  }, timeout);
}

function getNextScheduledTarget(hours, now = new Date()) {
  const sorted = [...hours].sort((a, b) => a - b);
  for (const hour of sorted) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 5);
    if (candidate.getTime() > now.getTime()) {
      return candidate;
    }
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, sorted[0], 0, 5);
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

// --- FX HELPERS ---
// --- FX CACHE (SESSION) ---

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
    const parsed = JSON.parse(raw);
    const rate = Number(parsed?.rate);
    const ts = Number(parsed?.ts);
    if (!Number.isFinite(rate) || !Number.isFinite(ts)) {
      return null;
    }
    const valueDate = typeof parsed?.valueDate === "string" ? parsed.valueDate : formatDateLocal(new Date(ts));
    return { rate, ts, valueDate };
  } catch {
    return null;
  }
}

function setCachedSessionRate(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.rate)) return;
  const payload = {
    rate: snapshot.rate,
    ts: Number.isFinite(snapshot.ts) ? snapshot.ts : Date.now(),
    valueDate:
      typeof snapshot.valueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.valueDate)
        ? snapshot.valueDate
        : formatDateLocal(new Date()),
  };
  setCookie(fxSessionKey, JSON.stringify(payload), 60 * 60 * 24 * 7);
}

function getBestLocalFxSnapshot() {
  const cached = getCachedSessionRate();
  if (!cached) return null;
  return cached;
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
  const valueDate =
    typeof snapshot.valueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.valueDate)
      ? snapshot.valueDate
      : formatDateLocal(when);
  fxPriceEl.textContent = snapshot.rate.toFixed(4);

  const staleSuffix = stale
    ? ` · dati vecchi ${formatElapsedCompact(when.getTime()) || ""}`.trimEnd()
    : "";
  fxUpdatedEl.textContent = `Quotazione del ${valueDate} · sync ${formatTime(when)}${staleSuffix}`;

  if (fxStatusEl) {
    fxStatusEl.classList.toggle("cached", stale);
  }
  updateNetworkStatus(when.getTime());
  renderFxAverages(snapshot);
  return true;
}

// --- FX HISTORY CACHE ---
function getHistoryRange(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return { start: formatDateLocal(start), end: formatDateLocal(end) };
}

function normalizeHistoryPayload(payload) {
  if (Array.isArray(payload)) {
    const normalized = {};
    payload.forEach((row) => {
      if (!row || row.quote !== "USD" || !row.date) return;
      const rate = typeof row.rate === "number" ? row.rate : parseFloat(row.rate);
      if (!Number.isFinite(rate)) return;
      normalized[row.date] = { USD: rate };
    });
    return Object.keys(normalized).length ? normalized : null;
  }

  if (payload?.rates && typeof payload.rates === "object") {
    return payload.rates;
  }

  return null;
}

function readCachedHistory() {
  const raw = localStorage.getItem("fxHistory");
  const updated = localStorage.getItem("fxHistoryUpdated");
  if (!raw || !updated) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const provider = localStorage.getItem("fxHistoryProvider") || null;
    return { data, updated, provider };
  } catch (error) {
    console.warn("Invalid fxHistory cache payload", error);
    localStorage.removeItem("fxHistory");
    localStorage.removeItem("fxHistoryUpdated");
    localStorage.removeItem("fxHistoryProvider");
    return null;
  }
}

function cacheHistory(data, provider = "Frankfurter") {
  localStorage.setItem("fxHistory", JSON.stringify(data));
  localStorage.setItem("fxHistoryUpdated", formatDateLocal(new Date()));
  localStorage.setItem("fxHistoryProvider", provider);
}

function getLatestHistoryDate(history) {
  if (!history || typeof history !== "object") return null;
  const keys = Object.keys(history)
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort();
  return keys.length ? keys[keys.length - 1] : null;
}

function getFxHistoryEntries(history) {
  if (!history || typeof history !== "object") return [];
  return Object.entries(history)
    .map(([date, value]) => {
      const raw = value?.USD;
      const rate = typeof raw === "number" ? raw : parseFloat(raw);
      return { date, rate };
    })
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(entry.rate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSnapshotWithHistoryEntries(entries, snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.rate) || typeof snapshot.valueDate !== "string") {
    return entries;
  }
  const merged = entries.filter((entry) => entry.date !== snapshot.valueDate);
  merged.push({ date: snapshot.valueDate, rate: snapshot.rate });
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

function calculateAverage(entries, startKey, endKey) {
  const inRange = entries.filter((entry) => entry.date >= startKey && entry.date <= endKey);
  if (!inRange.length) return null;
  const total = inRange.reduce((sum, entry) => sum + entry.rate, 0);
  return total / inRange.length;
}

function setAverageText(targetEl, value) {
  if (!targetEl) return;
  targetEl.textContent = Number.isFinite(value) ? value.toFixed(4) : "--";
}

function renderFxAverages(snapshot = null) {
  const now = new Date();
  const todayKey = formatDateLocal(now);
  const entries = mergeSnapshotWithHistoryEntries(getFxHistoryEntries(fxHistory), snapshot || getBestLocalFxSnapshot());
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 29);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  setAverageText(fxAvg7El, calculateAverage(entries, formatDateLocal(sevenDaysAgo), todayKey));
  setAverageText(fxAvg30El, calculateAverage(entries, formatDateLocal(thirtyDaysAgo), todayKey));
  setAverageText(fxAvgYtdEl, calculateAverage(entries, formatDateLocal(yearStart), todayKey));
}

function updateWeeklyRangeSummary(points) {
  const values = points
    .map((point) => point.rate)
    .filter((rate) => Number.isFinite(rate));
  if (!values.length) {
    if (fxWeeklyMinEl) fxWeeklyMinEl.textContent = "Min --";
    if (fxWeeklyMaxEl) fxWeeklyMaxEl.textContent = "Max --";
    return;
  }
  if (fxWeeklyMinEl) fxWeeklyMinEl.textContent = `Min ${Math.min(...values).toFixed(4)}`;
  if (fxWeeklyMaxEl) fxWeeklyMaxEl.textContent = `Max ${Math.max(...values).toFixed(4)}`;
}

async function fetchFxHistory() {
  try {
    const { start, end } = getHistoryRange();
    const url = `https://api.frankfurter.dev/v2/rates?from=${start}&to=${end}&base=EUR&quotes=USD`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Frankfurter v2 responded with ${response.status}`);
    }

    const payload = await response.json();
    const normalized = normalizeHistoryPayload(payload);
    if (!normalized) {
      throw new Error("Frankfurter v2 returned an unsupported payload");
    }

    fxHistory = normalized;
    fxHistoryProvider = "Frankfurter v2";
    cacheHistory(fxHistory, fxHistoryProvider);
    drawFxChart();
    renderFxAverages();
    return;
  } catch (error) {
    console.error(error);
    if (fxUpdatedEl) {
      const latestCached = getLatestHistoryDate(fxHistory);
      fxUpdatedEl.textContent = latestCached
        ? `Storico non aggiornato (ultimo dato ${latestCached})`
        : "Storico FX non disponibile";
    }
  }
}

function ensureFxHistory() {
  const cached = readCachedHistory();
  if (cached) {
    fxHistory = cached.data;
    fxHistoryProvider = cached.provider;
    drawFxChart();
    renderFxAverages();
  } else {
    drawFxChart();
  }
}

// --- FX LATEST FETCH ---
async function fetchFrankfurterLatestRate() {
  const url = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Frankfurter v1 responded with ${response.status}`);
  }
  const payload = await response.json();
  const rawRate = payload?.rates?.USD;
  const rate = typeof rawRate === "number" ? rawRate : parseFloat(rawRate);
  if (!Number.isFinite(rate)) {
    throw new Error("Frankfurter v1 returned an unsupported payload");
  }
  const valueDate =
    typeof payload?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : formatDateLocal(new Date());
  return { rate, valueDate };
}

async function fetchFxLatest({ forceRemote = false } = {}) {
  if (!fxPriceEl || !fxUpdatedEl) return;
  try {
    const localSnapshot = getBestLocalFxSnapshot();
    updateNetworkStatus(localSnapshot?.ts || null);

    if (!navigator.onLine) {
      if (!applyFxSnapshot(localSnapshot, true) && fxUpdatedEl) {
        fxUpdatedEl.textContent = "Aggiornamento: offline, nessun dato locale";
      }
      return;
    }

    if (!forceRemote && localSnapshot) {
      applyFxSnapshot(localSnapshot, true);
      return;
    }

    try {
      const latest = await fetchFrankfurterLatestRate();
      const snapshot = { rate: latest.rate, ts: Date.now(), valueDate: latest.valueDate };
      setCachedSessionRate(snapshot);
      applyFxSnapshot(snapshot, false);
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

async function runDailyFxRefresh() {
  await fetchFxLatest({ forceRemote: true });
  await fetchFxHistory();
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

  const currentTheme = getTheme();
  const isLight = currentTheme === 'light' || currentTheme === 'mac1990';
  const colors = {
    grid: isLight ? 'rgba(0, 50, 100, 0.08)' : 'rgba(122, 166, 194, 0.12)',
    line: isLight ? '#3a7db8' : '#7aa6c2',
    hoverLine: isLight ? 'rgba(58, 125, 184, 0.3)' : 'rgba(155, 179, 168, 0.5)',
    indicator: isLight ? '#2a69a3' : '#7aa6c2',
    tooltipBg: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(16, 25, 32, 0.9)',
    tooltipBorder: isLight ? 'rgba(58, 125, 184, 0.4)' : 'rgba(122, 166, 194, 0.6)',
    tooltipText: isLight ? '#1a3050' : '#e7f0f6',
  };

  const ratio = window.devicePixelRatio || 1;
  const width = fxChartEl.width;
  const height = fxChartEl.height;
  ctx.clearRect(0, 0, width, height);

  const entries = mergeSnapshotWithHistoryEntries(getFxHistoryEntries(fxHistory), getBestLocalFxSnapshot());
  const points = buildWeeklyFxSeries(entries);
  const values = points.map((point) => point.rate).filter((rate) => Number.isFinite(rate));
  updateWeeklyRangeSummary(points);
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = 22 * ratio;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const scaleX = chartWidth / Math.max(points.length - 1, 1);
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

  const drawSeries = (series) => {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2 * ratio;
    ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    series.forEach((point, index) => {
      if (!Number.isFinite(point.rate)) {
        started = false;
        return;
      }
      const x = padding + index * scaleX;
      const y = height - padding - (point.rate - min) * scaleY;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  };

  drawSeries(points);
  fxChartEntries = points;

  if (fxHoverIndex !== null && fxChartEntries[fxHoverIndex]) {
    const entry = fxChartEntries[fxHoverIndex];
    const x = padding + fxHoverIndex * scaleX;
    const currentRate = entry.rate;

    ctx.strokeStyle = colors.hoverLine;
    ctx.lineWidth = 1 * ratio;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();

    if (Number.isFinite(currentRate)) {
      const currentY = height - padding - (currentRate - min) * scaleY;
      ctx.fillStyle = colors.indicator;
      ctx.beginPath();
      ctx.arc(x, currentY, 3.5 * ratio, 0, Math.PI * 2);
      ctx.fill();
    }

    const currentText = Number.isFinite(currentRate) ? currentRate.toFixed(4) : "n/d";
    const tooltipText = `${entry.label} · ${entry.start} → ${entry.end} · ${currentText}`;
    ctx.font = `${11 * ratio}px "Droid Sans Mono", monospace`;
    const textWidth = ctx.measureText(tooltipText).width;
    const padX = 8 * ratio;
    const padY = 6 * ratio;
    const boxWidth = textWidth + padX * 2;
    const boxHeight = 22 * ratio;

    let boxX = x - boxWidth / 2;
    boxX = Math.max(padding, Math.min(boxX, width - padding - boxWidth));
    const anchorRate = currentRate;
    const anchorY = Number.isFinite(anchorRate)
      ? height - padding - (anchorRate - min) * scaleY
      : height - padding;
    const boxY = Math.max(padding, anchorY - boxHeight - 10 * ratio);

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
}

function buildWeeklyFxSeries(entries, now = new Date()) {
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);

  const points = [];
  for (let weekIndex = 0; weekIndex < 52; weekIndex += 1) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + weekIndex * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > now) {
      weekEnd.setTime(now.getTime());
    }
    const startKey = formatDateLocal(weekStart);
    const endKey = formatDateLocal(weekEnd);
    const weekEntries = entries.filter((entry) => entry.date >= startKey && entry.date <= endKey);
    const average = weekEntries.length
      ? weekEntries.reduce((sum, entry) => sum + entry.rate, 0) / weekEntries.length
      : null;
    points.push({
      label: `Settimana ${String(weekIndex + 1).padStart(2, "0")}`,
      start: startKey,
      end: endKey,
      rate: average,
    });
  }
  return points;
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
  fetchFxLatest({ forceRemote: true });
  if (new Date().getHours() === FX_DAILY_FETCH_HOURS[0]) {
    runDailyFxRefresh();
  }
  scheduleFxDailyRefresh();
  resizeFxChart();
  setupFxChartTooltip();

  window.addEventListener("resize", () => {
    resizeFxChart();
  });

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

  setupRevealToggle(gistKeyToggleBtn, gistKeyInput);
  setupRevealToggle(gistUrlToggleBtn, gistUrlInput);

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

  updateGistKeyStatus();
  updateGistUrlStatus();
  updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
  updateSettingsRuntimeInfo();
}

export { initDashboard };
