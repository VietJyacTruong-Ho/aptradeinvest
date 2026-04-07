/* ── Link Preview Popup ───────────────────────────────────────────────────
   Shows a small domain/favicon preview when hovering over external links.
   Uses event delegation — works for dynamically created links too.
─────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var popup   = null;
  var showTimer = null;
  var hideTimer = null;
  var currentHref = null;

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
    return el;
  }

  function getPopup() {
    return popup || (popup = createPopup());
  }

  /* Extract readable domain from a URL */
  function parseDomain(href) {
    try {
      var u = new URL(href);
      return u.hostname.replace(/^www\./, '');
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
      return display.length > max ? display.slice(0, max) + '…' : display;
    } catch (e) {
      return href.length > max ? href.slice(0, max) + '…' : href;
    }
  }

  /* Position popup near the anchor element */
  function positionPopup(el) {
    var p    = getPopup();
    var rect = el.getBoundingClientRect();
    var pw   = p.offsetWidth  || 280;
    var ph   = p.offsetHeight || 56;
    var vw   = window.innerWidth;
    var vh   = window.innerHeight;

    var top  = rect.bottom + 8;
    var left = rect.left;

    /* Keep within viewport */
    if (left + pw > vw - 8)  left = vw - pw - 8;
    if (left < 8)             left = 8;
    if (top + ph > vh - 8)   top  = rect.top - ph - 8;

    p.style.left = left + 'px';
    p.style.top  = top  + 'px';
  }

  function showPreview(anchor) {
    var href = anchor.href;
    if (!href || href.startsWith('javascript:')) return;
    currentHref = href;

    var p      = getPopup();
    var domain = parseDomain(href);
    var url    = truncateUrl(href);

    p.querySelector('#lp-domain').textContent = domain;
    p.querySelector('#lp-url').textContent    = url;

    var favicon = p.querySelector('#lp-favicon');
    favicon.src = 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=32';
    favicon.onerror = function () { this.style.display = 'none'; };
    favicon.onload  = function () { this.style.display = ''; };

    /* Place off-screen first to measure, then position */
    p.style.opacity    = '0';
    p.style.transform  = 'translateY(4px)';
    p.style.display    = 'flex';
    p.style.pointerEvents = 'none';

    /* Next tick so offsetWidth is available */
    requestAnimationFrame(function () {
      positionPopup(anchor);
      p.classList.add('lp-visible');
    });
  }

  function hidePreview() {
    if (!popup) return;
    popup.classList.remove('lp-visible');
  }

  /* Event delegation on document */
  document.addEventListener('mouseover', function (e) {
    var anchor = e.target.closest('a[href]');
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || !href.startsWith('http')) return;

    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    if (anchor.href === currentHref && popup && popup.classList.contains('lp-visible')) return;

    showTimer = setTimeout(function () { showPreview(anchor); }, 180);
  });

  document.addEventListener('mouseout', function (e) {
    var anchor = e.target.closest('a[href]');
    if (!anchor) return;

    clearTimeout(showTimer);
    hideTimer = setTimeout(hidePreview, 120);
  });

  /* Hide on scroll / click */
  document.addEventListener('scroll', hidePreview, true);
  document.addEventListener('click', function () {
    clearTimeout(showTimer);
    hidePreview();
    currentHref = null;
  });

})();
