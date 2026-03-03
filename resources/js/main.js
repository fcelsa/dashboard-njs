/**
 * Application entry point.
 * Imports all modules and kicks off initialization.
 * Loaded as <script type="module"> — runs after DOM is parsed.
 * @module main
 */

import { renderMoonPhase } from './moon.js';
import { initDashboard } from './script.js';
import { restoreTheme, bindThemeSelect } from './ui/theme.js';
import { initTabs } from './ui/tabs.js';
// Side-effect imports: each module self-initialises on import
import './calculator.js';
import './calc-sheet.js';
import './time-date-manager.js';

const FOCUS_DEBUG = true;

if (!window.__focusDebugLog) {
  window.__focusDebugEntries = window.__focusDebugEntries || [];
  window.__focusDebugEnabled = false;
  window.__focusDebugVisible = false;

  const ensureFocusDebugPanel = () => {
    let panel = document.getElementById('focus-debug-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'focus-debug-panel';
      panel.setAttribute('aria-live', 'polite');
      panel.style.position = 'fixed';
      panel.style.right = '8px';
      panel.style.bottom = '8px';
      panel.style.width = '420px';
      panel.style.maxWidth = 'calc(100vw - 16px)';
      panel.style.maxHeight = '32vh';
      panel.style.overflow = 'auto';
      panel.style.zIndex = '9999';
      panel.style.padding = '8px';
      panel.style.border = '1px solid rgba(255,255,255,0.2)';
      panel.style.background = 'rgba(0,0,0,0.78)';
      panel.style.color = '#d7ffd7';
      panel.style.fontFamily = 'monospace';
      panel.style.fontSize = '11px';
      panel.style.lineHeight = '1.35';
      panel.style.whiteSpace = 'pre-wrap';
      panel.style.wordBreak = 'break-word';
      panel.style.display = 'none';
      document.body.appendChild(panel);
    }
    return panel;
  };

  const refreshFocusDebugPanel = () => {
    const panel = ensureFocusDebugPanel();
    panel.style.display = window.__focusDebugVisible ? 'block' : 'none';
    if (!window.__focusDebugVisible) return;
    panel.innerHTML = '';
    const tail = window.__focusDebugEntries.slice(-60);
    tail.forEach((entry) => {
      const row = document.createElement('div');
      row.textContent = `${entry.timestamp} [${entry.source}] ${entry.label} ${JSON.stringify(entry.payload)}`;
      panel.appendChild(row);
    });
    panel.scrollTop = panel.scrollHeight;
  };

  window.__focusDebugSetVisible = (visible) => {
    window.__focusDebugVisible = Boolean(visible);
    window.__focusDebugEnabled = window.__focusDebugVisible;
    refreshFocusDebugPanel();
  };

  window.__focusDebugLog = (source, label, payload = {}) => {
    if (!window.__focusDebugEnabled) return;
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const entry = { timestamp, source, label, payload };
    window.__focusDebugEntries.push(entry);
    if (window.__focusDebugEntries.length > 120) {
      window.__focusDebugEntries.shift();
    }
    if (window.__focusDebugVisible) {
      refreshFocusDebugPanel();
    }
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'F12') return;
    event.preventDefault();
    window.__focusDebugSetVisible(!window.__focusDebugVisible);
    console.debug('[main-focus]', 'debug-panel:toggle', { visible: window.__focusDebugVisible });
  });
}

const describeElement = (el) => {
  if (!el) return 'null';
  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string' && el.className.trim()
    ? `.${el.className.trim().split(/\s+/).join('.')}`
    : '';
  return `${el.tagName}${id}${className}`;
};

const logFocusDebug = (label, extra = {}) => {
  if (!FOCUS_DEBUG || !window.__focusDebugEnabled) return;
  const calculatorTab = document.querySelector('[data-tab-panel="calculator"]');
  const payload = {
    tabActive: Boolean(calculatorTab && calculatorTab.classList.contains('active')),
    activeElement: describeElement(document.activeElement),
    ...extra,
  };
  console.debug('[main-focus]', label, payload);
  if (window.__focusDebugLog) {
    window.__focusDebugLog('main-focus', label, payload);
  }
};

if (window.Neutralino?.init) {
  window.Neutralino.init();
}

const setupMacOSMainMenu = () => {
  if (window.NL_OS !== 'Darwin' || !window.Neutralino?.window?.setMainMenu) return;

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

// --- Theme ---
restoreTheme();
bindThemeSelect(document.getElementById('theme-select'));

// --- Tabs ---
const calculatorPanel = document.getElementById('calculator-panel');
if (calculatorPanel) {
  const tabs = initTabs(calculatorPanel);
  tabs.setActive('calculator');
  logFocusDebug('tabs:setActive:calculator');
}

function focusCalculatorAtStartup() {
  const calculatorTab = document.querySelector('[data-tab-panel="calculator"]');
  const calculatorWrapper = document.querySelector('.calculator-wrapper');
  if (!calculatorTab || !calculatorWrapper) return;
  if (!calculatorTab.classList.contains('active')) {
    logFocusDebug('focusCalculatorAtStartup:skip-tab');
    return;
  }
  logFocusDebug('focusCalculatorAtStartup:before');
  try {
    calculatorWrapper.focus({ preventScroll: true });
  } catch {
    calculatorWrapper.focus();
  }
  logFocusDebug('focusCalculatorAtStartup:after');
}

window.addEventListener('load', () => {
  logFocusDebug('window:load');
  focusCalculatorAtStartup();
  setTimeout(focusCalculatorAtStartup, 120);
  setTimeout(focusCalculatorAtStartup, 260);
});

window.addEventListener('focus', () => {
  logFocusDebug('window:focus');
}, { once: true });

window.addEventListener('focus', focusCalculatorAtStartup, { once: true });

// --- Dashboard (calendar, clock, FX) ---
renderMoonPhase();
initDashboard();
