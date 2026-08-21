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

  /* Show / hide a password field. */
  function bindPasswordToggles(root) {
    var toggles = root.querySelectorAll('[data-pf-password-toggle]');

    Array.prototype.forEach.call(toggles, function (toggle) {
      var field = document.getElementById(toggle.dataset.pfPasswordToggle);
      if (!field) return;

      toggle.addEventListener('click', function () {
        var hidden = field.type === 'password';
        field.type = hidden ? 'text' : 'password';
        toggle.textContent = hidden ? toggle.dataset.labelHide : toggle.dataset.labelShow;
        toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      });
    });
  }

  /* The login page keeps the recover-password form in the same page. */
  function bindLoginToggle(root) {
    var wrapper = root.querySelector('[data-pf-login]');
    if (!wrapper) return;

    var login = wrapper.querySelector('.pf-auth__card--login');
    var recover = wrapper.querySelector('[data-pf-recover]');
    if (!login || !recover) return;

    function show(showRecover) {
      login.hidden = showRecover;
      recover.hidden = !showRecover;
      var focusTarget = (showRecover ? recover : login).querySelector('input');
      if (focusTarget) focusTarget.focus();
    }

    wrapper.addEventListener('click', function (event) {
      if (event.target.closest('[data-pf-show-recover]')) show(true);
      if (event.target.closest('[data-pf-hide-recover]')) show(false);
    });

    /* Shopify reloads with ?form_type=recover_customer_password on error or
       success, so reopen the panel the customer was actually using. */
    if (window.location.search.indexOf('recover') > -1 || recover.querySelector('.pf-notice')) {
      login.hidden = true;
      recover.hidden = false;
    }
  }

  function bindAddressForms(root) {
    root.addEventListener('click', function (event) {
      var toggle = event.target.closest('[data-pf-address-toggle]');
      if (toggle) {
        var panel = document.getElementById(toggle.dataset.pfAddressToggle);
        if (panel) {
          panel.hidden = !panel.hidden;
          if (!panel.hidden) {
            var first = panel.querySelector('input, select');
            if (first) first.focus();
          }
        }
        return;
      }

      var confirmer = event.target.closest('[data-pf-confirm]');
      if (confirmer && !window.confirm(confirmer.dataset.pfConfirm)) {
        event.preventDefault();
      }
    });
  }

  /* Cart quantity steppers, with the line and totals refreshed from the
     Cart API. The form still submits normally if any of this fails. */
  function bindCart(root) {
    var form = root.querySelector('form.pf-cart-form');
    if (!form) return;

    var lines = form.querySelector('[data-pf-cart-lines]');
    var totalEl = document.querySelector('[data-pf-cart-total]');
    var countEl = document.querySelector('[data-pf-cart-count]');
    var meter = document.querySelector('[data-pf-meter]');

    function repaint(state) {
      if (totalEl && state.totalFormatted) totalEl.textContent = state.totalFormatted;
      if (countEl && state.countLabel) countEl.textContent = state.countLabel;

      if (meter) {
        var threshold = Number(meter.dataset.pfMeterThreshold);
        var fill = meter.querySelector('[data-pf-meter-fill]');
        if (fill && threshold > 0) {
          fill.style.width = Math.min(100, (state.total / threshold) * 100) + '%';
        }
      }
    }

    function update(index, quantity, row) {
      form.setAttribute('aria-busy', 'true');
      if (row) row.setAttribute('data-pf-updating', 'true');

      fetch(window.Shopify && window.Shopify.routes ? window.Shopify.routes.root + 'cart/change.js' : '/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line: index, quantity: quantity })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('cart');
          return response.json();
        })
        .then(function (cart) {
          if (quantity === 0 || cart.item_count === 0) {
            window.location.reload();
            return;
          }

          var line = cart.items[index - 1];
          if (row && line) {
            var lineTotal = row.querySelector('[data-pf-line-total]');
            if (lineTotal) lineTotal.textContent = formatMoney(line.final_line_price);
          }

          repaint({
            total: cart.total_price,
            totalFormatted: formatMoney(cart.total_price),
            countLabel: null
          });

          if (meter) refreshMeterLabel(meter, cart.total_price);
        })
        .catch(function () {
          form.submit(); /* fall back to the non-JS update */
        })
        .then(function () {
          form.removeAttribute('aria-busy');
          if (row) row.removeAttribute('data-pf-updating');
        });
    }

    function formatMoney(cents) {
      var format = (window.Shopify && window.Shopify.money_format) || '${{amount}}';
      var value = (cents / 100).toFixed(2);
      if (format.indexOf('{{amount}}') > -1) return format.replace('{{amount}}', value);
      if (format.indexOf('{{ amount }}') > -1) return format.replace('{{ amount }}', value);
      return '$' + value;
    }

    function refreshMeterLabel(node, total) {
      var threshold = Number(node.dataset.pfMeterThreshold);
      var label = node.querySelector('[data-pf-meter-label]');
      if (!label || !threshold) return;

      var left = threshold - total;
      if (left > 0 && label.dataset.pfProgressTemplate) {
        label.textContent = label.dataset.pfProgressTemplate.replace('[amount]', formatMoney(left));
      } else if (left <= 0 && label.dataset.pfReachedLabel) {
        label.textContent = label.dataset.pfReachedLabel;
      }
    }

    lines.addEventListener('click', function (event) {
      var step = event.target.closest('[data-pf-qty-step]');
      if (step) {
        var row = step.closest('[data-pf-line]');
        var input = row.querySelector('[data-pf-qty]');
        var next = Math.max(0, Number(input.value) + Number(step.dataset.pfQtyStep));
        input.value = next;
        update(Number(row.dataset.pfLine), next, row);
        return;
      }

      var remove = event.target.closest('[data-pf-line-remove]');
      if (remove) {
        var target = remove.closest('[data-pf-line]');
        update(Number(remove.dataset.pfLineRemove), 0, target);
      }
    });

    lines.addEventListener('change', function (event) {
      var input = event.target.closest('[data-pf-qty]');
      if (!input) return;
      var row = input.closest('[data-pf-line]');
      update(Number(row.dataset.pfLine), Math.max(0, Number(input.value)), row);
    });
  }

  function init(root) {
    var scope = root || document;
    bindMobileNav(scope);
    bindDropdowns(scope);
    bindOverlays();
    bindPasswordToggles(scope);
    bindLoginToggle(scope);
    bindCart(scope);
    if (scope === document) bindAddressForms(document);
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
