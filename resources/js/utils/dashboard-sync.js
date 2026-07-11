/**
 * Dashboard State Synchronization with GitHub Gist
 * Manual sync: user provides Gist URL explicitly
 */

import { getGistToken } from './token-store.js';
import { fetchGist, updateGist } from './github-gist-api.js';

const GIST_DATA_FILENAME = 'dashboard-state.json';
const CALENDAR_HOLIDAYS_STORAGE_KEY = 'dashboard_user_holidays';

export { getGistToken };

/**
 * Extract Gist ID from Gist URL
 * @example 'https://gist.github.com/user/abc123def456' -> 'abc123def456'
 */
function extractGistId(gistUrl) {
  if (!gistUrl) return null;
  try {
    const url = new URL(gistUrl);
    const pathParts = url.pathname.split('/');
    return pathParts[pathParts.length - 1] || null;
  } catch {
    return null;
  }
}

/**
 * Extract all calculator data from IndexedDB
 * Includes: user snapshots, history snapshots, current state
 */
export async function getCalculatorState() {
  try {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('CalculatorDB');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const state = {
          userSnapshots: [],
          historySnapshots: [],
          currentState: null
        };
        
        let completed = 0;
        let total = 3;

        // Load user snapshots
        const userTx = db.transaction(['userSnapshots'], 'readonly');
        const userStore = userTx.objectStore('userSnapshots');
        const userReq = userStore.getAll();
        userReq.onsuccess = () => {
          state.userSnapshots = userReq.result || [];
          if (++completed === total) {
            db.close();
            resolve(state);
          }
        };
        userReq.onerror = () => {
          console.warn('Error loading user snapshots');
          if (++completed === total) {
            db.close();
            resolve(state);
          }
        };

        // Load history snapshots
        const historyTx = db.transaction(['history'], 'readonly');
        const historyStore = historyTx.objectStore('history');
        const historyReq = historyStore.getAll();
        historyReq.onsuccess = () => {
          state.historySnapshots = historyReq.result || [];
          if (++completed === total) {
            db.close();
            resolve(state);
          }
        };
        historyReq.onerror = () => {
          console.warn('Error loading history snapshots');
          if (++completed === total) {
            db.close();
            resolve(state);
          }
        };

        // Load current state
        const currentTx = db.transaction(['current'], 'readonly');
        const currentStore = currentTx.objectStore('current');
        const currentReq = currentStore.get('current');
        currentReq.onsuccess = () => {
          state.currentState = currentReq.result || null;
          if (++completed === total) {
            db.close();
            resolve(state);
          }
        };
        currentReq.onerror = () => {
          console.warn('Error loading current state');
          if (++completed === total) {
            db.close();
            resolve(state);
          }
        };
      };
    });
  } catch (err) {
    console.error('Error getting calculator state:', err);
    return { userSnapshots: [], historySnapshots: [], currentState: null };
  }
}

/**
 * Extract all calc-sheet data from IndexedDB
 */
export async function getCalcSheetState() {
  try {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('calc-sheet-db');
      req.onerror = () => {
        console.warn('Calc-sheet DB not found');
        resolve(null);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['sheet'], 'readonly');
        const store = tx.objectStore('sheet');
        const dataReq = store.get('default');
        
        dataReq.onsuccess = () => {
          const data = dataReq.result || null;
          db.close();
          resolve(data);
        };
        
        dataReq.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
  } catch (err) {
    console.error('Error getting calc-sheet state:', err);
    return null;
  }
}

/**
 * Extract calendar user holiday fields from localStorage
 */
export function getCalendarState() {
  try {
    const raw = localStorage.getItem(CALENDAR_HOLIDAYS_STORAGE_KEY);
    const userHolidays = raw ? JSON.parse(raw) : [];
    return {
      version: 1,
      userHolidays: Array.isArray(userHolidays) ? userHolidays : []
    };
  } catch (err) {
    console.error('Error getting calendar state:', err);
    return {
      version: 1,
      userHolidays: []
    };
  }
}

/**
 * Restore calendar user holiday fields to localStorage
 */
export function restoreCalendarState(calendarState) {
  if (!calendarState) return false;

  // Backward compatibility: accept both { userHolidays: [...] } and raw array format.
  const parsedHolidays = Array.isArray(calendarState)
    ? calendarState
    : (Array.isArray(calendarState.userHolidays) ? calendarState.userHolidays : null);
  if (!parsedHolidays) return false;

  try {
    localStorage.setItem(
      CALENDAR_HOLIDAYS_STORAGE_KEY,
      JSON.stringify(parsedHolidays)
    );
    return true;
  } catch (err) {
    console.error('Error restoring calendar state:', err);
    return false;
  }
}

/**
 * Restore all calculator data to IndexedDB
 */
export async function restoreCalculatorState(state) {
  if (!state) return false;

  try {
    return new Promise((resolve) => {
      const req = indexedDB.open('CalculatorDB');
      req.onsuccess = () => {
        const db = req.result;
        let completed = 0;
        let total = 3;

        // Save user snapshots
        if (state.userSnapshots && state.userSnapshots.length > 0) {
          const userTx = db.transaction(['userSnapshots'], 'readwrite');
          const userStore = userTx.objectStore('userSnapshots');
          userStore.clear();
          state.userSnapshots.forEach(snap => {
            userStore.add(snap);
          });
          userTx.oncomplete = () => {
            if (++completed === total) {
              db.close();
              resolve(true);
            }
          };
          userTx.onerror = () => {
            if (++completed === total) {
              db.close();
              resolve(false);
            }
          };
        } else {
          if (++completed === total) {
            db.close();
            resolve(true);
          }
        }

        // Save history snapshots
        if (state.historySnapshots && state.historySnapshots.length > 0) {
          const historyTx = db.transaction(['history'], 'readwrite');
          const historyStore = historyTx.objectStore('history');
          historyStore.clear();
          state.historySnapshots.forEach(snap => {
            historyStore.add(snap);
          });
          historyTx.oncomplete = () => {
            if (++completed === total) {
              db.close();
              resolve(true);
            }
          };
          historyTx.onerror = () => {
            if (++completed === total) {
              db.close();
              resolve(false);
            }
          };
        } else {
          if (++completed === total) {
            db.close();
            resolve(true);
          }
        }

        // Save current state
        if (state.currentState) {
          const currentTx = db.transaction(['current'], 'readwrite');
          const currentStore = currentTx.objectStore('current');
          currentStore.put(state.currentState, 'current');
          currentTx.oncomplete = () => {
            if (++completed === total) {
              db.close();
              resolve(true);
            }
          };
          currentTx.onerror = () => {
            if (++completed === total) {
              db.close();
              resolve(false);
            }
          };
        } else {
          if (++completed === total) {
            db.close();
            resolve(true);
          }
        }
      };
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error('Error restoring calculator state:', err);
    return false;
  }
}

/**
 * Restore calc-sheet data to IndexedDB
 */
export async function restoreCalcSheetState(sheetData) {
  if (!sheetData) return false;

  try {
    return new Promise((resolve) => {
      const req = indexedDB.open('calc-sheet-db');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['sheet'], 'readwrite');
        const store = tx.objectStore('sheet');
        store.put(sheetData, 'default');
        
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      };
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error('Error restoring calc-sheet state:', err);
    return false;
  }
}

/**
 * Get complete dashboard state
 */
export async function getDashboardState() {
  const calculatorState = await getCalculatorState();
  const calcSheetState = await getCalcSheetState();
  const calendarState = getCalendarState();

  return {
    version: 1,
    dashboard: {
      calculator: calculatorState,
      calcSheet: calcSheetState,
      calendar: calendarState
    },
    syncedAt: Date.now(),
    syncedFrom: 'calculator-app'
  };
}

/**
 * Restore complete dashboard state
 */
export async function restoreDashboardState(data) {
  if (!data || !data.dashboard) return false;

  const calcResult = await restoreCalculatorState(data.dashboard.calculator);
  const sheetResult = data.dashboard.calcSheet
    ? await restoreCalcSheetState(data.dashboard.calcSheet)
    : true;
  const calendarResult = data.dashboard.calendar
    ? restoreCalendarState(data.dashboard.calendar)
    : true;

  return calcResult && sheetResult && calendarResult;
}

/**
 * Save dashboard state TO a specific Gist URL
 * @2026-02-08 Manual save with explicit Gist URL
 */
export async function saveToGistUrl(gistUrl, state) {
  const token = getGistToken();
  if (!token) {
    return {
      success: false,
      message: 'GitHub token non configurato'
    };
  }

  const gistId = extractGistId(gistUrl);
  if (!gistId) {
    return {
      success: false,
      message: 'URL del Gist non valido'
    };
  }

  const saved = await updateGist(gistId, {
    files: {
      [GIST_DATA_FILENAME]: {
        content: JSON.stringify(state, null, 2)
      }
    }
  });

  if (!saved) {
    return {
      success: false,
      message: 'Errore salvataggio su Gist'
    };
  }

  return {
    success: true,
    message: 'Stato salvato su Gist'
  };
}

/**
 * Load dashboard state FROM a specific Gist URL
 * @2026-02-08 Manual load with explicit Gist URL
 */
export async function loadFromGistUrl(gistUrl) {
  const token = getGistToken();
  if (!token) {
    return {
      success: false,
      message: 'GitHub token non configurato'
    };
  }

  const gistId = extractGistId(gistUrl);
  if (!gistId) {
    return {
      success: false,
      message: 'URL del Gist non valido'
    };
  }

  try {
    const gist = await fetchGist(gistId);
    if (!gist) {
      throw new Error('Gist non raggiungibile');
    }

    const fileContent = gist.files[GIST_DATA_FILENAME];
    if (!fileContent || !fileContent.content) {
      throw new Error('dashboard-state.json non trovato nel Gist');
    }

    const remoteState = JSON.parse(fileContent.content);
    const restored = await restoreDashboardState(remoteState);

    if (!restored) {
      return {
        success: false,
        message: 'Errore ripristino dello stato'
      };
    }

    return {
      success: true,
      message: 'Stato caricato da Gist',
      requiresReload: true
    };
  } catch (err) {
    return {
      success: false,
      message: `Errore: ${err.message}`
    };
  }
}

/**
 * Compare timestamps between local and remote states
 */
export function compareStates(localState, remoteState) {
  if (!localState || !remoteState) return 'different';
  
  const localTime = localState.syncedAt || 0;
  const remoteTime = remoteState.syncedAt || 0;
  
  if (localTime > remoteTime) return 'local';
  if (remoteTime > localTime) return 'remote';
  return 'same';
}
