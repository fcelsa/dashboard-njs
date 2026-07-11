/**
 * Settings tab: GitHub token/Gist URL forms and the runtime info card.
 * Extracted from script.js. @2026-07-09
 * @module settings
 */

import {
  getGistToken,
  setGistToken,
  clearGistToken,
  getGistUrl,
  setGistUrl,
  clearGistUrl,
} from './utils/token-store.js';

const gistKeyForm = document.getElementById("gist-key-form");
const gistKeyInput = document.getElementById("gist-token");
const gistKeyStatus = document.getElementById("gist-key-status");
const gistKeyClearBtn = document.getElementById("clear-gist-token");
const gistKeyToggleBtn = document.getElementById("toggle-gist-token");
const gistKeyCopyBtn = document.getElementById("copy-gist-token");
const gistUrlInput = document.getElementById("gist-url");
const gistUrlStatus = document.getElementById("gist-url-status");
const saveGistUrlBtn = document.getElementById("save-gist-url");
const clearGistUrlBtn = document.getElementById("clear-gist-url");
const gistUrlToggleBtn = document.getElementById("toggle-gist-url");
const gistUrlCopyBtn = document.getElementById("copy-gist-url");
const settingsRuntimeGridEl = document.getElementById("settings-runtime-grid");

function maskApiKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}••••${tail}`;
}

function syncSensitiveInputValue(inputEl, storedValue) {
  if (!inputEl) return;
  const isEditingThisField = document.activeElement === inputEl && inputEl.value.trim();
  if (isEditingThisField) return;
  inputEl.value = storedValue || "";
  if (inputEl.type !== "password" && !storedValue) {
    inputEl.type = "password";
  }
}

function syncRevealButtonState(buttonEl, inputEl) {
  if (!buttonEl || !inputEl) return;
  const isVisible = inputEl.type === "text";
  buttonEl.textContent = isVisible ? "🙈" : "👁";
  buttonEl.title = isVisible ? "Nascondi" : "Mostra";
  buttonEl.setAttribute("aria-label", isVisible ? "Nascondi valore" : "Mostra valore");
}

function setupRevealToggle(buttonEl, inputEl) {
  if (!buttonEl || !inputEl) return;
  syncRevealButtonState(buttonEl, inputEl);
  buttonEl.addEventListener("click", () => {
    inputEl.type = inputEl.type === "password" ? "text" : "password";
    syncRevealButtonState(buttonEl, inputEl);
  });
}

function setupCopyButton(buttonEl, getValue, statusEl, successText) {
  if (!buttonEl) return;
  buttonEl.addEventListener("click", async () => {
    const value = typeof getValue === "function" ? String(getValue() || "").trim() : "";
    if (!value) {
      if (statusEl) statusEl.textContent = "Nessun valore da copiare.";
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (statusEl) statusEl.textContent = successText;
    } catch {
      if (statusEl) statusEl.textContent = "Copia non disponibile in questa sessione.";
    }
  });
}

function renderSettingsRuntime(rows) {
  if (!settingsRuntimeGridEl) return;
  settingsRuntimeGridEl.innerHTML = rows
    .map(
      ({ key, value }) =>
        `<div class="runtime-row"><span class="runtime-key">${key}</span><span class="runtime-value">${value}</span></div>`
    )
    .join("");
}

function getExecutionModeLabel() {
  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
  const isDev = args.some(
    (arg) => arg === "--neu-dev-extension" || arg === "--neu-dev-auto-reload" || arg === "--debug-mode"
  );
  return isDev ? "Debug (neu run)" : "Eseguibile (release)";
}

async function updateSettingsRuntimeInfo() {
  const neutralinoAvailable = !!window.Neutralino?.app?.getConfig;
  const fallbackRows = [
    { key: "Modalità", value: getExecutionModeLabel() },
    { key: "Neutralino", value: window.NL_CVERSION ? `client ${window.NL_CVERSION}` : "n/d" },
    { key: "Piattaforma", value: navigator.userAgent || navigator.platform || "n/d" },
    { key: "Origin", value: window.location.origin || "n/d" },
    { key: "Storage dati", value: "Cookie + IndexedDB (scope per origin)" },
    {
      key: "Sessione",
      value: `cookies ${document.cookie ? document.cookie.split(";").filter(Boolean).length : 0}, indexedDB ${
        "indexedDB" in window ? "ok" : "n/a"
      }`,
    },
  ];

  if (!neutralinoAvailable) {
    renderSettingsRuntime(fallbackRows);
    return;
  }

  try {
    const [config, osInfo, arch, dataPath] = await Promise.all([
      window.Neutralino.app.getConfig(),
      window.Neutralino.computer?.getOSInfo?.().catch(() => null),
      window.Neutralino.computer?.getArch?.().catch(() => null),
      window.Neutralino.os?.getPath?.("data").catch(() => null),
    ]);

    renderSettingsRuntime([
      { key: "Modalità", value: getExecutionModeLabel() },
      {
        key: "Neutralino",
        value: `client ${window.NL_CVERSION || config?.cli?.clientVersion || "n/d"} · binary ${
          config?.cli?.binaryVersion || "n/d"
        }`,
      },
      {
        key: "Piattaforma",
        value: `${osInfo?.name || window.NL_OS || "n/d"} ${osInfo?.version || ""} ${arch || ""}`.trim(),
      },
      { key: "Origin", value: `${window.location.origin} (port ${window.NL_PORT || config?.port || "n/d"})` },
      {
        key: "Storage dati",
        value: `${dataPath || "n/d"} · Cookie/IndexedDB legati a origin`,
      },
      {
        key: "Sessione",
        value: `tokenSecurity ${config?.tokenSecurity || "n/d"} · cookies ${
          document.cookie ? document.cookie.split(";").filter(Boolean).length : 0
        } · indexedDB ${"indexedDB" in window ? "ok" : "n/a"}`,
      },
    ]);
  } catch {
    renderSettingsRuntime(fallbackRows);
  }
}

// --- GITHUB GIST TOKEN ---
function updateGistKeyStatus() {
  const stored = getGistToken();
  syncSensitiveInputValue(gistKeyInput, stored);
  if (gistKeyStatus) {
    if (stored) {
      gistKeyStatus.textContent = `Token salvato (${maskApiKey(stored)}).`;
    } else {
      gistKeyStatus.textContent = "Nessun token salvato.";
    }
  }
}

// --- GITHUB GIST URL ---
function updateGistUrlStatus() {
  const stored = getGistUrl();
  syncSensitiveInputValue(gistUrlInput, stored);
  if (gistUrlStatus) {
    if (stored) {
      gistUrlStatus.textContent = "URL Gist salvato.";
    } else {
      gistUrlStatus.textContent = "Nessun URL salvato.";
    }
  }
}

/**
 * Bind the settings forms and render the initial state. @2026-07-09
 */
export function initSettings() {
  if (gistKeyForm) {
    gistKeyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = gistKeyInput?.value?.trim();
      if (!value) {
        if (gistKeyStatus) gistKeyStatus.textContent = "Inserisci un token valido.";
        return;
      }
      setGistToken(value);
      updateGistKeyStatus();
    });
  }

  if (gistKeyClearBtn) {
    gistKeyClearBtn.addEventListener("click", () => {
      clearGistToken();
      updateGistKeyStatus();
    });
  }

  if (saveGistUrlBtn) {
    saveGistUrlBtn.addEventListener("click", () => {
      const value = gistUrlInput?.value?.trim();
      if (!value) {
        if (gistUrlStatus) gistUrlStatus.textContent = "Inserisci un URL valido.";
        return;
      }
      setGistUrl(value);
      updateGistUrlStatus();
    });
  }

  if (clearGistUrlBtn) {
    clearGistUrlBtn.addEventListener("click", () => {
      clearGistUrl();
      updateGistUrlStatus();
    });
  }

  setupRevealToggle(gistKeyToggleBtn, gistKeyInput);
  setupRevealToggle(gistUrlToggleBtn, gistUrlInput);

  setupCopyButton(
    gistKeyCopyBtn,
    () => getGistToken() || gistKeyInput?.value,
    gistKeyStatus,
    "Token GitHub copiato."
  );
  setupCopyButton(
    gistUrlCopyBtn,
    () => getGistUrl() || gistUrlInput?.value,
    gistUrlStatus,
    "URL Gist copiato."
  );

  updateGistKeyStatus();

  updateGistKeyStatus();
  updateGistUrlStatus();
  updateSettingsRuntimeInfo();
}
