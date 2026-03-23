/**
 * Reusable tab controller.
 * Works with any container that has [data-tab] buttons and [data-tab-panel] sections.
 * @module ui/tabs
 */

/**
 * Initialise tab switching on a container.
 * Attaches click handlers and manages active state + ARIA attributes.
 *
 * @param {HTMLElement} container - element containing both .tab-btn and .tab-panel elements
 * @param {Object} [options]
 * @param {function(string):void} [options.onTabChange] - called with the new tab id after switching
 * @returns {{ setActive: (id: string) => void }}
 */
export function initTabs(container, options = {}) {
  if (!container) return { setActive: () => {} };

  const buttons = container.querySelectorAll('.tab-btn[data-tab]');
  const panels = container.querySelectorAll('.tab-panel[data-tab-panel]');

  const setActive = (tabId) => {
    buttons.forEach((btn) => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const active = panel.dataset.tabPanel === tabId;
      panel.classList.toggle('active', active);
    });
    document.dispatchEvent(new CustomEvent('app:tab-changed', { detail: { tabId } }));
    if (options.onTabChange) options.onTabChange(tabId);
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.dataset.tab));
  });

  return { setActive };
}
