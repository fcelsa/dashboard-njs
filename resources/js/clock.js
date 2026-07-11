/**
 * Time panel: flip/analog clock and the date display with its format menu.
 * Extracted from script.js. @2026-07-09
 * @module clock
 */

import { formatDate } from './date-utils.js';

const flipClock = document.getElementById("flip-clock");
const clockWrap = document.getElementById("clock-wrap");
const analogClock = document.getElementById("analog-clock");
const hourHand = analogClock?.querySelector(".hand.hour");
const minuteHand = analogClock?.querySelector(".hand.minute");

// --- DATE FORMAT CONTEXT MENU ---
const dateFormatMenu = document.createElement("div");
dateFormatMenu.className = "date-format-menu";
dateFormatMenu.innerHTML = `
  <button type="button" data-format="full">Domenica 22 Febbraio 2026</button>
  <button type="button" data-format="iso">2026-02-22</button>
  <button type="button" data-format="short">22/02/2026</button>
`;
document.body.appendChild(dateFormatMenu);

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

/**
 * Start the clock and bind the date display interactions. @2026-07-09
 */
export function initClock() {
  updateClock();
  scheduleMinuteRefresh();

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
}

export { updateDateDisplay };
