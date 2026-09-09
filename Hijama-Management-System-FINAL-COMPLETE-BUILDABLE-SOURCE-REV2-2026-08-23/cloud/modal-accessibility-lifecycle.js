/**
 * Shared accessibility lifecycle for legacy modal overlays.
 * It augments existing open/close handlers without owning business actions.
 */
(function (global) {
  'use strict';

  const MODAL_SELECTOR = '.modal-overlay[id$="Modal"], [data-modal-overlay="true"], #bf-dialog, #centerSetupModal .cs-modal';
  let initialized = false;
  let observer = null;
  let activeModal = null;
  let lastFocus = null;
  let lastOutsideFocus = null;

  function visible(el) {
    if (!el || el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
    const style = typeof global.getComputedStyle === 'function' ? global.getComputedStyle(el) : null;
    if (!style) return !!el.classList?.contains('open');
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    // Inner dialog roots (BootFlow/Center Setup) inherit grid styles while their
    // overlay parent is hidden. A layout box is therefore the runtime visibility truth.
    if (typeof el.getClientRects === 'function') return el.getClientRects().length > 0;
    return !!el.classList?.contains('open');
  }

  function humanize(value) {
    return String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/Modal$/i, '')
      .trim() || 'حوار';
  }

  function titleFor(modal) {
    if (!modal) return null;
    const title = modal.querySelector?.('[data-modal-title], .modal-title, .modal-header h1, .modal-header h2, .modal-header h3, h1, h2, h3, h4, h5, h6');
    if (title) {
      if (!title.id) title.id = `${modal.id || 'modal'}-a11y-title`;
      return title.id;
    }
    return null;
  }

  function inferredLabel(control) {
    if (!control) return '';
    const existing = control.getAttribute?.('aria-label') || control.getAttribute?.('aria-labelledby');
    if (existing) return '';
    const byFor = control.id && global.document?.querySelector?.(`label[for="${global.CSS?.escape ? global.CSS.escape(control.id) : control.id}"]`);
    const nested = control.closest?.('label');
    const group = control.closest?.('.form-group, .field, .form-row, .input-group, .setting-row');
    const localLabel = byFor || nested || group?.querySelector?.('label, .field-label, .form-label, .setting-label');
    const text = String(localLabel?.textContent || control.getAttribute?.('placeholder') || control.getAttribute?.('title') || humanize(control.name || control.id)).trim();
    return text;
  }

  function labelControls(modal) {
    if (!modal?.querySelectorAll) return 0;
    let count = 0;
    modal.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((control) => {
      if (control.disabled || control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
      const label = inferredLabel(control);
      if (label) {
        control.setAttribute('aria-label', label);
        control.dataset.a11yGeneratedLabel = 'true';
        count += 1;
      }
    });
    return count;
  }

  function decorate(modal) {
    if (!modal || modal.dataset.modalA11yManaged === 'true') return modal;
    modal.dataset.modalA11yManaged = 'true';
    modal.setAttribute('role', modal.dataset.modalCritical === 'true' ? 'alertdialog' : 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('tabindex', '-1');
    const titleId = titleFor(modal);
    if (titleId) modal.setAttribute('aria-labelledby', titleId);
    else if (!modal.getAttribute('aria-label')) modal.setAttribute('aria-label', humanize(modal.id));
    labelControls(modal);
    return modal;
  }

  function firstFocusTarget(modal) {
    const list = global.UxA11y?.focusables?.(modal) || [];
    return list.find((el) => !el.matches?.('.modal-close')) || list[0] || modal;
  }

  function activate(modal) {
    if (!modal || activeModal === modal) return;
    if (activeModal) deactivate(activeModal, false);
    decorate(modal);
    lastFocus = lastOutsideFocus || global.document?.activeElement || null;
    activeModal = modal;
    modal.dataset.modalA11yActive = 'true';
    global.setTimeout?.(() => {
      if (activeModal === modal && visible(modal)) firstFocusTarget(modal)?.focus?.({ preventScroll: true });
    }, 0);
  }

  function deactivate(modal, restoreFocus) {
    if (!modal) return;
    delete modal.dataset.modalA11yActive;
    if (activeModal === modal) activeModal = null;
    if (restoreFocus !== false && lastFocus?.isConnected && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  function sync() {
    const modals = Array.prototype.slice.call(global.document?.querySelectorAll?.(MODAL_SELECTOR) || []);
    modals.forEach(decorate);
    const current = modals.find(visible) || null;
    if (current) activate(current);
    else if (activeModal) deactivate(activeModal, true);
  }

  function explicitCancelControl(modal) {
    if (!modal?.querySelectorAll) return null;
    const marked = modal.querySelector('[data-modal-cancel], .modal-close, [data-action="cancel"], [data-action="close"]');
    if (marked && !marked.disabled) return marked;
    const candidate = Array.prototype.slice.call(modal.querySelectorAll('button, [role="button"], input[type="button"], input[type="reset"]'))
      .find((control) => {
        if (control.disabled) return false;
        const label = String(control.getAttribute?.('aria-label') || control.value || control.textContent || '').trim().toLowerCase();
        return /^(?:×|x|cancel|close|dismiss|إلغاء|الغاء|إغلاق|اغلاق|غلق)$/.test(label);
      });
    return candidate || null;
  }

  function onKeydown(event) {
    const modal = activeModal;
    if (!modal || !visible(modal)) return;
    if (event.key === 'Tab') {
      global.UxA11y?.trapFocus?.(modal, event);
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented) {
      const cancel = explicitCancelControl(modal);
      if (cancel) {
        event.preventDefault();
        cancel.click();
      }
    }
  }

  function onFocusIn(event) {
    const targetModal = event.target?.closest?.(MODAL_SELECTOR) || null;
    // Remember the launcher before a legacy handler synchronously focuses a field
    // inside a just-opened modal. MutationObserver will activate one microtask later.
    if (!targetModal) lastOutsideFocus = event.target || lastOutsideFocus;
    if (!activeModal || !visible(activeModal)) return;
    if (!activeModal.contains(event.target)) firstFocusTarget(activeModal)?.focus?.({ preventScroll: true });
  }

  function init() {
    if (initialized || !global.document?.documentElement) return api;
    initialized = true;
    global.document.addEventListener('keydown', onKeydown, true);
    global.document.addEventListener('focusin', onFocusIn, true);
    if (typeof global.MutationObserver === 'function') {
      observer = new global.MutationObserver(sync);
      observer.observe(global.document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
    }
    sync();
    return api;
  }

  function destroy() {
    if (!initialized) return;
    initialized = false;
    global.document?.removeEventListener('keydown', onKeydown, true);
    global.document?.removeEventListener('focusin', onFocusIn, true);
    observer?.disconnect?.();
    observer = null;
    activeModal = null;
    lastFocus = null;
    lastOutsideFocus = null;
  }

  const api = { init, destroy, sync, decorate, labelControls, explicitCancelControl, getActiveModal: () => activeModal };
  global.ModalA11yLifecycle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.document?.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
