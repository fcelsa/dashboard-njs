/**
 * FX card: EUR/USD latest rate, averages, yearly chart and refresh scheduling.
 * Extracted from script.js. @2026-07-09
 * @module fx
 */

import { getCookie, setCookie } from './utils/cookies.js';
import { getTheme } from './ui/theme.js';
import { formatDateLocal, formatTime, formatElapsedCompact } from './date-utils.js';

const fxPriceEl = document.getElementById("fx-price");
const fxUpdatedEl = document.getElementById("fx-updated");
const fxAvg7El = document.getElementById("fx-avg-7");
const fxAvg30El = document.getElementById("fx-avg-30");
const fxAvgYtdEl = document.getElementById("fx-avg-ytd");
const fxWeeklyMinEl = document.getElementById("fx-weekly-min");
const fxWeeklyMaxEl = document.getElementById("fx-weekly-max");
const fxChartEl = document.getElementById("fx-chart");
const fxStatusEl = document.getElementById("fx-status");
const networkStatusEl = document.getElementById("network-status");

let fxHistory = null;
let fxHistoryProvider = null;
let fxChartSize = { width: 0, height: 0 };
let fxChartEntries = [];
let fxHoverIndex = null;
const fxSessionKey = "fxLatestSession";
const FX_DAILY_FETCH_HOURS = [16];

function scheduleFxDailyRefresh() {
  const now = new Date();
  const target = getNextScheduledTarget(FX_DAILY_FETCH_HOURS, now);
  const timeout = target.getTime() - now.getTime();
  setTimeout(async () => {
    await runDailyFxRefresh();
    scheduleFxDailyRefresh();
  }, timeout);
}

function getNextScheduledTarget(hours, now = new Date()) {
  const sorted = [...hours].sort((a, b) => a - b);
  for (const hour of sorted) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 5);
    if (candidate.getTime() > now.getTime()) {
      return candidate;
    }
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, sorted[0], 0, 5);
}

// --- FX HELPERS ---
// --- FX CACHE (SESSION) ---

function getCachedSessionRate() {
  const raw = getCookie(fxSessionKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const rate = Number(parsed?.rate);
    const ts = Number(parsed?.ts);
    if (!Number.isFinite(rate) || !Number.isFinite(ts)) {
      return null;
    }
    const valueDate = typeof parsed?.valueDate === "string" ? parsed.valueDate : formatDateLocal(new Date(ts));
    return { rate, ts, valueDate };
  } catch {
    return null;
  }
}

function setCachedSessionRate(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.rate)) return;
  const payload = {
    rate: snapshot.rate,
    ts: Number.isFinite(snapshot.ts) ? snapshot.ts : Date.now(),
    valueDate:
      typeof snapshot.valueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.valueDate)
        ? snapshot.valueDate
        : formatDateLocal(new Date()),
  };
  setCookie(fxSessionKey, JSON.stringify(payload), 60 * 60 * 24 * 7);
}

function getBestLocalFxSnapshot() {
  const cached = getCachedSessionRate();
  if (!cached) return null;
  return cached;
}

function updateNetworkStatus(lastDataTimestamp = null) {
  if (!networkStatusEl) return;
  const online = navigator.onLine;
  networkStatusEl.classList.toggle("online", online);
  networkStatusEl.classList.toggle("offline", !online);

  if (online) {
    networkStatusEl.textContent = "Online";
    return;
  }

  if (!lastDataTimestamp) {
    networkStatusEl.textContent = "Offline · no data";
    return;
  }

  const age = formatElapsedCompact(lastDataTimestamp);
  networkStatusEl.textContent = age ? `Offline · dati vecchi ${age}` : "Offline · dati vecchi";
}

function applyFxSnapshot(snapshot, stale = false) {
  if (!snapshot || !Number.isFinite(snapshot.rate)) return false;
  const when = Number.isFinite(snapshot.ts) ? new Date(snapshot.ts) : new Date();
  const valueDate =
    typeof snapshot.valueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.valueDate)
      ? snapshot.valueDate
      : formatDateLocal(when);
  fxPriceEl.textContent = snapshot.rate.toFixed(4);

  const staleSuffix = stale
    ? ` · dati vecchi ${formatElapsedCompact(when.getTime()) || ""}`.trimEnd()
    : "";
  fxUpdatedEl.textContent = `Quotazione del ${valueDate} · sync ${formatTime(when)}${staleSuffix}`;

  if (fxStatusEl) {
    fxStatusEl.classList.toggle("cached", stale);
  }
  updateNetworkStatus(when.getTime());
  renderFxAverages(snapshot);
  return true;
}

// --- FX HISTORY CACHE ---
function getHistoryRange(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return { start: formatDateLocal(start), end: formatDateLocal(end) };
}

function normalizeHistoryPayload(payload) {
  if (Array.isArray(payload)) {
    const normalized = {};
    payload.forEach((row) => {
      if (!row || row.quote !== "USD" || !row.date) return;
      const rate = typeof row.rate === "number" ? row.rate : parseFloat(row.rate);
      if (!Number.isFinite(rate)) return;
      normalized[row.date] = { USD: rate };
    });
    return Object.keys(normalized).length ? normalized : null;
  }

  if (payload?.rates && typeof payload.rates === "object") {
    return payload.rates;
  }

  return null;
}

function readCachedHistory() {
  const raw = localStorage.getItem("fxHistory");
  const updated = localStorage.getItem("fxHistoryUpdated");
  if (!raw || !updated) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const provider = localStorage.getItem("fxHistoryProvider") || null;
    return { data, updated, provider };
  } catch (error) {
    console.warn("Invalid fxHistory cache payload", error);
    localStorage.removeItem("fxHistory");
    localStorage.removeItem("fxHistoryUpdated");
    localStorage.removeItem("fxHistoryProvider");
    return null;
  }
}

function cacheHistory(data, provider = "Frankfurter") {
  localStorage.setItem("fxHistory", JSON.stringify(data));
  localStorage.setItem("fxHistoryUpdated", formatDateLocal(new Date()));
  localStorage.setItem("fxHistoryProvider", provider);
}

function getLatestHistoryDate(history) {
  if (!history || typeof history !== "object") return null;
  const keys = Object.keys(history)
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort();
  return keys.length ? keys[keys.length - 1] : null;
}

function getFxHistoryEntries(history) {
  if (!history || typeof history !== "object") return [];
  return Object.entries(history)
    .map(([date, value]) => {
      const raw = value?.USD;
      const rate = typeof raw === "number" ? raw : parseFloat(raw);
      return { date, rate };
    })
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(entry.rate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSnapshotWithHistoryEntries(entries, snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.rate) || typeof snapshot.valueDate !== "string") {
    return entries;
  }
  const merged = entries.filter((entry) => entry.date !== snapshot.valueDate);
  merged.push({ date: snapshot.valueDate, rate: snapshot.rate });
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

function calculateAverage(entries, startKey, endKey) {
  const inRange = entries.filter((entry) => entry.date >= startKey && entry.date <= endKey);
  if (!inRange.length) return null;
  const total = inRange.reduce((sum, entry) => sum + entry.rate, 0);
  return total / inRange.length;
}

function setAverageText(targetEl, value) {
  if (!targetEl) return;
  targetEl.textContent = Number.isFinite(value) ? value.toFixed(4) : "--";
}

function renderFxAverages(snapshot = null) {
  const now = new Date();
  const todayKey = formatDateLocal(now);
  const entries = mergeSnapshotWithHistoryEntries(getFxHistoryEntries(fxHistory), snapshot || getBestLocalFxSnapshot());
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 29);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  setAverageText(fxAvg7El, calculateAverage(entries, formatDateLocal(sevenDaysAgo), todayKey));
  setAverageText(fxAvg30El, calculateAverage(entries, formatDateLocal(thirtyDaysAgo), todayKey));
  setAverageText(fxAvgYtdEl, calculateAverage(entries, formatDateLocal(yearStart), todayKey));
}

function updateWeeklyRangeSummary(points) {
  const values = points
    .map((point) => point.rate)
    .filter((rate) => Number.isFinite(rate));
  if (!values.length) {
    if (fxWeeklyMinEl) fxWeeklyMinEl.textContent = "Min --";
    if (fxWeeklyMaxEl) fxWeeklyMaxEl.textContent = "Max --";
    return;
  }
  if (fxWeeklyMinEl) fxWeeklyMinEl.textContent = `Min ${Math.min(...values).toFixed(4)}`;
  if (fxWeeklyMaxEl) fxWeeklyMaxEl.textContent = `Max ${Math.max(...values).toFixed(4)}`;
}

async function fetchFxHistory() {
  try {
    const { start, end } = getHistoryRange();
    const url = `https://api.frankfurter.dev/v2/rates?from=${start}&to=${end}&base=EUR&quotes=USD`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Frankfurter v2 responded with ${response.status}`);
    }

    const payload = await response.json();
    const normalized = normalizeHistoryPayload(payload);
    if (!normalized) {
      throw new Error("Frankfurter v2 returned an unsupported payload");
    }

    fxHistory = normalized;
    fxHistoryProvider = "Frankfurter v2";
    cacheHistory(fxHistory, fxHistoryProvider);
    drawFxChart();
    renderFxAverages();
    return;
  } catch (error) {
    console.error(error);
    if (fxUpdatedEl) {
      const latestCached = getLatestHistoryDate(fxHistory);
      fxUpdatedEl.textContent = latestCached
        ? `Storico non aggiornato (ultimo dato ${latestCached})`
        : "Storico FX non disponibile";
    }
  }
}

function ensureFxHistory() {
  const cached = readCachedHistory();
  if (cached) {
    fxHistory = cached.data;
    fxHistoryProvider = cached.provider;
    drawFxChart();
    renderFxAverages();
  } else {
    drawFxChart();
  }
}

// --- FX LATEST FETCH ---
async function fetchFrankfurterLatestRate() {
  const url = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Frankfurter v1 responded with ${response.status}`);
  }
  const payload = await response.json();
  const rawRate = payload?.rates?.USD;
  const rate = typeof rawRate === "number" ? rawRate : parseFloat(rawRate);
  if (!Number.isFinite(rate)) {
    throw new Error("Frankfurter v1 returned an unsupported payload");
  }
  const valueDate =
    typeof payload?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : formatDateLocal(new Date());
  return { rate, valueDate };
}

async function fetchFxLatest({ forceRemote = false } = {}) {
  if (!fxPriceEl || !fxUpdatedEl) return;
  try {
    const localSnapshot = getBestLocalFxSnapshot();
    updateNetworkStatus(localSnapshot?.ts || null);

    if (!navigator.onLine) {
      if (!applyFxSnapshot(localSnapshot, true) && fxUpdatedEl) {
        fxUpdatedEl.textContent = "Aggiornamento: offline, nessun dato locale";
      }
      return;
    }

    if (!forceRemote && localSnapshot) {
      applyFxSnapshot(localSnapshot, true);
      return;
    }

    try {
      const latest = await fetchFrankfurterLatestRate();
      const snapshot = { rate: latest.rate, ts: Date.now(), valueDate: latest.valueDate };
      setCachedSessionRate(snapshot);
      applyFxSnapshot(snapshot, false);
    } catch (err) {
      console.error(err);
      applyFxSnapshot(localSnapshot, true);
    }
  } catch (error) {
    console.error(error);
    const localSnapshot = getBestLocalFxSnapshot();
    applyFxSnapshot(localSnapshot, true);
  }
}

async function runDailyFxRefresh() {
  await fetchFxLatest({ forceRemote: true });
  await fetchFxHistory();
}

// --- FX CHART (ANNUAL) ---
function resizeFxChart() {
  if (!fxChartEl) return;
  const container = fxChartEl.parentElement;
  if (!container) return;
  const styles = window.getComputedStyle(container);
  const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const targetWidth = Math.max(0, container.clientWidth - paddingX);
  const targetHeight = Math.max(0, container.clientHeight - paddingY);
  if (targetWidth === fxChartSize.width && targetHeight === fxChartSize.height) return;

  const ratio = window.devicePixelRatio || 1;
  fxChartEl.width = targetWidth * ratio;
  fxChartEl.height = targetHeight * ratio;
  fxChartEl.style.height = `${targetHeight}px`;
  fxChartEl.style.width = `${targetWidth}px`;
  fxChartSize = { width: targetWidth, height: targetHeight };
  drawFxChart();
}

function drawFxChart() {
  if (!fxChartEl || !fxHistory) return;
  const ctx = fxChartEl.getContext("2d");
  if (!ctx) return;

  const currentTheme = getTheme();
  const isLight = currentTheme === 'light' || currentTheme === 'mac1990';
  const colors = {
    grid: isLight ? 'rgba(0, 50, 100, 0.08)' : 'rgba(122, 166, 194, 0.12)',
    line: isLight ? '#3a7db8' : '#7aa6c2',
    hoverLine: isLight ? 'rgba(58, 125, 184, 0.3)' : 'rgba(155, 179, 168, 0.5)',
    indicator: isLight ? '#2a69a3' : '#7aa6c2',
    tooltipBg: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(16, 25, 32, 0.9)',
    tooltipBorder: isLight ? 'rgba(58, 125, 184, 0.4)' : 'rgba(122, 166, 194, 0.6)',
    tooltipText: isLight ? '#1a3050' : '#e7f0f6',
  };

  const ratio = window.devicePixelRatio || 1;
  const width = fxChartEl.width;
  const height = fxChartEl.height;
  ctx.clearRect(0, 0, width, height);

  const entries = mergeSnapshotWithHistoryEntries(getFxHistoryEntries(fxHistory), getBestLocalFxSnapshot());
  const points = buildWeeklyFxSeries(entries);
  const values = points.map((point) => point.rate).filter((rate) => Number.isFinite(rate));
  updateWeeklyRangeSummary(points);
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = 22 * ratio;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const scaleX = chartWidth / Math.max(points.length - 1, 1);
  const scaleY = chartHeight / (max - min || 1);

  const gridSteps = 6;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1 * ratio;
  for (let i = 0; i <= gridSteps; i += 1) {
    const y = padding + (chartHeight / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  for (let i = 0; i <= gridSteps; i += 1) {
    const x = padding + (chartWidth / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }

  const drawSeries = (series) => {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2 * ratio;
    ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    series.forEach((point, index) => {
      if (!Number.isFinite(point.rate)) {
        started = false;
        return;
      }
      const x = padding + index * scaleX;
      const y = height - padding - (point.rate - min) * scaleY;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  };

  drawSeries(points);
  fxChartEntries = points;

  if (fxHoverIndex !== null && fxChartEntries[fxHoverIndex]) {
    const entry = fxChartEntries[fxHoverIndex];
    const x = padding + fxHoverIndex * scaleX;
    const currentRate = entry.rate;

    ctx.strokeStyle = colors.hoverLine;
    ctx.lineWidth = 1 * ratio;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();

    if (Number.isFinite(currentRate)) {
      const currentY = height - padding - (currentRate - min) * scaleY;
      ctx.fillStyle = colors.indicator;
      ctx.beginPath();
      ctx.arc(x, currentY, 3.5 * ratio, 0, Math.PI * 2);
      ctx.fill();
    }

    const currentText = Number.isFinite(currentRate) ? currentRate.toFixed(4) : "n/d";
    const tooltipText = `${entry.label} · ${entry.start} → ${entry.end} · ${currentText}`;
    ctx.font = `${11 * ratio}px "Droid Sans Mono", monospace`;
    const textWidth = ctx.measureText(tooltipText).width;
    const padX = 8 * ratio;
    const padY = 6 * ratio;
    const boxWidth = textWidth + padX * 2;
    const boxHeight = 22 * ratio;

    let boxX = x - boxWidth / 2;
    boxX = Math.max(padding, Math.min(boxX, width - padding - boxWidth));
    const anchorRate = currentRate;
    const anchorY = Number.isFinite(anchorRate)
      ? height - padding - (anchorRate - min) * scaleY
      : height - padding;
    const boxY = Math.max(padding, anchorY - boxHeight - 10 * ratio);

    ctx.fillStyle = colors.tooltipBg;
    ctx.strokeStyle = colors.tooltipBorder;
    ctx.lineWidth = 1 * ratio;
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxWidth, boxHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.tooltipText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tooltipText, boxX + boxWidth / 2, boxY + boxHeight / 2 + 0.5 * ratio);
  }
}

function buildWeeklyFxSeries(entries, now = new Date()) {
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);

  const points = [];
  for (let weekIndex = 0; weekIndex < 52; weekIndex += 1) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + weekIndex * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > now) {
      weekEnd.setTime(now.getTime());
    }
    const startKey = formatDateLocal(weekStart);
    const endKey = formatDateLocal(weekEnd);
    const weekEntries = entries.filter((entry) => entry.date >= startKey && entry.date <= endKey);
    const average = weekEntries.length
      ? weekEntries.reduce((sum, entry) => sum + entry.rate, 0) / weekEntries.length
      : null;
    points.push({
      label: `Settimana ${String(weekIndex + 1).padStart(2, "0")}`,
      start: startKey,
      end: endKey,
      rate: average,
    });
  }
  return points;
}

function setupFxChartTooltip() {
  if (!fxChartEl) return;

  fxChartEl.addEventListener("mousemove", (event) => {
    if (!fxChartEntries.length) return;
    const rect = fxChartEl.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = fxChartEl.width;
    const height = fxChartEl.height;
    const padding = 22 * ratio;
    const chartWidth = width - padding * 2;

    const x = (event.clientX - rect.left) * ratio;
    if (x < padding || x > width - padding) {
      if (fxHoverIndex !== null) {
        fxHoverIndex = null;
        drawFxChart();
      }
      return;
    }

    const scaleX = chartWidth / Math.max(fxChartEntries.length - 1, 1);
    const index = Math.round((x - padding) / scaleX);
    const clamped = Math.max(0, Math.min(index, fxChartEntries.length - 1));

    if (fxHoverIndex !== clamped) {
      fxHoverIndex = clamped;
      drawFxChart();
    }
  });

  fxChartEl.addEventListener("mouseleave", () => {
    if (fxHoverIndex !== null) {
      fxHoverIndex = null;
      drawFxChart();
    }
  });
}

/**
 * Load caches, fetch the latest rate, start schedules and bind listeners. @2026-07-09
 */
export function initFx() {
  ensureFxHistory();
  fetchFxLatest({ forceRemote: true });
  if (new Date().getHours() === FX_DAILY_FETCH_HOURS[0]) {
    runDailyFxRefresh();
  }
  scheduleFxDailyRefresh();
  resizeFxChart();
  setupFxChartTooltip();

  window.addEventListener("resize", () => {
    resizeFxChart();
  });

  window.addEventListener("online", () => {
    updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
    fetchFxLatest();
  });

  window.addEventListener("offline", () => {
    const snapshot = getBestLocalFxSnapshot();
    updateNetworkStatus(snapshot?.ts || null);
    applyFxSnapshot(snapshot, true);
  });

  setInterval(() => {
    if (!navigator.onLine) {
      updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
    }
  }, 60000);

  updateNetworkStatus(getBestLocalFxSnapshot()?.ts || null);
}
