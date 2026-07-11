/**
 * GitHub Gist Synchronization for Calculator Snapshots
 * Syncs user-saved calculations to GitHub Gist
 */

import { getGistToken } from './token-store.js';
import { listGists, createGist, updateGist, fetchGist } from './github-gist-api.js';

const GIST_DATA_FILENAME = 'calculator-saves.json';
const GIST_DESCRIPTION = 'Calculator Snapshots';

function buildGistFiles(snapshots) {
  return {
    [GIST_DATA_FILENAME]: {
      content: JSON.stringify({
        version: 1,
        snapshots,
        syncedAt: Date.now(),
        syncedFrom: 'calculator-app'
      }, null, 2)
    }
  };
}

/**
 * Fetch user's gists to find existing calculator gist
 * @returns {string|null} - Gist ID if found, null otherwise
 */
export async function findCalculatorGist() {
  const gists = await listGists();
  if (!gists) return null;

  const calcGist = gists.find(g => g.description === GIST_DESCRIPTION);
  return calcGist ? calcGist.id : null;
}

/**
 * Create a new gist for calculator snapshots
 * @param {Array} snapshots - Array of user snapshots
 * @returns {string|null} - Gist ID if created, null on error
 */
export async function createCalculatorGist(snapshots) {
  return createGist(GIST_DESCRIPTION, buildGistFiles(snapshots));
}

/**
 * Update existing gist with new snapshots
 * @param {string} gistId - Gist ID
 * @param {Array} snapshots - Array of user snapshots
 */
export async function updateCalculatorGist(gistId, snapshots) {
  return updateGist(gistId, {
    description: GIST_DESCRIPTION,
    files: buildGistFiles(snapshots)
  });
}

/**
 * Download snapshots from gist
 * @param {string} gistId - Gist ID
 * @returns {Array|null} - Array of snapshots or null on error
 */
export async function downloadCalculatorGist(gistId) {
  const gist = await fetchGist(gistId);
  if (!gist) return null;

  const fileContent = gist.files[GIST_DATA_FILENAME];
  if (!fileContent) return null;

  try {
    const data = JSON.parse(fileContent.content);
    return data.snapshots || [];
  } catch (err) {
    console.error('Error parsing calculator gist:', err);
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
