/**
 * Dashboard orchestrator: wires up calendar, clock, FX and settings modules
 * and keeps the midnight refresh loop. @2026-07-09
 * @module script
 */

import { renderMoonPhase } from './moon.js';
import { initCalendar, renderMonths } from './calendar.js';
import { initClock, updateDateDisplay } from './clock.js';
import { initFx } from './fx.js';
import { initSettings } from './settings.js';

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

// --- INIT / LISTENERS ---
function initDashboard() {
  initCalendar();
  initClock();
  initFx();
  initSettings();
  scheduleMidnightRefresh();

  // Tabs are now initialised in main.js via tabs.js module
}

export { initDashboard };
