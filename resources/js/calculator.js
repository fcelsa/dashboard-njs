import { CalculatorEngine } from './calculator-engine.js';
import { getCookie, setCookie } from './utils/cookies.js';
import {
  initCalcHistoryDB,
  saveCurrentState,
  formatTimestamp,
  saveUserSnapshot,
  getAllUserSnapshots,
  getUserSnapshot,
  deleteUserSnapshot,
    getUserSnapshotCount
} from './utils/calc-history-db.js';
import {
  getDashboardState,
  saveToGistUrl,
  loadFromGistUrl
} from './utils/dashboard-sync.js';

document.addEventListener("DOMContentLoaded", async () => {
  try {
        // --- DB INIT ---
    await initCalcHistoryDB();

    // --- DOM ---
    const vfdDisplay = document.getElementById("vfd-display");
    const vfdDisplayWrap = document.querySelector(".vfd-display");
    const vfdStack = document.getElementById("vfd-stack");
    const calculatorWrapper = document.querySelector(".calculator-wrapper");
    const paperTape = document.getElementById("paper-tape");
    const keys = document.querySelectorAll(".key-btn");
    const iconMem = document.getElementById("icon-mem");
    const iconGT = document.getElementById("icon-gt");
    const iconGTValue = document.getElementById("icon-gt-value");
    const iconTapeCount = document.getElementById("icon-tape-count");
    const iconOperator = document.getElementById("icon-operator");
    const iconBusiness = document.getElementById("icon-business");
    const keyButtonsMap = new Map();
    
    // Switch Elements
    const switchRO = document.getElementById("switch-ro");
    const switchDEC = document.getElementById("switch-dec");
    const switchACC = document.getElementById("switch-acc");
    const switchPRT = document.getElementById("switch-prt");

    // --- SETTINGS ---
    // Loading (Persistence)
    function loadSettings() {
        if (!switchRO || !switchDEC || !switchACC || !switchPRT) return;

        const storedRO = localStorage.getItem("logos_RO");
        const storedDEC = localStorage.getItem("logos_DEC");
        const storedACC = localStorage.getItem("logos_ACC");
        const storedPRT = localStorage.getItem("logos_PRT");

        if (storedRO !== null) switchRO.value = storedRO;
        if (storedDEC !== null) switchDEC.value = storedDEC;
        if (storedACC !== null) switchACC.checked = (storedACC === "true");
        if (storedPRT !== null) switchPRT.checked = (storedPRT === "true");
    }

    // Save settings on change
    function saveSettings() {
        if (!switchRO || !switchDEC || !switchACC || !switchPRT) return;
        
        localStorage.setItem("logos_RO", switchRO.value);
        localStorage.setItem("logos_DEC", switchDEC.value);
        localStorage.setItem("logos_ACC", switchACC.checked);
        localStorage.setItem("logos_PRT", switchPRT.checked);
    }

    // Helper to read current rounding settings
    function getRoundingSettings() {
        if (!switchRO || !switchDEC) return { mode: 'none', decimals: 2, isFloat: false, addMode: false, accumulateGT: false };

        // RO: 0=Truncate, 1=5/4 (None/Standard), 2=Up
        const roIndex = parseInt(switchRO.value, 10);
        let mode = 'none'; // Default to standard rounding (5/4) which is 'none' in business.js
        if (roIndex === 0) mode = 'truncate';
        if (roIndex === 2) mode = 'up';

        // DEC: 0=+, 1=0, 2=2, 3=3, 4=4, 5=6, 6=F
        const decIndex = parseInt(switchDEC.value, 10);
        let decimals = 2;
        let isFloat = false;
        let addMode = false;
        
        // Updated DEC Mapping (+, 0, 2, 3, 4, 6, F)
        switch (decIndex) {
            case 0: addMode = true; decimals = 2; break;
            case 1: decimals = 0; break;
            case 2: decimals = 2; break;
            case 3: decimals = 3; break;
            case 4: decimals = 4; break;
            case 5: decimals = 6; break;
            case 6: isFloat = true; break;
        }

        const accumulateGT = switchACC ? switchACC.checked : false;

        return { mode, decimals, isFloat, addMode, accumulateGT };
    }

    // --- SETTINGS LISTENERS ---
    if (switchRO) switchRO.addEventListener("change", saveSettings);
    if (switchDEC) switchDEC.addEventListener("change", saveSettings);
    if (switchACC) switchACC.addEventListener("change", saveSettings);
    if (switchPRT) switchPRT.addEventListener("change", saveSettings);

    // Init Logic
    loadSettings();

    // --- UI STATE ---
    let isTextMode = false; 
    let textModeBuffer = ""; 
    let errorState = false;
    let vfdOffTimeout = null;
    let paperResetTimeout = null;
    let suppressClearPrint = false;
    let pendingMemoryChord = false;
    let pendingMemoryTimeout = null;
    let pendingGTChord = false;
    let pendingGTTimeout = null;
    let pendingRateInput = false;
    let rateEditActive = false;
    let taxRateHoldTimeout = null;
    let taxRateHoldTriggered = false;
    let suppressTaxPlusClick = false;
    // --- FOCUS STATE ---
    const isCalculatorTabActive = () => {
        const calculatorTab = document.querySelector('[data-tab-panel="calculator"]');
        return Boolean(calculatorTab && calculatorTab.classList.contains('active'));
    };

    const hasCalculatorKeyboardFocus = () => {
        if (!calculatorWrapper) return false;
        const activeEl = document.activeElement;
        return activeEl === calculatorWrapper || calculatorWrapper.matches(':focus-within');
    };

    const isCalculatorFocused = () => {
        if (!calculatorWrapper) return false;
        if (!isCalculatorTabActive()) return false;
        return hasCalculatorKeyboardFocus();
    };

    const FOCUS_DEBUG = true;

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
        const payload = {
            tabActive: isCalculatorTabActive(),
            calculatorFocused: hasCalculatorKeyboardFocus(),
            activeElement: describeElement(document.activeElement),
            ...extra
        };
        console.debug('[calculator-focus]', label, payload);
        if (window.__focusDebugLog) {
            window.__focusDebugLog('calculator-focus', label, payload);
        }
    };

    function syncCalculatorFocusLed() {
        if (!calculatorWrapper) return;
        const isOn = isCalculatorTabActive() && hasCalculatorKeyboardFocus();
        calculatorWrapper.classList.toggle('is-keyboard-focus', isOn);
    }

    function focusCalculatorWrapper() {
        if (!calculatorWrapper || !isCalculatorTabActive()) {
            logFocusDebug('focusCalculatorWrapper:skip');
            return;
        }
        logFocusDebug('focusCalculatorWrapper:before');
        try {
            calculatorWrapper.focus({ preventScroll: true });
        } catch {
            calculatorWrapper.focus();
        }
        syncCalculatorFocusLed();
        logFocusDebug('focusCalculatorWrapper:after');
    }

    function focusCalculatorWrapperDeferred(delayMs = 0) {
        if (!calculatorWrapper) return;
        setTimeout(() => {
            if (!isCalculatorTabActive()) return;
            requestAnimationFrame(() => focusCalculatorWrapper());
        }, delayMs);
    }

    function hasEditableFocus() {
        const activeEl = document.activeElement;
        if (!activeEl) return false;
        if (activeEl === calculatorWrapper || activeEl === document.body || activeEl === document.documentElement) {
            return false;
        }
        const tagName = activeEl.tagName;
        return (
            tagName === 'INPUT' ||
            tagName === 'TEXTAREA' ||
            tagName === 'SELECT' ||
            activeEl.isContentEditable
        );
    }

    if (calculatorWrapper) {
        calculatorWrapper.addEventListener('focusin', () => {
            syncCalculatorFocusLed();
            logFocusDebug('wrapper:focusin');
        });
        calculatorWrapper.addEventListener('focusout', () => {
            setTimeout(syncCalculatorFocusLed, 0);
            logFocusDebug('wrapper:focusout');
        });
    }

    // --- GITHUB SYNC UI ---
    const gistLoadBtn = document.getElementById("gist-load-btn");
    const gistSaveBtn = document.getElementById("gist-save-btn");
    const githubLoginStatus = document.getElementById("github-login-status");
    const tokenStatus = document.getElementById("token-status");
    const gistUrlIndicator = document.getElementById("gist-url-indicator");
    
    const GIST_TOKEN_COOKIE_KEY = 'githubGistToken';
    const GIST_URL_COOKIE_KEY = 'dashboardGistUrl';
    
    /**
     * Get Gist token from cookies
     */
    function getGistTokenFromCookie() {
      const token = getCookie(GIST_TOKEN_COOKIE_KEY);
      return token ? token.trim() : null;
    }
    
    /**
     * Get Gist URL from cookies
     */
    function getGistUrlFromCookie() {
      const url = getCookie(GIST_URL_COOKIE_KEY);
      return url ? url.trim() : null;
    }
    
    /**
     * Update GitHub status indicators in Status Card
     * Shows GitHub auth status, token presence, and Gist URL status
     * @2026-02-08
     */
    function updateGitHubStatusIndicators() {
        const hasToken = getGistTokenFromCookie() !== null;
        const hasUrl = getGistUrlFromCookie() !== null;
        
        // Check GitHub authentication by attempting to verify token
        if (hasToken) {
            fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${getGistTokenFromCookie()}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }).then(response => {
                const isAuthenticated = response.ok;
                if (githubLoginStatus) {
                    githubLoginStatus.classList.toggle('active', isAuthenticated);
                }
            }).catch(err => {
                if (githubLoginStatus) {
                    githubLoginStatus.classList.remove('active');
                }
            });
        } else if (githubLoginStatus) {
            githubLoginStatus.classList.remove('active');
        }
        
        // Show token status
        if (tokenStatus) {
            tokenStatus.classList.toggle('active', hasToken);
        }
        
        // Show Gist URL status
        if (gistUrlIndicator) {
            gistUrlIndicator.classList.toggle('active', hasUrl);
        }
        
        // Update button states
        updateSyncButtonStates();
    }
    
    /**
     * Update load/save button disabled state based on conditions
     */
    function updateSyncButtonStates() {
        const hasToken = getGistTokenFromCookie() !== null;
        const hasUrl = getGistUrlFromCookie() !== null;
        const canSync = hasToken && hasUrl;
        
        if (gistLoadBtn) gistLoadBtn.disabled = !canSync;
        if (gistSaveBtn) gistSaveBtn.disabled = !canSync;
    }
    
    // Event listener for Load button
    if (gistLoadBtn) {
        gistLoadBtn.addEventListener('click', async () => {
            const gistUrl = getGistUrlFromCookie();
            if (!gistUrl) {
                alert('Configura l\'URL del Gist nelle Impostazioni');
                return;
            }
            gistLoadBtn.disabled = true;
            gistLoadBtn.textContent = '↓ Caricamento...';
            try {
                const result = await loadFromGistUrl(gistUrl);
                if (result.success) {
                    alert(`✓ ${result.message}`);
                    if (result.requiresReload) {
                        setTimeout(() => location.reload(), 500);
                    }
                } else {
                    alert(`⚠ ${result.message}`);
                }
            } catch (err) {
                alert(`Errore: ${err.message}`);
            } finally {
                gistLoadBtn.disabled = false;
                gistLoadBtn.textContent = '↓ Carica';
                updateSyncButtonStates();
            }
        });
    }
    
    // Event listener for Save button
    if (gistSaveBtn) {
        gistSaveBtn.addEventListener('click', async () => {
            const gistUrl = getGistUrlFromCookie();
            if (!gistUrl) {
                alert('Configura l\'URL del Gist nelle Impostazioni');
                return;
            }
            gistSaveBtn.disabled = true;
            gistSaveBtn.textContent = '↑ Salvataggio...';
            try {
                const state = await getDashboardState();
                const result = await saveToGistUrl(gistUrl, state);
                if (result.success) {
                    alert(`✓ ${result.message}`);
                } else {
                    alert(`⚠ ${result.message}`);
                }
            } catch (err) {
                alert(`Errore: ${err.message}`);
            } finally {
                gistSaveBtn.disabled = false;
                gistSaveBtn.textContent = '↑ Salva';
                updateSyncButtonStates();
            }
        });
    }
    
    // Initial status check
    updateGitHubStatusIndicators();
    // Re-check status periodically (every 30 seconds)
    setInterval(updateGitHubStatusIndicators, 30000);

    // --- ENGINE ---
    const engine = new CalculatorEngine();

    // Bind Engine Callbacks
    engine.onDisplayUpdate = (val) => {
        updateDisplay(val);
    };

    engine.onTapePrint = (entry) => {
        if (suppressClearPrint && entry?.symbol === "C" && entry?.key === "C") {
            return;
        }
        // Index is the last position in the engine entries array
        renderSingleEntry(entry, engine.entries.length - 1);
    };

    // Implements Full Refund (Clear & Redraw for Undo / Edit)
    engine.onTapeRefresh = (entries) => {
        if (!paperTape) return;
        paperTape.innerHTML = ''; // Clear
        entries.forEach((entry, idx) => renderSingleEntry(entry, idx));
        updateTapeCount();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry?.type === 'result') {
            updateOperatorIndicator('=');
            setBusinessIndicator(businessKeys.has(lastEntry.key));
        } else if (lastEntry?.symbol) {
            updateOperatorIndicator(lastEntry.symbol);
            setBusinessIndicator(false);
        }
    };

    engine.onStatusUpdate = (status) => {
        const iconMinus = document.getElementById("icon-minus");
        if (iconGT) {
            iconGT.classList.toggle("on", status.gt);
            iconGT.classList.toggle("off", !status.gt);
        }
        if (iconGTValue) {
            const gtValue = engine?.grandTotal ?? 0;
            iconGTValue.textContent = status.gt ? formatNumber(gtValue) : "";
        }
        if (iconMinus) iconMinus.className = status.minus ? "vfd-icon on" : "vfd-icon off";
    };
    function formatStackValue(value) {
        const rounded = Math.round(Number(value) * 1000) / 1000;
        let text = rounded
            .toFixed(3)
            .replace(/\.0+$/, "")
            .replace(/(\.[0-9]*?)0+$/, "$1");
        if (text.endsWith('.')) text = text.slice(0, -1);
        const parts = text.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
        return parts.join(',');
    }

    engine.onMemoryUpdate = (memory) => {
        if (iconMem) iconMem.className = memory.hasMemory ? "vfd-icon on" : "vfd-icon off";
        if (!vfdStack) return;
        if (memory.mode === 'stack' && memory.stack.length > 0) {
            const items = memory.stack.slice(-8).map(formatStackValue);
            vfdStack.textContent = items.join(' · ');
        } else {
            vfdStack.textContent = '';
        }
    };

    engine.onError = (msg) => {
        updateDisplay(msg);
        // Play error sound?
    };

    // --- ENGINE SETTINGS SYNC ---
    let displaySettings = getRoundingSettings();

    function updateEngineSettings() {
        if (!engine) return;
        const s = getRoundingSettings();
        displaySettings = s;
        engine.updateSettings({
            roundingMode: s.mode,
            decimals: s.decimals,
            isFloat: s.isFloat,
            addMode: s.addMode,
            accumulateGT: s.accumulateGT,
            memoryMode: s.accumulateGT ? 'stack' : 'algebraic'
        });
    }

    // Hook settings change to engine
    [switchRO, switchDEC, switchACC].forEach(s => {
        if(s) s.addEventListener('change', updateEngineSettings);
    });
    // Init engine settings
    updateEngineSettings();

    const rateCookieKey = "logos_TAX_RATE";
    const storedRate = parseFloat(getCookie(rateCookieKey));
    if (!isNaN(storedRate)) {
        engine.taxRate = storedRate;
    } else {
        engine.taxRate = 22;
    }

    engine.onRateUpdate = (rate) => {
        const ONE_YEAR = 60 * 60 * 24 * 365;
        setCookie(rateCookieKey, rate, ONE_YEAR);
        pendingRateInput = false;
        if (vfdDisplayWrap) vfdDisplayWrap.classList.remove("is-blink");
        rateEditActive = false;
    };

    function startRateEditMode() {
        rateEditActive = true;
        pendingRateInput = true;
        if (vfdDisplayWrap) vfdDisplayWrap.classList.add("is-blink");
        updateDisplay("RATE");

        setTimeout(() => {
            if (!rateEditActive) return;
            if (vfdDisplayWrap) vfdDisplayWrap.classList.remove("is-blink");
            updateDisplay(String(engine.taxRate));
            engine.pressKey('RATE');
        }, 500);
    }

    // --- TAPE VIEW ---
    keys.forEach((btn) => {
        const dataKey = btn.getAttribute("data-key");
        if (!dataKey) return;
        if (!keyButtonsMap.has(dataKey)) keyButtonsMap.set(dataKey, []);
        keyButtonsMap.get(dataKey).push(btn);
    });

    function setKeyActive(action, active) {
        if (!action) return;
        const buttons = keyButtonsMap.get(action);
        if (!buttons) return;
        buttons.forEach((btn) => btn.classList.toggle("active", active));
    }

    const transientKeyboardActions = new Set(['#', 'S_SAVE', 'S_LOAD']);
    let lastKeyboardActiveAction = null;

    function activateKeyboardKey(action, keyboardEvent) {
        if (!action) return;

        const hasModifier = !!(keyboardEvent?.altKey || keyboardEvent?.ctrlKey || keyboardEvent?.metaKey);
        const useTransient = transientKeyboardActions.has(action) || hasModifier;

        setKeyActive(action, true);

        if (useTransient) {
            setTimeout(() => setKeyActive(action, false), 90);
            return;
        }

        lastKeyboardActiveAction = action;
    }

    function releaseKeyboardKey(action) {
        if (action) {
            setKeyActive(action, false);
            if (lastKeyboardActiveAction === action) {
                lastKeyboardActiveAction = null;
            }
        }

        if (lastKeyboardActiveAction && lastKeyboardActiveAction !== action) {
            setKeyActive(lastKeyboardActiveAction, false);
            lastKeyboardActiveAction = null;
        }
    }

    const businessKeys = new Set(['COST', 'SELL', 'MARGIN', 'MARKUP', 'TAX+', 'TAX-']);
    const nonOperandKeys = new Set(['GT', '#', 'CE', 'C', 'CLEAR_ALL', 'T', 'T1', 'EXPR']);
    const operatorDisplayMap = new Map([
        ['+', '+'],
        ['-', '-'],
        ['x', 'x'],
        ['÷', '÷'],
        ['(', '('],
        [')', ')'],
        ['%', '%'],
        ['Δ', 'Δ'],
        ['^', '^'],
        ['=', '='],
        ['S1', 'S'],
        ['T1', 'T']
    ]);

    const updateTapeCount = () => {
        if (!iconTapeCount || !paperTape) return;
            const count = paperTape.querySelectorAll('.tape-row.tape-operand').length;
        iconTapeCount.textContent = String(count);
    };

    const updateOperatorIndicator = (value) => {
        if (!iconOperator) return;
        iconOperator.textContent = value || '';
    };

    const setBusinessIndicator = (isOn) => {
        if (!iconBusiness) return;
        iconBusiness.className = isOn ? 'vfd-icon on' : 'vfd-icon off';
    };

    // Keys whose tape entries should NOT be editable
    const nonEditableKeys = new Set([
        'T1', 'S1', 'GT', 'C', 'CLEAR_ALL', 'CONST', '#', 'EXPR'
    ]);

    /**
     * Check whether a tape entry is user-editable.
     * @param {Object} entry
     * @returns {boolean}
     */
    const isEntryEditable = (entry) => {
        if (!entry || entry.type !== 'input') return false;
        if (entry.type === 'info') return false;
        return !nonEditableKeys.has(entry.key);
    };

    /**
     * Turn a tape value span into an inline editor.
     * On commit the engine recalculates the full tape.
     * @param {HTMLElement} valSpan
     * @param {number} entryIndex - position in engine.entries
     */
    function startTapeEdit(valSpan, entryIndex) {
        if (entryIndex < 0) return;
        const entry = engine.entries[entryIndex];
        if (!entry) return;

        const input = document.createElement("input");
        input.type = "text";
        input.className = "tape-edit-input";
        // Show the raw numeric value so the user can edit the actual number
        input.value = String(entry.val);

        valSpan.textContent = "";
        valSpan.appendChild(input);
        input.focus();
        input.select();

        let committed = false;
        const commitEdit = () => {
            if (committed) return;
            committed = true;
            const rawVal = input.value.replace(',', '.');
            const newVal = parseFloat(rawVal);
            if (!isNaN(newVal) && newVal !== entry.val) {
                engine.editEntry(entryIndex, newVal);
            } else {
                // Restore current tape (cancel or same value)
                if (engine.onTapeRefresh) {
                    engine.onTapeRefresh(engine.entries);
                }
            }
        };

        input.addEventListener("blur", commitEdit, { once: true });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                input.blur(); // triggers commitEdit via blur
            } else if (e.key === "Escape") {
                committed = true;
                // Restore without changes
                if (engine.onTapeRefresh) {
                    engine.onTapeRefresh(engine.entries);
                }
            }
        });
    }

    // Appends a single entry to the existing DOM tape
    function renderSingleEntry(entry, entryIndex) {
        if (!paperTape) return;
        
        const row = document.createElement("div");
        row.className = "tape-row";
        const isExpressionRow = entry?.key === 'EXPR' || entry?.type === 'expression';
        const entryValue = entry?.val;
        const entryNumber = Number(String(entryValue).replace(',', '.'));
        const isZeroValue = !Number.isNaN(entryNumber) && entryNumber === 0;
        if (entry?.type === 'input' && !nonOperandKeys.has(entry.key) && !isZeroValue) {
            row.classList.add("tape-operand");
        }
        
        // Alignment
        /* 
           Logic update: 
           - Operations (x, /, =) are LEFT aligned (input operand + symbol)
           - Results (no symbol but key is =) are LEFT aligned (actually usually Right aligned?) 
             Mult:
             10 x   (Left)
             5 =    (Left)
             50     (Right - Result)
             
             If key is x, ÷, = OR symbol is =, align LEFT.
             CONST entry has key='CONST'.
        */
        // Special case: when printing the second operand as an input with symbol '='
        // for an add/sub chain, we want it right-aligned so the symbol stays to the
        // right of the number (matches user expectation). Detect this by looking
        // at the last rendered row's symbol (if any).
        let forcedAlignRightForEquals = false;
        if (entry.key === '=' && entry.type === 'input') {
            const lastRow = paperTape?.querySelector?.('.tape-row:last-child');
            const lastSym = lastRow?.querySelector('.tape-symbol')?.textContent?.trim();
            if (lastSym === '+' || lastSym === '-') {
                forcedAlignRightForEquals = true;
            }
        }

        if (isExpressionRow) {
            row.classList.add("align-left", "tape-expression");
        } else if (entry.symbol === '◇' || entry.symbol === 'S' || entry.symbol === 'T' || forcedAlignRightForEquals) {
            row.classList.add("align-right");
        } else if (['x', '÷', 'CONST'].includes(entry.key) || entry.symbol === '=') {
            // Keep multiplication/division and explicit '=' result markers left aligned
            row.classList.add("align-left");
        } else {
            row.classList.add("align-right");
        }

        // Visual Separation for Result Blocks (Empty symbol with = key)
        if (!isExpressionRow && (entry.symbol === '◇' || (entry.key === '=' && entry.symbol === '' && entry.type !== 'input') || entry.type === 'result')) {
            row.classList.add("result-row");
        }

        // Negative Color
        const valNum = parseFloat(entry.val);
        const pctNum = typeof entry.percentValue !== "undefined" ? parseFloat(entry.percentValue) : NaN;
        const isNeg = (!isNaN(valNum) && valNum < 0) || (!isNaN(pctNum) && pctNum < 0) || entry.symbol === '-' || entry.symbol === 'TAX-';
        if (isNeg) {
            row.classList.add("negative");
        }

        const valSpan = document.createElement("span");
        valSpan.className = "tape-val";
        
        let displayVal = entry.val;
        // If it's a number, format it
           if (isExpressionRow) {
               displayVal = String(entry.expression || entry.val || '');
           } else if (typeof entry.val === 'number') {
             displayVal = formatNumber(entry.val);
        } else if (!isNaN(parseFloat(entry.val)) && entry.key !== '#') {
             displayVal = formatNumber(entry.val);
        }
        
        if (entry.percentSuffix) {
            displayVal = `${displayVal}%`;
        }
        if (entry.roundingFlag === 'up') {
            displayVal = `${displayVal} ↑`;
        } else if (entry.roundingFlag === 'down') {
            displayVal = `${displayVal} ↓`;
        }
        valSpan.textContent = displayVal;

        // Make editable entries respond to double-click
        if (isEntryEditable(entry) && typeof entryIndex === 'number' && entryIndex >= 0) {
            valSpan.classList.add("tape-editable");
            const idx = entryIndex; // capture for closure
            valSpan.addEventListener("dblclick", () => startTapeEdit(valSpan, idx));
        }

        const symSpan = document.createElement("span");
        symSpan.className = "tape-symbol";
        const lead = entry.leadSymbol ? `${entry.leadSymbol} ` : "";
        symSpan.textContent = isExpressionRow ? '' : `${lead}${entry.symbol || ""}`;
        if (entry.symbol === 'S' || entry.symbol === 'T') {
            symSpan.classList.add("tape-symbol-small");
        }

        // Append value then symbol (symbols stay to the right of the number)
        row.appendChild(valSpan);
        row.appendChild(symSpan);

        if (!isExpressionRow && typeof entry.percentValue !== "undefined") {
            const percentSpan = document.createElement("span");
            percentSpan.className = "tape-percent";
            const formatted = formatNumber(entry.percentValue);
            percentSpan.textContent = ` | ${formatted}`;
            row.appendChild(percentSpan);
        }
        paperTape.appendChild(row);
        
        paperTape.scrollTop = paperTape.scrollHeight;
        updateTapeCount();
        if (entry?.type === 'result') {
            updateOperatorIndicator('=');
            setBusinessIndicator(businessKeys.has(entry.key));
        } else if (entry?.symbol) {
            updateOperatorIndicator(entry.symbol);
        }
    }
    
    // Clear Tape UI
    function clearTapeUI() {
        if (paperTape) paperTape.innerHTML = "";
        updateTapeCount();
        updateOperatorIndicator('');
        setBusinessIndicator(false);
    }

    function isTapeAtZeroClear() {
        if (!paperTape) return false;
        const lastRow = paperTape.querySelector(".tape-row:last-child");
        if (!lastRow) return false;
        const valText = lastRow.querySelector(".tape-val")?.textContent?.trim();
        const symText = lastRow.querySelector(".tape-symbol")?.textContent?.trim();
        return valText === "0" && symText === "C";
    }

    function triggerClearFeedback(forcePaperReset) {
        if (vfdDisplayWrap) {
            vfdDisplayWrap.classList.add("is-off");
            if (vfdOffTimeout) clearTimeout(vfdOffTimeout);
            vfdOffTimeout = setTimeout(() => {
                vfdDisplayWrap.classList.remove("is-off");
            }, 800);
        }

        if (forcePaperReset) {
            suppressClearPrint = true;
            clearTapeUI();
            if (paperResetTimeout) clearTimeout(paperResetTimeout);
            paperResetTimeout = setTimeout(() => {
                suppressClearPrint = false;
                renderSingleEntry({ val: 0, symbol: "C", key: "C", type: "input" });
            }, 500);
        } else {
            suppressClearPrint = false;
        }
    }

    // --- SNAPSHOTS ---
    // --- UTILS ---

    // Standard JS uses decimal point. 
    function formatNumber(numStr) {
        if (numStr === null || numStr === undefined) return "";
        const s = String(numStr);
        const n = Number(s.replace(',', '.'));
        if (Number.isNaN(n)) return s;

        let formatted = s;
        if (!displaySettings?.isFloat) {
            const dec = displaySettings?.decimals ?? 2;
            formatted = n.toFixed(dec);
        }

        const parts = formatted.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
        return parts.join(",");
    }

    // Play sound (optional simulation)
    function playClickSound() {
        // Future implementation
    }

    // --- DISPLAY (VFD) ---
    // Update VFD
    function updateDisplay(val) {
        if (!vfdDisplay) return;
        // Clear error state on next normal update if value is not 'Error'
        if (errorState && val !== 'Error') errorState = false;
        if (isTextMode) {
            vfdDisplay.textContent = val;
        } else {
            // Format number for display
            vfdDisplay.textContent = formatNumber(val);
        }
    }

    // --- INPUT HANDLING ---
    function handleTextModeInput(key) {
        if (key === "Enter" || key === "=") {
            // Confirm and print
            renderSingleEntry({ val: textModeBuffer, symbol: '#' }); // Fabricated entry
            textModeBuffer = "";
            isTextMode = false;
            updateDisplay("0"); // Exit text mode
            return;
        }

        if (key === "Backspace" || key === "CE") {
            if (textModeBuffer.length > 0) {
                textModeBuffer = textModeBuffer.slice(0, -1);
            }
            updateDisplay(textModeBuffer || "#");
            return;
        }

        if (key === '#') return;

        if (key.length === 1 && textModeBuffer.length < 21) { // Single char
            textModeBuffer += key.toUpperCase();
            updateDisplay(textModeBuffer);
        }
    }

    function applyUiSpecialCases(key) {
        let engineKey = key;

        // --- SPECIAL UI LOGIC: Clear always performs reset ---
        if (key === 'CE') {
            engineKey = 'CLEAR_ALL';
        }

        return engineKey;
    }

    function handleInput(key, isRealKeyboardInput = false) {
        playClickSound();


        if (pendingGTChord && key !== 'S1' && key !== 'T1') {
            pendingGTChord = false;
            if (pendingGTTimeout) clearTimeout(pendingGTTimeout);
            pendingGTTimeout = null;
            if (iconGT) iconGT.classList.remove("mem-pending");
            engine.pressKey('GT');
        }

        if (pendingGTChord && (key === 'S1' || key === 'T1')) {
            pendingGTChord = false;
            if (pendingGTTimeout) clearTimeout(pendingGTTimeout);
            pendingGTTimeout = null;
            if (iconGT) iconGT.classList.remove("mem-pending");
        }

        // --- TEXT MODE MANAGEMENT (#) ---
        if (isTextMode) {
            handleTextModeInput(key);
            return;
        }

        if (key === '#') {
            isTextMode = true;
            textModeBuffer = "";
            updateDisplay("#");
            return;
        }

        // --- MAP DOM KEY TO ENGINE KEY ---
        // (Adjustments for labels vs Engine expectations)
        const engineKey = applyUiSpecialCases(key);

        const opDisplay = operatorDisplayMap.get(engineKey) || operatorDisplayMap.get(key);
        if (opDisplay) updateOperatorIndicator(opDisplay);
        if (!businessKeys.has(engineKey) && !businessKeys.has(key)) {
            setBusinessIndicator(false);
        }

        if (engineKey === "CLEAR_ALL") {
            const forcePaperReset = isTapeAtZeroClear();
            triggerClearFeedback(forcePaperReset);
        }

        if (engineKey === 'S_SAVE') {
            showSaveDialog();
            return;
        }

        if (engineKey === 'S_LOAD') {
            showLoadDialog();
            return;
        }

        if (rateEditActive && (engineKey === '=' || engineKey === 'Enter')) {
            pendingRateInput = false;
            rateEditActive = false;
            if (vfdDisplayWrap) vfdDisplayWrap.classList.remove("is-blink");
        }

        if (key === 'GT') {
            pendingGTChord = true;
            if (pendingGTTimeout) clearTimeout(pendingGTTimeout);
            pendingGTTimeout = setTimeout(() => {
                pendingGTChord = false;
                pendingGTTimeout = null;
                if (iconGT) iconGT.classList.remove("mem-pending");
                engine.pressKey('GT');
            }, 5000);
            if (iconGT) iconGT.classList.add("mem-pending");
            engine.pressKey('GT');
            return;
        }

        // --- DISPATCH TO ENGINE ---
        engine.pressKey(engineKey);
    }

    function mapKeyboardToAction(eventOrKey) {
        const key = typeof eventOrKey === "string" ? eventOrKey : eventOrKey.key;
        const isEvent = typeof eventOrKey !== "string";
        if (isEvent && key === '0') {
            if (eventOrKey.ctrlKey) return '00';
            if (eventOrKey.altKey) return '000';
        }
        if (key === '#') return '#';
        if (key >= '0' && key <= '9') return key;
        if (key === '.' || key === ',') return '.';
        if (key === '+') return '+';
        if (key === '-') return '-';
        if (key === '(') return '(';
        if (key === ')') return ')';
        if (key === '%') return '%';
        if (key === '*' || key.toLowerCase() === 'x') return 'x';
        if (key === '/') return '÷';
        if (key === 'Enter' || key === '=') return '=';
        if (key === '^') return '^';
        if (key === 'Backspace') return 'BACKSPACE';
        if (key === 'Delete') return 'CE';
        if (key === 'Escape') return 'CE';
        if (key.toLowerCase() === 't') return 'T1';
        if (key.toLowerCase() === 's' || key.toLowerCase() === 'i') return 'S1';
        if (key.toLowerCase() === 'g') return 'GT';
        if (key.toLowerCase() === 'd') return 'Δ';
        if (key.toLowerCase() === 'r') return '√';
        if (key.toLowerCase() === 'p') return '^';
        if (key.toLowerCase() === 'a') return 'S_SAVE';
        if (key.toLowerCase() === 'z') return 'S_LOAD';
        return null;
    }
    
    // --- EVENT LISTENERS ---
    
    function handleUiClick(buttonEl) {
        const action = buttonEl.getAttribute("data-key");
        if (action === 'TAX+' && suppressTaxPlusClick) {
            suppressTaxPlusClick = false;
            return;
        }
        if (action) handleInput(action);
    }

    function bindTaxRateLongPress() {
        const taxButtons = keyButtonsMap.get('TAX+') || [];
        if (taxButtons.length === 0) return;

        const cancelHold = () => {
            if (taxRateHoldTimeout) clearTimeout(taxRateHoldTimeout);
            taxRateHoldTimeout = null;
        };

        const startHold = () => {
            taxRateHoldTriggered = false;
            cancelHold();
            taxRateHoldTimeout = setTimeout(() => {
                taxRateHoldTriggered = true;
                suppressTaxPlusClick = true;
                startRateEditMode();
            }, 3000);
        };

        taxButtons.forEach((btn) => {
            btn.addEventListener('pointerdown', startHold);
            btn.addEventListener('pointerup', cancelHold);
            btn.addEventListener('pointerleave', cancelHold);
            btn.addEventListener('pointercancel', cancelHold);
            btn.addEventListener('click', () => {
                if (taxRateHoldTriggered) {
                    taxRateHoldTriggered = false;
                }
            });
        });
    }

    function handleKeyboard(event) {
        const target = event.target;
        if (target) {
            const tagName = target.tagName;
            const isFormField = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
            const inSheet = typeof target.closest === 'function' &&
                (target.closest('[data-calc-sheet]') || target.closest('[data-calc-sheet-toolbar]'));
            if (isFormField || target.isContentEditable || inSheet) {
                return;
            }
        }
        const action = mapKeyboardToAction(event);
        const isFocused = isCalculatorFocused();
        const isMappedAction = Boolean(action);
        if (!isFocused && !isMappedAction && !pendingMemoryChord && !pendingGTChord) {
            return;
        }
        if (isMappedAction && !isFocused) {
            focusCalculatorWrapperDeferred(0);
        }
        if ((isFocused || isMappedAction) && paperTape && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            const delta = event.key === 'ArrowUp' ? -40 : 40;
            paperTape.scrollTop += delta;
            return;
        }
        if (isTextMode) {
            event.preventDefault();
            handleInput(event.key, true);
            return;
        }
        const keyLower = event.key.toLowerCase();
        const isUndoCombo = (event.metaKey || event.ctrlKey) && !event.altKey && keyLower === 'z';
        const isRedoCombo = event.ctrlKey && !event.metaKey && !event.altKey && keyLower === 'y';
        const isSignToggle = (event.key === '-' && event.shiftKey) || event.key === '_';

        if (pendingMemoryChord) {
            if (keyLower === '+') {
                event.preventDefault();
                pendingMemoryChord = false;
                if (pendingMemoryTimeout) clearTimeout(pendingMemoryTimeout);
                pendingMemoryTimeout = null;
                if (iconMem) iconMem.classList.remove("mem-pending");
                setKeyActive('M+', true);
                handleInput('M+', true);
                setTimeout(() => setKeyActive('M+', false), 80);
                return;
            }
            if (keyLower === '-') {
                event.preventDefault();
                pendingMemoryChord = false;
                if (pendingMemoryTimeout) clearTimeout(pendingMemoryTimeout);
                pendingMemoryTimeout = null;
                if (iconMem) iconMem.classList.remove("mem-pending");
                setKeyActive('M-', true);
                handleInput('M-', true);
                setTimeout(() => setKeyActive('M-', false), 80);
                return;
            }
            if (keyLower === 'r') {
                event.preventDefault();
                pendingMemoryChord = false;
                if (pendingMemoryTimeout) clearTimeout(pendingMemoryTimeout);
                pendingMemoryTimeout = null;
                if (iconMem) iconMem.classList.remove("mem-pending");
                setKeyActive('MR', true);
                handleInput('MR', true);
                setTimeout(() => setKeyActive('MR', false), 80);
                return;
            }
            if (keyLower === 'c') {
                event.preventDefault();
                pendingMemoryChord = false;
                if (pendingMemoryTimeout) clearTimeout(pendingMemoryTimeout);
                pendingMemoryTimeout = null;
                if (iconMem) iconMem.classList.remove("mem-pending");
                setKeyActive('MC', true);
                handleInput('MC', true);
                setTimeout(() => setKeyActive('MC', false), 80);
                return;
            }

            // any other key cancels the chord
            pendingMemoryChord = false;
            if (pendingMemoryTimeout) clearTimeout(pendingMemoryTimeout);
            pendingMemoryTimeout = null;
            if (iconMem) iconMem.classList.remove("mem-pending");
            event.preventDefault();
            return;
        }

        if (pendingGTChord) {
            if (keyLower === 's') {
                event.preventDefault();
                pendingGTChord = false;
                if (pendingGTTimeout) clearTimeout(pendingGTTimeout);
                pendingGTTimeout = null;
                if (iconGT) iconGT.classList.remove("mem-pending");
                setKeyActive('S1', true);
                handleInput('S1', true);
                setTimeout(() => setKeyActive('S1', false), 80);
                return;
            }
            if (keyLower === 't') {
                event.preventDefault();
                pendingGTChord = false;
                if (pendingGTTimeout) clearTimeout(pendingGTTimeout);
                pendingGTTimeout = null;
                if (iconGT) iconGT.classList.remove("mem-pending");
                setKeyActive('T1', true);
                handleInput('T1', true);
                setTimeout(() => setKeyActive('T1', false), 80);
                return;
            }
            pendingGTChord = false;
            if (pendingGTTimeout) clearTimeout(pendingGTTimeout);
            pendingGTTimeout = null;
            if (iconGT) iconGT.classList.remove("mem-pending");
            handleInput('GT', true);
        }

        if (keyLower === 'm') {
            pendingMemoryChord = true;
            if (pendingMemoryTimeout) clearTimeout(pendingMemoryTimeout);
            pendingMemoryTimeout = setTimeout(() => {
                pendingMemoryChord = false;
                pendingMemoryTimeout = null;
                if (iconMem) iconMem.classList.remove("mem-pending");
            }, 5000);
            if (iconMem) iconMem.classList.add("mem-pending");
            event.preventDefault();
            return;
        }

        if (isUndoCombo) {
            event.preventDefault();
            if (event.shiftKey) {
                if (engine.redo) engine.redo();
            } else {
                if (engine.undo) engine.undo();
            }
            return;
        }

        if (isRedoCombo) {
            event.preventDefault();
            if (engine.redo) engine.redo();
            return;
        }

        if (isSignToggle) {
            event.preventDefault();
            handleInput('±', true);
            return;
        }

        const isPlainKey = !event.metaKey && !event.ctrlKey && !event.altKey;
        if ((isFocused || isMappedAction) && !action && isPlainKey) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (action) {
            event.preventDefault();
        }
        if (event.key === 'Enter' || event.key === '=') {
            event.preventDefault();
        }
        if (event.key === '0' && (event.ctrlKey || event.altKey)) {
            event.preventDefault();
        }
        activateKeyboardKey(action, event);
        if (action) handleInput(action, true);
    }

    function handleKeyboardUp(event) {
        const target = event.target;
        if (target) {
            const tagName = target.tagName;
            const isFormField = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
            const inSheet = typeof target.closest === 'function' &&
                (target.closest('[data-calc-sheet]') || target.closest('[data-calc-sheet-toolbar]'));
            if (isFormField || target.isContentEditable || inSheet) {
                return;
            }
        }
        const action = mapKeyboardToAction(event);
        if (!isCalculatorFocused() && !action) {
            return;
        }
        releaseKeyboardKey(action);
    }

    // --- SAVE/LOAD USER SNAPSHOTS ---
    /**
     * Show save dialog with name input
     */
    async function showSaveDialog() {
        const count = await getUserSnapshotCount();
        if (count >= 8) {
            alert("Non è possibile salvare: hai raggiunto il limite massimo di 8 calcoli salvati.\nEliminane uno per continuare.");
            return;
        }
        
        const overlay = document.createElement("div");
        overlay.className = "calc-dialog-overlay";
        
        const dialog = document.createElement("div");
        dialog.className = "calc-dialog";
        
        const header = document.createElement("div");
        header.className = "calc-dialog-header";
        header.innerHTML = "<h3>Salva il calcolo</h3>";
        
        const content = document.createElement("div");
        content.className = "calc-dialog-content";
        
        const input = document.createElement("input");
        input.className = "calc-dialog-input";
        input.type = "text";
        input.placeholder = "Nome del calcolo (max 30 caratteri)";
        input.maxLength = "30";
        
        content.appendChild(input);
        
        const buttons = document.createElement("div");
        buttons.className = "calc-dialog-buttons";
        
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "calc-dialog-btn";
        cancelBtn.textContent = "Annulla";
        cancelBtn.addEventListener("click", () => {
            overlay.remove();
        });
        
        const saveBtn = document.createElement("button");
        saveBtn.className = "calc-dialog-btn primary";
        saveBtn.textContent = "Salva";
        saveBtn.addEventListener("click", async () => {
            const name = input.value.trim();
            if (!name) {
                alert("Inserisci un nome per il calcolo.");
                return;
            }
            try {
                await handleSaveSnapshot(name);
                overlay.remove();
            } catch (err) {
                alert(`Errore al salvataggio: ${err.message}`);
            }
        });
        
        buttons.appendChild(cancelBtn);
        buttons.appendChild(saveBtn);
        
        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        input.focus();
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") saveBtn.click();
        });
    }

    /**
     * Handle saving a snapshot with name
     */
    async function handleSaveSnapshot(name) {
        const snapshot = engine.getStateSnapshot();
        await saveUserSnapshot(name, snapshot);
        alert(`✓ Calcolo "${name}" salvato con successo!`);
    }

    /**
     * Show load dialog with list of saved snapshots
     */
    async function showLoadDialog() {
        const snapshots = await getAllUserSnapshots();
        
        if (snapshots.length === 0) {
            alert("Non hai alcun calcolo salvato.");
            return;
        }
        
        const overlay = document.createElement("div");
        overlay.className = "calc-dialog-overlay";
        
        const dialog = document.createElement("div");
        dialog.className = "calc-dialog";
        
        const header = document.createElement("div");
        header.className = "calc-dialog-header";
        header.innerHTML = "<h3>Carica un calcolo</h3>";
        
        const content = document.createElement("div");
        content.className = "calc-dialog-content";
        
        const list = document.createElement("div");
        list.className = "calc-dialog-list";
        
        snapshots.forEach((snapshot) => {
            const item = document.createElement("div");
            item.className = "calc-dialog-list-item";
            
            const info = document.createElement("div");
            info.className = "calc-dialog-list-item-info";
            
            const name = document.createElement("div");
            name.className = "calc-dialog-list-item-name";
            name.textContent = snapshot.name;
            
            const meta = document.createElement("div");
            meta.className = "calc-dialog-list-item-meta";
            const entriesCount = snapshot.snapshot && snapshot.snapshot.entries ? snapshot.snapshot.entries.length : 0;
            meta.textContent = `${entriesCount} entries • ${formatTimestamp(snapshot.timestamp)}`;
            
            info.appendChild(name);
            info.appendChild(meta);
            
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "calc-dialog-list-item-delete";
            deleteBtn.textContent = "×";
            deleteBtn.title = "Elimina questo calcolo";
            deleteBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm(`Eliminare il calcolo "${snapshot.name}"?`)) {
                    try {
                        await deleteUserSnapshot(snapshot.id);
                        item.remove();
                        if (list.children.length === 0) {
                            content.innerHTML = "<p style='color: #999; text-align: center;'>Nessun calcolo salvato.</p>";
                        }
                    } catch (err) {
                        alert(`Errore eliminazione: ${err.message}`);
                    }
                }
            });
            
            item.appendChild(info);
            item.appendChild(deleteBtn);
            
            // Click name/info to load
            info.addEventListener("click", async () => {
                try {
                    await handleLoadSnapshot(snapshot.id);
                    overlay.remove();
                } catch (err) {
                    alert(`Errore caricamento: ${err.message}`);
                }
            });
            
            list.appendChild(item);
        });
        
        content.appendChild(list);
        
        const buttons = document.createElement("div");
        buttons.className = "calc-dialog-buttons";
        
        const closeBtn = document.createElement("button");
        closeBtn.className = "calc-dialog-btn";
        closeBtn.textContent = "Chiudi";
        closeBtn.addEventListener("click", () => {
            overlay.remove();
        });
        
        buttons.appendChild(closeBtn);
        
        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    /**
     * Handle loading a snapshot
     */
    async function handleLoadSnapshot(id) {
        const saved = await getUserSnapshot(id);
        if (!saved) {
            throw new Error("Calcolo non trovato");
        }
        engine.restoreStateSnapshot(saved.snapshot);
        // Save as current state
        await saveCurrentState(engine.getStateSnapshot());
    }

    // 1. Mouse Click (Virtual Keys)
    keys.forEach(k => {
        k.addEventListener("pointerdown", focusCalculatorWrapper);
        k.addEventListener("click", () => handleUiClick(k));
    });
    if (calculatorWrapper) {
        calculatorWrapper.addEventListener("pointerdown", focusCalculatorWrapper);
        calculatorWrapper.addEventListener("pointerenter", () => {
            calculatorWrapper.classList.add('is-pointer-over');
            syncCalculatorFocusLed();
        });
        calculatorWrapper.addEventListener("pointerleave", () => {
            calculatorWrapper.classList.remove('is-pointer-over');
            syncCalculatorFocusLed();
        });
    }

    // Restore keyboard focus whenever calculator tab becomes active
    const calculatorTabButton = document.querySelector('.tab-btn[data-tab="calculator"]');
    if (calculatorTabButton) {
        calculatorTabButton.addEventListener('click', () => {
            focusCalculatorWrapperDeferred(0);
            focusCalculatorWrapperDeferred(80);
        });
    }

    document.addEventListener('app:tab-changed', (event) => {
        const tabId = event?.detail?.tabId;
        logFocusDebug('app:tab-changed', { tabId });
        if (tabId === 'calculator') {
            focusCalculatorWrapperDeferred(0);
            focusCalculatorWrapperDeferred(80);
        } else {
            syncCalculatorFocusLed();
        }
    });

    document.addEventListener('visibilitychange', syncCalculatorFocusLed);
    window.addEventListener('blur', () => releaseKeyboardKey(lastKeyboardActiveAction));
    bindTaxRateLongPress();

    // 2. Keyboard Input
    document.addEventListener("keydown", handleKeyboard);
    document.addEventListener("keyup", handleKeyboardUp);
    // Paste from system clipboard into calculator when focused
    function parseClipboardNumber(text) {
        if (!text || typeof text !== 'string') return null;
        let s = text.trim();
        if (s === '') return null;
        // Remove spaces and common thousands separators (apostrophe)
        s = s.replace(/\s+/g, '');
        s = s.replace(/'/g, '');

        // Normalize decimal separators: prefer dot. Handle cases like "1.234,56" or "1,234.56"
        const hasComma = s.indexOf(',') !== -1;
        const hasDot = s.indexOf('.') !== -1;
        if (hasComma && !hasDot) {
            s = s.replace(',', '.');
        } else if (hasComma && hasDot) {
            // assume dots are thousands sep, commas decimal
            // e.g. 1.234,56 -> 1234.56
            s = s.replace(/\./g, '').replace(/,/g, '.');
        }

        // Allow leading + or -
        if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return null;
        return s;
    }

    function handlePaste(evt) {
        const target = evt.target;
        if (target) {
            const tagName = target.tagName;
            const isFormField = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
            const inSheet = typeof target.closest === 'function' &&
                (target.closest('[data-calc-sheet]') || target.closest('[data-calc-sheet-toolbar]'));
            if (isFormField || target.isContentEditable || inSheet) return;
        }
        if (!isCalculatorFocused()) return;

        const clipboardText = (evt.clipboardData && evt.clipboardData.getData) ? evt.clipboardData.getData('text') : (window.clipboardData ? window.clipboardData.getData('Text') : '');
        const normalized = parseClipboardNumber(clipboardText);
        if (!normalized) return;
        evt.preventDefault();

        let num = normalized;
        let neg = false;
        if (num.startsWith('+') || num.startsWith('-')) {
            if (num.startsWith('-')) neg = true;
            num = num.slice(1);
        }

        for (const ch of num) {
            if (ch === '.') {
                handleInput('.');
            } else if (ch >= '0' && ch <= '9') {
                handleInput(ch);
            }
        }

        if (neg) handleInput('±');
    }

    document.addEventListener('paste', handlePaste);
    } catch (err) {
        console.error("Main initialization error:", err);
    }
});
