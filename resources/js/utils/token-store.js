/**
 * Central store for the GitHub Gist token and dashboard Gist URL.
 * Values live in localStorage: unlike the legacy cookie they are never
 * attached to HTTP requests and need no expiry management. @2026-07-09
 * @module utils/token-store
 */

import { getCookie, deleteCookie } from './cookies.js';

const GIST_TOKEN_STORAGE_KEY = 'githubGistToken';
const GIST_URL_STORAGE_KEY = 'dashboardGistUrl';

/**
 * Read a value from localStorage, migrating a legacy cookie with the same
 * name on first access so existing users keep their saved token/URL. @2026-07-09
 * @param {string} key
 * @returns {string|null}
 */
function readWithCookieMigration(key) {
  const stored = localStorage.getItem(key);
  if (stored && stored.trim()) return stored.trim();

  const legacy = getCookie(key);
  if (!legacy) return null;

  const value = legacy.trim();
  if (value) localStorage.setItem(key, value);
  deleteCookie(key);
  return value || null;
}

/**
 * Get the GitHub Gist token.
 * @returns {string|null}
 */
export function getGistToken() {
  return readWithCookieMigration(GIST_TOKEN_STORAGE_KEY);
}

/**
 * Persist the GitHub Gist token.
 * @param {string} token
 */
export function setGistToken(token) {
  if (!token || !token.trim()) return;
  localStorage.setItem(GIST_TOKEN_STORAGE_KEY, token.trim());
}

/**
 * Remove the stored GitHub Gist token (localStorage and legacy cookie).
 */
export function clearGistToken() {
  localStorage.removeItem(GIST_TOKEN_STORAGE_KEY);
  deleteCookie(GIST_TOKEN_STORAGE_KEY);
}

/**
 * Get the dashboard Gist URL.
 * @returns {string|null}
 */
export function getGistUrl() {
  return readWithCookieMigration(GIST_URL_STORAGE_KEY);
}

/**
 * Persist the dashboard Gist URL.
 * @param {string} url
 */
export function setGistUrl(url) {
  if (!url || !url.trim()) return;
  localStorage.setItem(GIST_URL_STORAGE_KEY, url.trim());
}

/**
 * Remove the stored dashboard Gist URL (localStorage and legacy cookie).
 */
export function clearGistUrl() {
  localStorage.removeItem(GIST_URL_STORAGE_KEY);
  deleteCookie(GIST_URL_STORAGE_KEY);
}
