/**
 * V2-5.6 — Accessibility helpers for critical dialogs (focus trap / aria).
 * DOM-oriented but safe no-ops when elements are missing (Node-testable).
 */
(function (global) {
  'use strict';

  let generatedLabelSequence = 0;

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');

  function focusables(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const nodes = Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE_SELECTOR));
    return nodes.filter((el) => {
      if (!el || el.disabled) return false;
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
      const style = typeof global.getComputedStyle === 'function'
        ? global.getComputedStyle(el)
        : null;
      if (style && (style.visibility === 'hidden' || style.display === 'none')) return false;
      return true;
    });
  }

  function trapFocus(root, event) {
    if (!event || event.key !== 'Tab') return false;
    const list = focusables(root);
    if (!list.length) {
      if (event.preventDefault) event.preventDefault();
      return true;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = (root && root.ownerDocument && root.ownerDocument.activeElement) ||
      (typeof document !== 'undefined' ? document.activeElement : null);

    if (event.shiftKey) {
      if (active === first || (root && active === root)) {
        if (event.preventDefault) event.preventDefault();
        if (last && last.focus) last.focus();
        return true;
      }
    } else if (active === last) {
      if (event.preventDefault) event.preventDefault();
      if (first && first.focus) first.focus();
      return true;
    }
    return false;
  }

  function ensureAriaLabel(el, label) {
    if (!el || typeof el !== 'object') return el;
    const text = String(label == null ? '' : label).trim();
    if (!text) return el;
    const existing =
      (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))) ||
      el.ariaLabel ||
      '';
    if (!existing && el.setAttribute) {
      el.setAttribute('aria-label', text);
    } else if (!existing && 'ariaLabel' in el) {
      el.ariaLabel = text;
    }
    return el;
  }

  function criticalDialogAttrs() {
    return {
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-live': 'assertive',
      tabindex: '-1'
    };
  }

  function bindUnboundLabels(root) {
    const scope = root || global.document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return 0;
    let bound = 0;
    const labels = Array.prototype.slice.call(scope.querySelectorAll('label:not([for])'));
    labels.forEach((label) => {
      const text = String(label?.textContent || '').trim();
      if (!text) return;
      const nested = label.control || label.querySelector?.('input:not([type="hidden"]),select,textarea');
      const sibling = label.nextElementSibling?.matches?.('input:not([type="hidden"]),select,textarea')
        ? label.nextElementSibling
        : null;
      const parentCandidate = label.parentElement?.querySelector?.('input:not([type="hidden"]),select,textarea');
      const control = nested || sibling || parentCandidate;
      if (!control || control.disabled) return;
      const hasName = control.getAttribute?.('aria-label') || control.getAttribute?.('aria-labelledby') || control.getAttribute?.('title');
      if (hasName) return;
      if (!label.id) label.id = `ux-label-${generatedLabelSequence += 1}`;
      if (control.setAttribute) control.setAttribute('aria-labelledby', label.id);
      bound += 1;
    });
    return bound;
  }

  const api = {
    FOCUSABLE_SELECTOR,
    focusables,
    trapFocus,
    ensureAriaLabel,
    criticalDialogAttrs,
    bindUnboundLabels
  };

  global.UxA11y = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
