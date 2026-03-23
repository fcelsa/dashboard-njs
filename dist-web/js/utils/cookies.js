/**
 * Shared cookie helpers.
 * @module utils/cookies
 */

/**
 * Read a cookie value by name.
 * @param {string} name
 * @returns {string|null}
 */
export function getCookie(name) {
  const value = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!value) return null;
  return decodeURIComponent(value.split("=")[1]);
}

/**
 * Set a cookie.
 * @param {string} name
 * @param {string} value
 * @param {number} [maxAgeSeconds=3600]
 */
export function setCookie(name, value, maxAgeSeconds = 3600) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/`;
}

/**
 * Delete a cookie by name.
 * @param {string} name
 */
export function deleteCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/`;
}
