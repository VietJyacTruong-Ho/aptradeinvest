/* ── ui-redesign.js — tab switching + tab count badge ─────────────── */
(function() {
  'use strict';

  function setActiveTab(name) {
    var tabs  = document.querySelectorAll('.tab');
    var panes = document.querySelectorAll('.rail-pane');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].dataset.tab === name;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.toggle('on', panes[j].dataset.pane === name);
    }
    if (name === 'map' && window._map && typeof window._map.invalidateSize === 'function') {
      setTimeout(function() { window._map.invalidateSize(); }, 60);
    }
  }
  document.addEventListener('click', function(ev) {
    var t = ev.target.closest('.tab');
    if (t) setActiveTab(t.dataset.tab);
  });

  var cardsEl = document.getElementById('cards');
  if (cardsEl && typeof MutationObserver !== 'undefined') {
    var countEl = document.getElementById('railCount');
    var obs = new MutationObserver(function() {
      if (!countEl) return;
      var n = cardsEl.querySelectorAll('.icard').length;
      countEl.textContent = n > 0 ? n : '\u2014';
    });
    obs.observe(cardsEl, { childList: true, subtree: true });
  }

  function nudgeMap() {
    if (window._map && typeof window._map.invalidateSize === 'function') {
      window._map.invalidateSize();
    }
  }
  window.addEventListener('resize', function() { setTimeout(nudgeMap, 100); });
})();
