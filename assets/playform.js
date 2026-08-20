/* Playform — small progressive-enhancement helpers. */
(function () {
  'use strict';

  function bindMobileNav(root) {
    var header = root.querySelector('[data-pf-header]');
    if (!header) return;

    var toggle = header.querySelector('[data-pf-nav-toggle]');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      var open = header.getAttribute('data-open') === 'true';
      header.setAttribute('data-open', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }

  /* Overlays (cart drawer, search modal) live outside the section, so they are
     bound once against the document rather than per-section. */
  function bindOverlay(triggerSelector, overlaySelector, onOpen) {
    var overlay = document.querySelector(overlaySelector);
    if (!overlay || overlay.dataset.pfBound === 'true') return;
    overlay.dataset.pfBound = 'true';

    function close() {
      overlay.setAttribute('data-open', 'false');
    }

    function open(event) {
      event.preventDefault();
      overlay.setAttribute('data-open', 'true');
      if (onOpen) onOpen(overlay);
    }

    document.addEventListener('click', function (event) {
      var trigger = event.target.closest(triggerSelector);
      if (trigger) {
        open(event);
        return;
      }
      if (event.target.closest('[data-pf-overlay-close]') && overlay.contains(event.target)) {
        close();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });
  }

  function bindOverlays() {
    bindOverlay('[data-pf-cart-toggle]', '[data-pf-cart-drawer]');
    bindOverlay('[data-pf-search-toggle]', '[data-pf-search-modal]', function (overlay) {
      var input = overlay.querySelector('[data-pf-search-input]');
      if (input) input.focus();
    });
  }

  function init(root) {
    bindMobileNav(root || document);
    bindOverlays();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init(document);
    });
  } else {
    init(document);
  }

  /* Re-bind after a theme-editor section reload. */
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})();
