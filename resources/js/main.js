/**
 * Application entry point.
 * Imports all modules and kicks off initialization.
 * Loaded as <script type="module"> — runs after DOM is parsed.
 * @module main
 */

import { APP_VERSION } from './version.js';
import { renderMoonPhase } from './moon.js';
import { initDashboard } from './script.js';
import { restoreTheme, bindThemeSelect } from './ui/theme.js';
import { initTabs } from './ui/tabs.js';
// Side-effect imports: each module self-initialises on import
import './calculator.js';
import './calc-sheet.js';
import './time-date-manager.js';

const isNeutralinoRuntime = Boolean(
  window.Neutralino?.init &&
  window.NL_OS &&
  window.NL_PORT
);

if (isNeutralinoRuntime) {
  window.Neutralino.init();
}

const setupMacOSMainMenu = () => {
  if (!isNeutralinoRuntime || window.NL_OS !== 'Darwin' || !window.Neutralino?.window?.setMainMenu) return;

  const appName = document.title || 'Dashboard';
  const menu = [
    {
      id: 'app',
      text: appName,
      menuItems: [
        { id: 'about', text: `Informazioni su ${appName}`, action: 'orderFrontStandardAboutPanel:' },
        { id: 'preferences', text: 'Impostazioni…', shortcut: ',' },
        { text: '-' },
        { id: 'hide', text: `Nascondi ${appName}`, shortcut: 'h', action: 'hide:' },
        { id: 'hideOthers', text: 'Nascondi altri', shortcut: 'Alt+h', action: 'hideOtherApplications:' },
        { id: 'showAll', text: 'Mostra tutti', action: 'unhideAllApplications:' },
        { text: '-' },
        { id: 'quit', text: `Esci da ${appName}`, shortcut: 'q', action: 'terminate:' }
      ]
    },
    {
      id: 'file',
      text: 'File',
      menuItems: [
        { id: 'close', text: 'Chiudi finestra', shortcut: 'w', action: 'performClose:' }
      ]
    },
    {
      id: 'edit',
      text: 'Modifica',
      menuItems: [
        { id: 'undo', text: 'Annulla', shortcut: 'z', action: 'undo:' },
        { id: 'redo', text: 'Ripeti', shortcut: 'Shift+z', action: 'redo:' },
        { text: '-' },
        { id: 'cut', text: 'Taglia', shortcut: 'x', action: 'cut:' },
        { id: 'copy', text: 'Copia', shortcut: 'c', action: 'copy:' },
        { id: 'paste', text: 'Incolla', shortcut: 'v', action: 'paste:' },
        { id: 'selectAll', text: 'Seleziona tutto', shortcut: 'a', action: 'selectAll:' }
      ]
    },
    {
      id: 'window',
      text: 'Finestra',
      menuItems: [
        { id: 'minimize', text: 'Riduci', shortcut: 'm', action: 'performMiniaturize:' },
        { id: 'zoom', text: 'Ingrandisci', action: 'performZoom:' }
      ]
    },
    {
      id: 'help',
      text: 'Aiuto',
      menuItems: [
        { id: 'docs', text: 'Documentazione Neutralino' }
      ]
    }
  ];

  window.Neutralino.window.setMainMenu(menu).catch(() => {});

  if (window.Neutralino?.events?.on) {
    window.Neutralino.events.on('mainMenuItemClicked', (ev) => {
      const id = ev?.detail?.id;
      if (!id) return;

      if (id === 'preferences') {
        const themeSelectEl = document.getElementById('theme-select');
        if (themeSelectEl && typeof themeSelectEl.focus === 'function') {
          themeSelectEl.focus();
        }
      }

      if (id === 'docs') {
        window.Neutralino.os.open('https://neutralino.js.org/');
      }
    }).catch(() => {});
  }
};

setupMacOSMainMenu();

// --- Version label ---
const settingsBuildEl = document.querySelector('.settings-build');
if (settingsBuildEl) {
  settingsBuildEl.textContent = `ver. ${APP_VERSION}`;
}

// --- Theme ---
restoreTheme();
bindThemeSelect(document.getElementById('theme-select'));

// --- Tabs ---
const calculatorPanel = document.getElementById('calculator-panel');
if (calculatorPanel) {
  const tabs = initTabs(calculatorPanel);
  tabs.setActive('calculator');
}

function focusCalculatorAtStartup() {
  const calculatorTab = document.querySelector('[data-tab-panel="calculator"]');
  const calculatorWrapper = document.querySelector('.calculator-wrapper');
  if (!calculatorTab || !calculatorWrapper) return;
  if (!calculatorTab.classList.contains('active')) {
    return;
  }
  try {
    calculatorWrapper.focus({ preventScroll: true });
  } catch {
    calculatorWrapper.focus();
  }
}

window.addEventListener('load', () => {
  focusCalculatorAtStartup();
  setTimeout(focusCalculatorAtStartup, 120);
  setTimeout(focusCalculatorAtStartup, 260);
});

window.addEventListener('focus', focusCalculatorAtStartup, { once: true });

// --- Dashboard (calendar, clock, FX) ---
renderMoonPhase();
initDashboard();
