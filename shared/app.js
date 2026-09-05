/* ---------------------------------------------------------------------------
   All-in-One: shared runtime: header, footer, currency selector + rate widget,
   helpers. Plain ES5-ish vanilla JS, no build step. Loaded with `defer` on every page.

   Pages declare their directory depth via <body data-depth="0|1"> so links and
   asset prefixes resolve correctly both at the domain root and under the
   GitHub Pages subpath (…github.io/all-in-one/).

   Currency: the exchangerate-api endpoint returns EUR->everything in one call.
   We cache the whole rates object (1h) and let the user pick a display currency
   (persisted). getRate() returns the EUR->selected rate; formatAmount() formats
   a value already in the selected currency. onRate() callbacks fire when rates
   resolve AND when the currency changes, so calculators re-render live.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var DEPTH = parseInt(document.body.getAttribute('data-depth') || '0', 10);
  var PREFIX = DEPTH >= 1 ? '../' : '';        // to reach the site root from this page
  var HOME = PREFIX || './';

  var RATES_KEY = 'aio:rates';
  var CURRENCY_KEY = 'aio:currency';
  var RATE_TTL_MS = 60 * 60 * 1000;            // 1 hour
  var RATE_ENDPOINT = 'https://open.er-api.com/v6/latest/EUR';
  var DEFAULT_CURRENCY = 'INR';

  // Supported display currencies. dec = decimals shown for the rate in the pill.
  var CURRENCIES = [
    { code: 'EUR', locale: 'en-IE', dec: 2 },
    { code: 'USD', locale: 'en-US', dec: 2 },
    { code: 'GBP', locale: 'en-GB', dec: 2 },
    { code: 'INR', locale: 'en-IN', dec: 2 },
    { code: 'JPY', locale: 'ja-JP', dec: 0 },
    { code: 'CNY', locale: 'zh-CN', dec: 2 },
    { code: 'AUD', locale: 'en-AU', dec: 2 },
    { code: 'CAD', locale: 'en-CA', dec: 2 },
    { code: 'CHF', locale: 'de-CH', dec: 2 },
    { code: 'SGD', locale: 'en-SG', dec: 2 }
  ];
  var CUR_BY_CODE = {};
  CURRENCIES.forEach(function (c) { CUR_BY_CODE[c.code] = c; });

  // Rough offline fallbacks (EUR -> X), only used if the fetch fails with no cache.
  var FALLBACK_RATES = { EUR: 1, USD: 1.08, GBP: 0.85, INR: 110, JPY: 170, CNY: 7.8, AUD: 1.65, CAD: 1.48, CHF: 0.95, SGD: 1.45 };

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

  /* ---------------- state ---------------- */
  var currency = DEFAULT_CURRENCY;
  var storedCur = load(CURRENCY_KEY);
  if (typeof storedCur === 'string' && CUR_BY_CODE[storedCur]) currency = storedCur;

  var ratesState = { rates: null, updated: null, offline: false };
  var callbacks = [];

  /* ---------------- formatting helpers ---------------- */
  var eurFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var amountFmtCache = {};
  var rateFmtCache = {};
  function amountFmt(code) {
    if (!amountFmtCache[code]) {
      var c = CUR_BY_CODE[code] || { locale: 'en-US' };
      amountFmtCache[code] = new Intl.NumberFormat(c.locale, { style: 'currency', currency: code, maximumFractionDigits: 0 });
    }
    return amountFmtCache[code];
  }
  function rateFmt(code) {
    if (!rateFmtCache[code]) {
      var c = CUR_BY_CODE[code] || { locale: 'en-US', dec: 2 };
      rateFmtCache[code] = new Intl.NumberFormat(c.locale, { style: 'currency', currency: code, minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
    }
    return rateFmtCache[code];
  }

  function formatEUR(n) {
    if (!isFinite(n)) n = 0;
    return eurFmt.format(Math.round(n));
  }
  // Format a value that is ALREADY in the selected currency (whole units).
  function formatAmount(n) {
    if (!isFinite(n)) n = 0;
    return amountFmt(currency).format(Math.round(n));
  }

  function currentRate() {
    if (ratesState.rates && typeof ratesState.rates[currency] === 'number') return ratesState.rates[currency];
    return null;
  }

  /* ---------------- callbacks ---------------- */
  function onRate(cb) {
    callbacks.push(cb);
    if (currentRate() != null) cb(ratesState); // fire immediately if already resolved
  }
  function emit() {
    for (var i = 0; i < callbacks.length; i++) {
      try { callbacks[i](ratesState); } catch (e) {}
    }
  }

  function setRatesData(rates, updatedTs, offline) {
    ratesState.rates = rates;
    ratesState.updated = updatedTs || null;
    ratesState.offline = !!offline;
    renderPill();
    emit();
  }

  function setCurrency(code) {
    if (!CUR_BY_CODE[code]) return;
    currency = code;
    save(CURRENCY_KEY, code);
    syncSelect();
    renderPill();
    emit(); // calculators re-render their converted lines live
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
    var main = pill.querySelector('.rate-main');
    var sub = pill.querySelector('.rate-sub');
    var rate = currentRate();
    if (rate == null) {
      pill.classList.add('loading');
      main.innerHTML = '1 € = <span class="rate-val">–</span>';
      sub.textContent = 'Loading rate…';
      return;
    }
    pill.classList.remove('loading');
    main.innerHTML = '1 € = <span class="accent">' + rateFmt(currency).format(rate) + '</span> ' + currency;
    sub.textContent = ratesState.offline ? '(offline estimate)' : 'Updated ' + formatUpdatedTime(ratesState.updated);
  }

  function syncSelect() {
    var sel = document.getElementById('currencySelect');
    if (sel) sel.value = currency;
  }

  function initRate() {
    var cached = load(RATES_KEY);
    var now = Date.now();
    var haveCache = cached && cached.rates && typeof cached.rates === 'object';

    if (haveCache && cached.fetchedAt && (now - cached.fetchedAt) < RATE_TTL_MS) {
      setRatesData(cached.rates, cached.updated || cached.fetchedAt, cached.offline);
      return;
    }
    // Show stale cache immediately (if any) while we refetch, so there's never a blank pill.
    if (haveCache) setRatesData(cached.rates, cached.updated || cached.fetchedAt, cached.offline);

    fetch(RATE_ENDPOINT, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.rates || typeof data.rates.INR !== 'number') throw new Error('no rates');
        var updatedTs = data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now();
        save(RATES_KEY, { rates: data.rates, updated: updatedTs, fetchedAt: Date.now(), offline: false });
        setRatesData(data.rates, updatedTs, false);
      })
      .catch(function () {
        if (haveCache) {
          setRatesData(cached.rates, cached.updated || cached.fetchedAt, true);
        } else {
          setRatesData(FALLBACK_RATES, null, true);
        }
      });
  }

  /* ---------------- header + footer injection ---------------- */
  function injectChrome() {
    var options = '';
    for (var i = 0; i < CURRENCIES.length; i++) {
      var code = CURRENCIES[i].code;
      options += '<option value="' + code + '"' + (code === currency ? ' selected' : '') + '>' + code + '</option>';
    }

    var headerHTML =
      '<header class="site-header"><div class="wrap">' +
        '<a class="brand" href="' + HOME + '">All-in-One<span class="dot">.</span></a>' +
        '<div class="header-right">' +
          '<select class="currency-select" id="currencySelect" aria-label="Display currency">' + options + '</select>' +
          '<div class="rate-pill loading" id="ratePill" aria-live="polite" title="Live exchange rate">' +
            '<div class="rate-main">1 € = <span class="rate-val">–</span></div>' +
            '<div class="rate-sub">Loading rate…</div>' +
          '</div>' +
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

    var sel = document.getElementById('currencySelect');
    if (sel) sel.addEventListener('change', function () { setCurrency(sel.value); });
  }

  /* ---------------- analytics (GoatCounter, site-wide) ---------------- */
  // Equivalent to placing this before </body> on every page:
  // <script data-goatcounter="https://all-in-one.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
  // (injected as a real element so the script actually executes).
  function injectAnalytics() {
    var s = document.createElement('script');
    s.setAttribute('data-goatcounter', 'https://all-in-one.goatcounter.com/count');
    s.async = true;
    s.src = '//gc.zgo.at/count.js';
    document.body.appendChild(s);
  }

  /* ---------------- info tooltips (click to toggle; hover/focus via CSS) ---------------- */
  function closeAllInfo(except) {
    var open = document.querySelectorAll('.info.open');
    for (var i = 0; i < open.length; i++) {
      if (open[i] === except) continue;
      open[i].classList.remove('open');
      var btn = open[i].querySelector('.info-icon');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }
  function initInfoTips() {
    document.addEventListener('click', function (e) {
      var icon = e.target && e.target.closest ? e.target.closest('.info-icon') : null;
      if (icon) {
        e.preventDefault();
        var info = icon.parentNode;
        var wasOpen = info.classList.contains('open');
        closeAllInfo(info);
        info.classList.toggle('open', !wasOpen);
        icon.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
        return;
      }
      closeAllInfo(null); // click elsewhere closes any open tooltip
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllInfo(null); });
  }

  /* ---------------- public API ---------------- */
  window.AIO = {
    prefix: PREFIX,
    formatEUR: formatEUR,
    formatAmount: formatAmount,
    formatINR: formatAmount, // backward-compatible alias (now formats in the selected currency)
    save: save,
    load: load,
    onRate: onRate,
    getRate: function () { return currentRate(); },
    getCurrency: function () { return currency; },
    setCurrency: setCurrency
  };

  injectChrome();
  injectAnalytics();
  initInfoTips();
  initRate();
})();
