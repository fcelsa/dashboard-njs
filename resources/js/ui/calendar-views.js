/**
 * Calendar view registry — allows switching between different
 * visualisations inside the calendar panel.
 * @module ui/calendar-views
 */

/** @type {Map<string, { label: string, render: function, cleanup?: function }>} */
const views = new Map();

/** @type {string|null} */
let activeViewId = null;

/** @type {HTMLElement|null} */
let targetContainer = null;

/** @type {HTMLElement|null} */
let toggleBtn = null;

/**
 * Register a calendar view.
 * @param {string} id       - unique view identifier
 * @param {string} label    - human-readable label shown on the toggle button
 * @param {function(HTMLElement):void} renderFn  - called with the container element to populate
 * @param {function():void} [cleanupFn] - optional teardown before switching away
 */
export function registerCalendarView(id, label, renderFn, cleanupFn) {
  views.set(id, { label, render: renderFn, cleanup: cleanupFn });
}

/**
 * Set the active view by id.
 * Tears down the previous view (if cleanup provided) then renders the new one.
 * @param {string} id
 */
export function setCalendarView(id) {
  if (!views.has(id) || !targetContainer) return;
  const prev = views.get(activeViewId);
  if (prev?.cleanup) prev.cleanup();

  activeViewId = id;
  const view = views.get(id);
  view.render(targetContainer);
  updateToggleLabel();
}

/**
 * Cycle to the next view in insertion order.
 */
export function cycleCalendarView() {
  const ids = [...views.keys()];
  if (ids.length === 0) return;
  const idx = ids.indexOf(activeViewId);
  const next = ids[(idx + 1) % ids.length];
  setCalendarView(next);
}

/**
 * Get current view id.
 * @returns {string|null}
 */
export function getCalendarView() {
  return activeViewId;
}

/**
 * Get all registered view ids.
 * @returns {string[]}
 */
export function getCalendarViewIds() {
  return [...views.keys()];
}

/** Update toggle button label to current view name. */
function updateToggleLabel() {
  if (!toggleBtn) return;
  const view = views.get(activeViewId);
  toggleBtn.textContent = view ? view.label : '';
  toggleBtn.title = 'Click per cambiare vista calendario';
}

/**
 * Initialise the calendar view system.
 * @param {HTMLElement} container - the element whose content will be swapped (e.g. #months)
 * @param {HTMLElement} [button] - optional button to cycle views
 * @param {string} [defaultViewId] - id of the initial view (defaults to first registered)
 */
export function initCalendarViews(container, button, defaultViewId) {
  targetContainer = container;
  toggleBtn = button || null;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleCalendarView();
    });
  }

  // Activate default view if views are already registered
  const ids = [...views.keys()];
  if (ids.length > 0) {
    setCalendarView(defaultViewId && views.has(defaultViewId) ? defaultViewId : ids[0]);
  }
}
