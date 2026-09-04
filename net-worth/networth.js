/* ---------------------------------------------------------------------------
   Net Worth Calculator: live net worth = assets (presets + custom categories)
   minus liabilities. Uses the shared window.AIO helpers (formatting, rate, storage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:networth';
  var ASSETS = ['nwCash', 'nwInvest', 'nwCrypto', 'nwGold'];
  var LIABILITIES = ['nwMortgage', 'nwCarLoan', 'nwCreditCard', 'nwOtherLoans'];
  var FIXED = ASSETS.concat(LIABILITIES);
  var OUT = ['nwTotal', 'nwTotalInr', 'nwAssets', 'nwLiabilities', 'nwMeta'];
  var els = {};
  var custom = [];           // [{ labelEl, amtEl, row }]
  var lastResult = null;

  function $(id) { return document.getElementById(id); }
  function numVal(el) {
    var v = el.value;
    if (v.trim() === '') return 0;
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function sumFixed(ids) { var t = 0; for (var i = 0; i < ids.length; i++) t += numVal(els[ids[i]]); return t; }
  function sumCustom() { var t = 0; for (var i = 0; i < custom.length; i++) t += numVal(custom[i].amtEl); return t; }

  function anyEntered() {
    for (var i = 0; i < FIXED.length; i++) if (els[FIXED[i]].value.trim() !== '') return true;
    for (var j = 0; j < custom.length; j++) {
      if (custom[j].amtEl.value.trim() !== '' || custom[j].labelEl.value.trim() !== '') return true;
    }
    return false;
  }

  /* ---------------- dynamic custom categories ---------------- */
  function addCustom(label, amount) {
    var row = document.createElement('div');
    row.className = 'nw-cat-row';

    var labelEl = document.createElement('input');
    labelEl.type = 'text';
    labelEl.placeholder = 'Category name';
    labelEl.setAttribute('aria-label', 'Custom asset category name');
    if (label != null) labelEl.value = label;

    var amtEl = document.createElement('input');
    amtEl.type = 'number';
    amtEl.inputMode = 'numeric';
    amtEl.placeholder = '0';
    amtEl.step = '100';
    amtEl.setAttribute('aria-label', 'Custom asset amount (euros)');
    if (amount != null && amount !== '') amtEl.value = amount;

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nw-cat-remove';
    removeBtn.setAttribute('aria-label', 'Remove this category');
    removeBtn.textContent = '×';

    var entry = { labelEl: labelEl, amtEl: amtEl, row: row };
    removeBtn.addEventListener('click', function () {
      var i = custom.indexOf(entry);
      if (i > -1) custom.splice(i, 1);
      row.parentNode.removeChild(row);
      compute();
    });
    labelEl.addEventListener('input', compute);
    amtEl.addEventListener('input', compute);

    row.appendChild(labelEl);
    row.appendChild(amtEl);
    row.appendChild(removeBtn);
    els.nwCustom.appendChild(row);
    custom.push(entry);
    return entry;
  }

  /* ---------------- compute + render ---------------- */
  function compute() {
    if (!anyEntered()) { render(null); persist(null); return; }

    var totalAssets = sumFixed(ASSETS) + sumCustom();
    var totalLiabilities = sumFixed(LIABILITIES);
    var totalNetWorth = totalAssets - totalLiabilities;

    var r = { totalNetWorth: totalNetWorth, totalAssets: totalAssets, totalLiabilities: totalLiabilities };
    lastResult = r;
    render(r);
    persist(r);
  }

  function render(r) {
    if (!r) {
      lastResult = null;
      els.nwTotal.textContent = '–';
      els.nwTotalInr.textContent = '';
      els.nwAssets.textContent = '–';
      els.nwLiabilities.textContent = '–';
      els.nwMeta.textContent = 'Enter your assets and liabilities to see your net worth.';
      return;
    }
    els.nwTotal.textContent = AIO.formatEUR(r.totalNetWorth);
    els.nwAssets.textContent = AIO.formatEUR(r.totalAssets);
    els.nwLiabilities.textContent = AIO.formatEUR(r.totalLiabilities);
    els.nwMeta.textContent = r.totalNetWorth < 0
      ? 'Your liabilities currently exceed your assets.'
      : AIO.formatEUR(r.totalAssets) + ' in assets, ' + AIO.formatEUR(r.totalLiabilities) + ' in liabilities.';
    renderINR();
  }

  function renderINR() {
    if (!lastResult) { els.nwTotalInr.textContent = ''; return; }
    var rate = AIO.getRate();
    els.nwTotalInr.textContent = rate == null ? '≈ ₹… (loading rate)'
      : '≈ ' + AIO.formatINR(lastResult.totalNetWorth * rate);
  }

  /* ---------------- persistence ---------------- */
  function persist(result) {
    var s = { result: result, custom: [] };
    FIXED.forEach(function (k) { s[k] = els[k].value; });
    for (var i = 0; i < custom.length; i++) {
      s.custom.push({ label: custom[i].labelEl.value, amount: custom[i].amtEl.value });
    }
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    FIXED.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
    if (Array.isArray(s.custom)) {
      for (var i = 0; i < s.custom.length; i++) addCustom(s.custom[i].label, s.custom[i].amount);
    }
  }

  function init() {
    FIXED.concat(OUT, ['nwCustom', 'nwAddBtn']).forEach(function (id) { els[id] = $(id); });
    restore();
    FIXED.forEach(function (k) { els[k].addEventListener('input', compute); });
    els.nwAddBtn.addEventListener('click', function () {
      var entry = addCustom('', '');
      entry.labelEl.focus();
    });
    AIO.onRate(renderINR);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
