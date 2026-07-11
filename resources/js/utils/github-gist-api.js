/**
 * Minimal authenticated GitHub Gist REST client.
 * Single place for the API base URL, auth header and JSON handling,
 * shared by every sync module. @2026-07-09
 * @module utils/github-gist-api
 */

import { getGistToken } from './token-store.js';

const GITHUB_API = 'https://api.github.com';

/**
 * Perform an authenticated GitHub API request.
 * @param {string} apiPath - path starting with '/', e.g. '/gists/abc123'
 * @param {{method?: string, body?: object}} [options]
 * @returns {Promise<Response|null>} null when no token is configured
 */
export async function githubRequest(apiPath, options = {}) {
  const token = getGistToken();
  if (!token) return null;

  const { method = 'GET', body } = options;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(`${GITHUB_API}${apiPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

/**
 * Fetch a gist by id.
 * @param {string} gistId
 * @returns {Promise<object|null>} the gist JSON, or null on error/no token
 */
export async function fetchGist(gistId) {
  try {
    const response = await githubRequest(`/gists/${gistId}`);
    if (!response?.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Error fetching gist:', err);
    return null;
  }
}

/**
 * List the authenticated user's gists (first 100).
 * @returns {Promise<Array|null>}
 */
export async function listGists() {
  try {
    const response = await githubRequest('/user/gists?per_page=100');
    if (!response?.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Error listing gists:', err);
    return null;
  }
}

/**
 * Create a private gist.
 * @param {string} description
 * @param {object} files - GitHub files payload ({ name: { content } })
 * @returns {Promise<string|null>} the new gist id, or null on error
 */
export async function createGist(description, files) {
  try {
    const response = await githubRequest('/gists', {
      method: 'POST',
      body: { description, public: false, files }
    });
    if (!response?.ok) return null;
    const gist = await response.json();
    return gist.id;
  } catch (err) {
    console.error('Error creating gist:', err);
    return null;
  }
}

/**
 * Update an existing gist.
 * @param {string} gistId
 * @param {object} payload - GitHub PATCH payload (description/files)
 * @returns {Promise<boolean>}
 */
export async function updateGist(gistId, payload) {
  try {
    const response = await githubRequest(`/gists/${gistId}`, {
      method: 'PATCH',
      body: payload
    });
    return Boolean(response?.ok);
  } catch (err) {
    console.error('Error updating gist:', err);
    return false;
  }
}

/**
 * Check that the stored token authenticates against GitHub.
 * @returns {Promise<boolean>}
 */
export async function verifyToken() {
  try {
    const response = await githubRequest('/user');
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}
