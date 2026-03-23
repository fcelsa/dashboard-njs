/**
 * IndexedDB storage for calculator history.
 * Stores up to 8 snapshots of calculator state with timestamps.
 * Current state is always saved separately.
 */

const DB_NAME = 'CalculatorDB';
const DB_VERSION = 2;
const STORE_HISTORY = 'history';
const STORE_CURRENT = 'current';
const STORE_USER_SNAPSHOTS = 'userSnapshots';
const MAX_HISTORY = 8;
const MAX_USER_SNAPSHOTS = 8;

let db = null;

/**
 * Initialize the database
 */
export async function initCalcHistoryDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (event) => {
      const idb = event.target.result;
      if (!idb.objectStoreNames.contains(STORE_HISTORY)) {
        const store = idb.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!idb.objectStoreNames.contains(STORE_CURRENT)) {
        idb.createObjectStore(STORE_CURRENT);
      }
      if (!idb.objectStoreNames.contains(STORE_USER_SNAPSHOTS)) {
        const userStore = idb.createObjectStore(STORE_USER_SNAPSHOTS, { keyPath: 'id', autoIncrement: true });
        userStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Save current calculator state (entries, accums, etc)
 * @param {Object} state - { entries, accumulator, grandTotal, ... }
 */
export async function saveCurrentState(state) {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CURRENT], 'readwrite');
    const store = tx.objectStore(STORE_CURRENT);
    const req = store.put(state, 'current');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Load current calculator state
 */
export async function loadCurrentState() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CURRENT], 'readonly');
    const store = tx.objectStore(STORE_CURRENT);
    const req = store.get('current');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || null);
  });
}

/**
 * Add snapshot to history with timestamp
 * Enforces MAX_HISTORY limit by removing oldest if needed
 * @param {Object} snapshot - { entries, accumulator, grandTotal, ... }
 * @returns {Object} - saved snapshot with id and timestamp
 */
export async function addHistorySnapshot(snapshot) {
  if (!db) await initCalcHistoryDB();
  
  // Get current count
  const count = await getHistoryCount();
  
  // If we've reached max, remove oldest
  if (count >= MAX_HISTORY) {
    const oldest = await getOldestSnapshot();
    if (oldest) {
      await deleteHistorySnapshot(oldest.id);
    }
  }
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY], 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    const entry = {
      ...snapshot,
      timestamp: Date.now()
    };
    const req = store.add(entry);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      entry.id = req.result;
      resolve(entry);
    };
  });
}

/**
 * Get all history snapshots, ordered by timestamp desc (newest first)
 */
export async function getAllHistorySnapshots() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY], 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const index = store.index('timestamp');
    const req = index.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const results = req.result || [];
      resolve(results.reverse()); // newest first
    };
  });
}

/**
 * Get oldest snapshot by timestamp
 */
async function getOldestSnapshot() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY], 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const index = store.index('timestamp');
    const req = index.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const results = req.result || [];
      resolve(results.length > 0 ? results[0] : null);
    };
  });
}

/**
 * Delete a history snapshot by id
 */
export async function deleteHistorySnapshot(id) {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY], 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Get a specific history snapshot by id
 */
export async function getHistorySnapshot(id) {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY], 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || null);
  });
}

/**
 * Get count of history snapshots
 */
async function getHistoryCount() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY], 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.count();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || 0);
  });
}

/**
 * Clear all history
 */
export async function clearAllHistory() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY, STORE_CURRENT], 'readwrite');
    const histStore = tx.objectStore(STORE_HISTORY);
    const currStore = tx.objectStore(STORE_CURRENT);
    const req1 = histStore.clear();
    const req2 = currStore.clear();
    req1.onerror = () => reject(req1.error);
    req2.onerror = () => reject(req2.error);
    tx.oncomplete = () => resolve();
  });
}

/**
 * Format timestamp as YYYY-MM-DD-HH:MM:SS
 */
export function formatTimestamp(ts) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}:${mins}:${secs}`;
}

// --- USER SNAPSHOTS (Named Saves) ---

/**
 * Save a named snapshot (user can save up to 8 named calculations)
 * @param {string} name - Name for the snapshot (max 30 chars)
 * @param {Object} snapshot - Calculator snapshot object
 * @returns {Object} - Saved snapshot with id and timestamp
 */
export async function saveUserSnapshot(name, snapshot) {
  if (!db) await initCalcHistoryDB();
  
  const count = await getUserSnapshotCount();
  if (count >= MAX_USER_SNAPSHOTS) {
    throw new Error(`Maximum ${MAX_USER_SNAPSHOTS} saved calculations reached`);
  }
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_USER_SNAPSHOTS], 'readwrite');
    const store = tx.objectStore(STORE_USER_SNAPSHOTS);
    const entry = {
      name: name.substring(0, 30), // enforce max 30 chars
      snapshot,
      timestamp: Date.now()
    };
    const req = store.add(entry);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      entry.id = req.result;
      resolve(entry);
    };
  });
}

/**
 * Get all user snapshots, ordered by timestamp desc (newest first)
 */
export async function getAllUserSnapshots() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_USER_SNAPSHOTS], 'readonly');
    const store = tx.objectStore(STORE_USER_SNAPSHOTS);
    const index = store.index('timestamp');
    const req = index.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const results = req.result || [];
      resolve(results.reverse()); // newest first
    };
  });
}

/**
 * Get a specific user snapshot by id
 */
export async function getUserSnapshot(id) {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_USER_SNAPSHOTS], 'readonly');
    const store = tx.objectStore(STORE_USER_SNAPSHOTS);
    const req = store.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || null);
  });
}

/**
 * Delete a user snapshot by id
 */
export async function deleteUserSnapshot(id) {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_USER_SNAPSHOTS], 'readwrite');
    const store = tx.objectStore(STORE_USER_SNAPSHOTS);
    const req = store.delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Get count of user snapshots
 */
export async function getUserSnapshotCount() {
  if (!db) await initCalcHistoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_USER_SNAPSHOTS], 'readonly');
    const store = tx.objectStore(STORE_USER_SNAPSHOTS);
    const req = store.count();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || 0);
  });
}

