/**
 * GitHub Gist Synchronization for Calculator Snapshots
 * Syncs user-saved calculations to GitHub Gist
 */

import { getCookie } from './cookies.js';

const GIST_TOKEN_COOKIE_KEY = 'githubGistToken';
const GIST_DATA_FILENAME = 'calculator-saves.json';
const GITHUB_API = 'https://api.github.com';

/**
 * Get GitHub Gist token from cookies
 */
function getGistToken() {
  const key = getCookie(GIST_TOKEN_COOKIE_KEY);
  return key ? key.trim() : null;
}

/**
 * Fetch user's gists to find existing calculator gist
 * @returns {string|null} - Gist ID if found, null otherwise
 */
export async function findCalculatorGist() {
  const token = getGistToken();
  if (!token) return null;

  try {
    const response = await fetch(`${GITHUB_API}/user/gists?per_page=100`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      console.error('Error fetching gists:', response.status);
      return null;
    }

    const gists = await response.json();
    const calcGist = gists.find(g => g.description === 'Calculator Snapshots');
    return calcGist ? calcGist.id : null;
  } catch (err) {
    console.error('Error finding calculator gist:', err);
    return null;
  }
}

/**
 * Create a new gist for calculator snapshots
 * @param {Array} snapshots - Array of user snapshots
 * @returns {string|null} - Gist ID if created, null on error
 */
export async function createCalculatorGist(snapshots) {
  const token = getGistToken();
  if (!token) return null;

  try {
    const response = await fetch(`${GITHUB_API}/gists`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Calculator Snapshots',
        public: false,
        files: {
          [GIST_DATA_FILENAME]: {
            content: JSON.stringify({
              version: 1,
              snapshots,
              syncedAt: Date.now(),
              syncedFrom: 'calculator-app'
            }, null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      console.error('Error creating gist:', response.status);
      return null;
    }

    const gist = await response.json();
    return gist.id;
  } catch (err) {
    console.error('Error creating calculator gist:', err);
    return null;
  }
}

/**
 * Update existing gist with new snapshots
 * @param {string} gistId - Gist ID
 * @param {Array} snapshots - Array of user snapshots
 */
export async function updateCalculatorGist(gistId, snapshots) {
  const token = getGistToken();
  if (!token) return false;

  try {
    const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Calculator Snapshots',
        files: {
          [GIST_DATA_FILENAME]: {
            content: JSON.stringify({
              version: 1,
              snapshots,
              syncedAt: Date.now(),
              syncedFrom: 'calculator-app'
            }, null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      console.error('Error updating gist:', response.status);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error updating calculator gist:', err);
    return false;
  }
}

/**
 * Download snapshots from gist
 * @param {string} gistId - Gist ID
 * @returns {Array|null} - Array of snapshots or null on error
 */
export async function downloadCalculatorGist(gistId) {
  const token = getGistToken();
  if (!token) return null;

  try {
    const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      console.error('Error downloading gist:', response.status);
      return null;
    }

    const gist = await response.json();
    const fileContent = gist.files[GIST_DATA_FILENAME];
    if (!fileContent) return null;

    const data = JSON.parse(fileContent.content);
    return data.snapshots || [];
  } catch (err) {
    console.error('Error downloading calculator gist:', err);
    return null;
  }
}

/**
 * Merge local and remote snapshots, keeping newer versions
 * Uses timestamp to determine which version is newer
 * @param {Array} localSnapshots - Local snapshots
 * @param {Array} remoteSnapshots - Remote snapshots from gist
 * @returns {Array} - Merged snapshots
 */
export function mergeSnapshots(localSnapshots, remoteSnapshots) {
  if (!remoteSnapshots || remoteSnapshots.length === 0) return localSnapshots;
  if (!localSnapshots || localSnapshots.length === 0) return remoteSnapshots;

  // Create a map of snapshots by name for easier merging
  const merged = new Map();

  // Add local snapshots first
  localSnapshots.forEach(local => {
    merged.set(local.name, local);
  });

  // Merge with remote snapshots, keeping newer by timestamp
  remoteSnapshots.forEach(remote => {
    const existing = merged.get(remote.name);
    if (!existing) {
      merged.set(remote.name, remote);
    } else if (remote.timestamp > existing.timestamp) {
      // Remote is newer, use it
      merged.set(remote.name, remote);
    }
    // Otherwise keep existing (local is newer)
  });

  return Array.from(merged.values());
}

/**
 * Sync snapshots to GitHub Gist
 * Attempts to create gist if doesn't exist, updates if does
 * @param {Array} snapshots - Local snapshots to sync
 * @returns {Object} - {success: boolean, gistId: string|null, message: string}
 */
export async function syncToGist(snapshots) {
  const token = getGistToken();
  if (!token) {
    return {
      success: false,
      gistId: null,
      message: 'GitHub token non configurato'
    };
  }

  try {
    let gistId = await findCalculatorGist();

    if (!gistId) {
      gistId = await createCalculatorGist(snapshots);
      if (!gistId) {
        return {
          success: false,
          gistId: null,
          message: 'Errore creazione Gist'
        };
      }
      return {
        success: true,
        gistId,
        message: `Gist creato: ${gistId}`
      };
    } else {
      const success = await updateCalculatorGist(gistId, snapshots);
      if (!success) {
        return {
          success: false,
          gistId,
          message: 'Errore aggiornamento Gist'
        };
      }
      return {
        success: true,
        gistId,
        message: 'Sincronizzazione completata'
      };
    }
  } catch (err) {
    return {
      success: false,
      gistId: null,
      message: `Errore: ${err.message}`
    };
  }
}

/**
 * Sync from GitHub Gist and merge with local
 * @param {Array} localSnapshots - Current local snapshots
 * @returns {Object} - {success: boolean, snapshots: Array|null, message: string}
 */
export async function syncFromGist(localSnapshots) {
  const token = getGistToken();
  if (!token) {
    return {
      success: false,
      snapshots: null,
      message: 'GitHub token non configurato'
    };
  }

  try {
    const gistId = await findCalculatorGist();
    if (!gistId) {
      return {
        success: false,
        snapshots: null,
        message: 'Nessun Gist trovato'
      };
    }

    const remoteSnapshots = await downloadCalculatorGist(gistId);
    if (!remoteSnapshots) {
      return {
        success: false,
        snapshots: null,
        message: 'Errore download da Gist'
      };
    }

    const merged = mergeSnapshots(localSnapshots, remoteSnapshots);
    return {
      success: true,
      snapshots: merged,
      message: 'Sincronizzazione da Gist completata'
    };
  } catch (err) {
    return {
      success: false,
      snapshots: null,
      message: `Errore: ${err.message}`
    };
  }
}

/**
 * Check if a snapshot is newer on remote or local
 * @param {Object} local - Local snapshot
 * @param {Object} remote - Remote snapshot  
 * @returns {string} - 'local', 'remote', or 'same'
 */
export function compareSnapshots(local, remote) {
  if (!local || !remote) return 'different';
  if (local.timestamp > remote.timestamp) return 'local';
  if (remote.timestamp > local.timestamp) return 'remote';
  return 'same';
}
