/* ---------------------------------------------------------------------------
   All-in-One — shared runtime: header, footer, EUR/INR rate widget, helpers.
   Plain ES5-ish vanilla JS, no build step. Loaded with `defer` on every page.

   Pages declare their directory depth via <body data-depth="0|1"> so links and
   asset prefixes resolve correctly both at the domain root and under the
   GitHub Pages subpath (…github.io/all-in-one/).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var DEPTH = parseInt(document.body.getAttribute('data-depth') || '0', 10);
  var PREFIX = DEPTH >= 1 ? '../' : '';        // to reach the site root from this page
  var HOME = PREFIX || './';

  var RATE_KEY = 'aio:eurinr';
  var RATE_TTL_MS = 60 * 60 * 1000;            // 1 hour
  var FALLBACK_RATE = 110.00;
  var RATE_ENDPOINT = 'https://open.er-api.com/v6/latest/EUR';

  /* ---------------- formatting helpers ---------------- */
  var eurFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  function formatEUR(n) {
    if (!isFinite(n)) n = 0;
    return eurFmt.format(Math.round(n));
  }
  function formatINR(n) {
    if (!isFinite(n)) n = 0;
    return inrFmt.format(Math.round(n));
  }

  /* ---------------- localStorage helpers ---------------- */
  function save(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------------- EUR/INR rate ---------------- */
  var rateState = { rate: null, updated: null, offline: false };
  var rateCallbacks = [];

  function onRate(cb) {
    rateCallbacks.push(cb);
    if (rateState.rate != null) cb(rateState);   // fire immediately if already resolved
  }
  function emitRate() {
    for (var i = 0; i < rateCallbacks.length; i++) {
      try { rateCallbacks[i](rateState); } catch (e) {}
    }
  }

  function setRate(rate, updatedTs, offline) {
    rateState.rate = rate;
    rateState.updated = updatedTs || null;
    rateState.offline = !!offline;
    renderPill();
    emitRate();
  }

  function formatUpdatedTime(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ', ' + d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } catch (e) { return ''; }
  }

  function renderPill() {
    var pill = document.getElementById('ratePill');
    if (!pill) return;
    pill.classList.remove('loading');
    var main = pill.querySelector('.rate-main');
    var sub = pill.querySelector('.rate-sub');
    main.innerHTML = '1 € = <span class="accent">₹' + rateState.rate.toFixed(2) + '</span>';
    if (rateState.offline) {
      sub.textContent = '(offline estimate)';
    } else {
      sub.textContent = 'Updated ' + formatUpdatedTime(rateState.updated);
    }
  }

  function initRate() {
    var cached = load(RATE_KEY);
    var now = Date.now();
    if (cached && typeof cached.rate === 'number' && cached.fetchedAt && (now - cached.fetchedAt) < RATE_TTL_MS) {
      // fresh enough — reuse without re-fetching
      setRate(cached.rate, cached.updated || cached.fetchedAt, cached.offline);
      return;
    }

    // Show stale cache immediately (if any) while we refetch, so there's never a blank pill.
    if (cached && typeof cached.rate === 'number') {
      setRate(cached.rate, cached.updated || cached.fetchedAt, cached.offline);
    }

    fetch(RATE_ENDPOINT, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var inr = data && data.rates && data.rates.INR;
        if (typeof inr !== 'number') throw new Error('no INR rate');
        var updatedTs = data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now();
        save(RATE_KEY, { rate: inr, updated: updatedTs, fetchedAt: Date.now(), offline: false });
        setRate(inr, updatedTs, false);
      })
      .catch(function () {
        // keep a usable stale cache if we have one; otherwise fall back to the hardcoded rate
        if (cached && typeof cached.rate === 'number') {
          setRate(cached.rate, cached.updated || cached.fetchedAt, true);
        } else {
          setRate(FALLBACK_RATE, null, true);
        }
      });
  }

  /* ---------------- header + footer injection ---------------- */
  function injectChrome() {
    var headerHTML =
      '<header class="site-header"><div class="wrap">' +
        '<a class="brand" href="' + HOME + '">All-in-One<span class="dot">.</span></a>' +
        '<div class="rate-pill loading" id="ratePill" aria-live="polite" title="Live EUR to INR exchange rate">' +
          '<div class="rate-main">1 € = ₹—</div>' +
          '<div class="rate-sub">Loading rate…</div>' +
        '</div>' +
      '</div></header>';

    var year = new Date().getFullYear();
    var footerHTML =
      '<footer class="site-footer"><div class="wrap">' +
        '<div>Built by <a href="https://balajijayakumar.com" target="_blank" rel="noopener noreferrer">Balaji</a> · © ' + year + '</div>' +
        '<nav class="legal-links">' +
          '<a href="' + PREFIX + 'impressum/">Impressum</a>' +
          '<a href="' + PREFIX + 'datenschutz/">Datenschutz</a>' +
          '<a href="https://github.com/VariedVault/all-in-one" target="_blank" rel="noopener noreferrer">GitHub</a>' +
        '</nav>' +
      '</div></footer>';

    document.body.insertAdjacentHTML('afterbegin', headerHTML);
    document.body.insertAdjacentHTML('beforeend', footerHTML);
  }

  /* ---------------- public API ---------------- */
  window.AIO = {
    prefix: PREFIX,
    formatEUR: formatEUR,
    formatINR: formatINR,
    save: save,
    load: load,
    onRate: onRate,
    getRate: function () { return rateState.rate; }
  };

  injectChrome();
  initRate();
})();
