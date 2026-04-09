/* ── Link Preview Popup ───────────────────────────────────────────────────
   Shows a small domain/favicon preview when hovering over external links.
   Uses event delegation — works for dynamically created links too.
─────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var popup        = null;
  var showTimer    = null;
  var hideTimer    = null;
  var currentHref  = null;

  /* Build the popup element once */
  function createPopup() {
    var el = document.createElement('div');
    el.id = 'lp-popup';
    el.innerHTML =
      '<img id="lp-favicon" src="" alt="" />' +
      '<div class="lp-body">' +
        '<div id="lp-domain" class="lp-domain"></div>' +
        '<div id="lp-url"    class="lp-url"></div>' +
      '</div>' +
      '<svg class="lp-ext-icon" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M2 10L10 2M10 2H5.5M10 2V6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    document.body.appendChild(el);

    /* After hide transition finishes, collapse out of layout */
    el.addEventListener('transitionend', function () {
      if (!el.classList.contains('lp-visible')) {
        el.style.display = 'none';
      }
    });

    return el;
  }

  function getPopup() {
    return popup || (popup = createPopup());
  }

  /* Extract readable domain from a URL */
  function parseDomain(href) {
    try {
      return new URL(href).hostname.replace(/^www\./, '');
    } catch (e) {
      return href;
    }
  }

  /* Truncate URL for display */
  function truncateUrl(href, max) {
    max = max || 52;
    try {
      var u    = new URL(href);
      var path = u.pathname + (u.search || '');
      var display = u.hostname.replace(/^www\./, '') + (path === '/' ? '' : path);
      return display.length > max ? display.slice(0, max) + '\u2026' : display;
    } catch (e) {
      return href.length > max ? href.slice(0, max) + '\u2026' : href;
    }
  }

  /* Position popup anchored below (or above) the link */
  function positionPopup(anchor) {
    var p    = getPopup();
    var rect = anchor.getBoundingClientRect();
    var pw   = p.offsetWidth  || 280;
    var ph   = p.offsetHeight || 56;
    var vw   = window.innerWidth;
    var vh   = window.innerHeight;

    var top  = rect.bottom + 8;
    var left = rect.left;

    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8)            left = 8;
    if (top + ph > vh - 8)  top  = rect.top - ph - 8;

    p.style.left = left + 'px';
    p.style.top  = top  + 'px';
  }

  function showPreview(anchor) {
    var href = anchor.href;
    if (!href || href.indexOf('http') !== 0) return;

    currentHref = href;

    var p      = getPopup();
    var domain = parseDomain(href);

    p.querySelector('#lp-domain').textContent = domain;
    p.querySelector('#lp-url').textContent    = truncateUrl(href);

    var fav = p.querySelector('#lp-favicon');
    fav.style.display = '';
    fav.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32';
    fav.onerror = function () { this.style.display = 'none'; };

    /* Make it a flex container so offsetWidth is measurable, but start
       with lp-visible absent so the CSS begins from opacity:0 */
    p.classList.remove('lp-visible');
    p.style.display = 'flex';

    /* Two rAF: first lets display apply, second triggers the transition */
    requestAnimationFrame(function () {
      positionPopup(anchor);
      requestAnimationFrame(function () {
        p.classList.add('lp-visible');
      });
    });
  }

  function hidePreview() {
    if (!popup) return;
    popup.classList.remove('lp-visible');
    currentHref = null;
    /* transitionend handler above sets display:none after fade */
  }

  /* ── Event delegation ─────────────────────────────────────────────────── */

  document.addEventListener('mouseover', function (e) {
    var anchor = e.target.closest('a[href]');
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    if (href.indexOf('http') !== 0) return;

    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(function () { showPreview(anchor); }, 200);
  });

  document.addEventListener('mouseout', function (e) {
    var anchor = e.target.closest('a[href]');
    if (!anchor) return;

    /* Only hide when the mouse actually leaves the anchor, not just
       moves between the anchor and one of its children */
    var related = e.relatedTarget;
    if (related && anchor.contains(related)) return;

    clearTimeout(showTimer);
    hideTimer = setTimeout(hidePreview, 150);
  });

  /* Dismiss on scroll or click */
  document.addEventListener('scroll', function () {
    clearTimeout(showTimer);
    hidePreview();
  }, true);

  document.addEventListener('click', function () {
    clearTimeout(showTimer);
    hidePreview();
  });

})();
