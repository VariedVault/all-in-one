/* ---------------------------------------------------------------------------
   Net Worth Calculator: live net worth = assets (presets + custom categories)
   minus liabilities (presets + custom categories). Uses the shared window.AIO
   helpers (formatting, rate, storage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:networth';
  var ASSETS = ['nwCash', 'nwBank', 'nwFixedDeposits', 'nwInvest', 'nwCrypto', 'nwGold', 'nwRealEstate'];
  var LIABILITIES = ['nwMortgage', 'nwCarLoan', 'nwCreditCard', 'nwOtherLoans'];
  var FIXED = ASSETS.concat(LIABILITIES);
  var OUT = ['nwTotal', 'nwTotalInr', 'nwAssets', 'nwLiabilities', 'nwMeta'];
  var els = {};
  var customAssets = [];     // [{ labelEl, amtEl, row }]
  var customLiabs = [];
  var lastResult = null;

  function $(id) { return document.getElementById(id); }
  function numVal(el) {
    var v = el.value;
    if (v.trim() === '') return 0;
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function sumFixed(ids) { var t = 0; for (var i = 0; i < ids.length; i++) t += numVal(els[ids[i]]); return t; }
  function sumCustom(list) { var t = 0; for (var i = 0; i < list.length; i++) t += numVal(list[i].amtEl); return t; }

  function customHasEntry(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].amtEl.value.trim() !== '' || list[i].labelEl.value.trim() !== '') return true;
    }
    return false;
  }
  function anyEntered() {
    for (var i = 0; i < FIXED.length; i++) if (els[FIXED[i]].value.trim() !== '') return true;
    return customHasEntry(customAssets) || customHasEntry(customLiabs);
  }

  /* ---------------- dynamic custom categories ---------------- */
  // A custom row reuses the .nw-row grid: name (col 1), amount (col 2), remove (col 3).
  function addCustom(container, list, label, amount) {
    var row = document.createElement('div');
    row.className = 'nw-row';

    var labelEl = document.createElement('input');
    labelEl.type = 'text';
    labelEl.placeholder = 'Category name';
    labelEl.setAttribute('aria-label', 'Custom category name');
    if (label != null) labelEl.value = label;

    var amtEl = document.createElement('input');
    amtEl.type = 'number';
    amtEl.inputMode = 'numeric';
    amtEl.placeholder = '0';
    amtEl.step = '100';
    amtEl.setAttribute('aria-label', 'Custom amount (euros)');
    if (amount != null && amount !== '') amtEl.value = amount;

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nw-cat-remove';
    removeBtn.setAttribute('aria-label', 'Remove this category');
    removeBtn.textContent = '×';

    var entry = { labelEl: labelEl, amtEl: amtEl, row: row };
    removeBtn.addEventListener('click', function () {
      var i = list.indexOf(entry);
      if (i > -1) list.splice(i, 1);
      row.parentNode.removeChild(row);
      compute();
    });
    labelEl.addEventListener('input', compute);
    amtEl.addEventListener('input', compute);

    row.appendChild(labelEl);
    row.appendChild(amtEl);
    row.appendChild(removeBtn);
    container.appendChild(row);
    list.push(entry);
    return entry;
  }

  /* ---------------- compute + render ---------------- */
  function compute() {
    if (!anyEntered()) { render(null); persist(null); return; }

    var totalAssets = sumFixed(ASSETS) + sumCustom(customAssets);
    var totalLiabilities = sumFixed(LIABILITIES) + sumCustom(customLiabs);
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
  function serializeCustom(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push({ label: list[i].labelEl.value, amount: list[i].amtEl.value });
    return out;
  }
  function persist(result) {
    var s = { result: result, customAssets: serializeCustom(customAssets), customLiabs: serializeCustom(customLiabs) };
    FIXED.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    FIXED.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
    // customAssets is the current key; `custom` is the pre-liabilities-split legacy key.
    var savedAssets = Array.isArray(s.customAssets) ? s.customAssets : (Array.isArray(s.custom) ? s.custom : []);
    for (var i = 0; i < savedAssets.length; i++) addCustom(els.nwCustom, customAssets, savedAssets[i].label, savedAssets[i].amount);
    if (Array.isArray(s.customLiabs)) {
      for (var j = 0; j < s.customLiabs.length; j++) addCustom(els.nwLiabCustom, customLiabs, s.customLiabs[j].label, s.customLiabs[j].amount);
    }
  }

  function init() {
    FIXED.concat(OUT, ['nwCustom', 'nwAddBtn', 'nwLiabCustom', 'nwLiabAddBtn']).forEach(function (id) { els[id] = $(id); });
    restore();
    FIXED.forEach(function (k) { els[k].addEventListener('input', compute); });
    els.nwAddBtn.addEventListener('click', function () {
      addCustom(els.nwCustom, customAssets, '', '').labelEl.focus();
    });
    els.nwLiabAddBtn.addEventListener('click', function () {
      addCustom(els.nwLiabCustom, customLiabs, '', '').labelEl.focus();
    });
    AIO.onRate(renderINR);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
