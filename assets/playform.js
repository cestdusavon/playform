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

  /* The dropdowns open on their own in CSS. This only keeps aria-expanded
     truthful for screen readers and lets Escape close an open menu. */
  function bindDropdowns(root) {
    var parents = root.querySelectorAll('.pf-header__item--parent');

    Array.prototype.forEach.call(parents, function (item) {
      var trigger = item.querySelector('[data-pf-menu-parent]');
      if (!trigger) return;

      function setExpanded(open) {
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      item.addEventListener('mouseenter', function () {
        item.removeAttribute('data-closed');
        setExpanded(true);
      });
      item.addEventListener('mouseleave', function () {
        item.removeAttribute('data-closed');
        setExpanded(false);
      });
      item.addEventListener('focusin', function () {
        setExpanded(true);
      });
      item.addEventListener('focusout', function (event) {
        if (item.contains(event.relatedTarget)) return;
        item.removeAttribute('data-closed');
        setExpanded(false);
      });

      /* Escape has to force it shut: focus stays on the trigger, which would
         otherwise keep :focus-within matching. */
      item.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        item.setAttribute('data-closed', 'true');
        setExpanded(false);
        trigger.focus();
      });
    });
  }

  function init(root) {
    bindMobileNav(root || document);
    bindDropdowns(root || document);
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
