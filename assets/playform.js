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

  function init(root) {
    bindMobileNav(root || document);
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
