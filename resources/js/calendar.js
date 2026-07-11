/**
 * Calendar panel: scrolling month grid, year overview and day context menu.
 * Extracted from script.js. @2026-07-09
 * @module calendar
 */

import { isHoliday } from './time-date-manager.js';
import {
  registerCalendarView,
  initCalendarViews,
  getCalendarView,
} from './ui/calendar-views.js';
import { monthNames, weekdayLabels, weekdayNames, formatDateLocal } from './date-utils.js';

const monthsContainer = document.getElementById("months");
const calendarContextMenu = document.createElement("div");

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

/**
 * Bind calendar listeners and register the calendar views. @2026-07-09
 */
export function initCalendar() {
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
}

export { renderMonths };
