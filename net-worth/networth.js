/* ---------------------------------------------------------------------------
   Net Worth Calculator: live total + liquid net worth with a liquid/illiquid
   asset split. Uses the shared window.AIO helpers (formatting, rate, storage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:networth';
  var LIQUID = ['nwCash', 'nwInvest', 'nwCrypto', 'nwGold', 'nwOtherLiquid'];
  var ILLIQUID = ['nwRealEstate', 'nwRetirement', 'nwVehicle', 'nwBusiness', 'nwOtherIlliquid'];
  var LIABILITIES = ['nwMortgage', 'nwCarLoan', 'nwCreditCard', 'nwOtherLoans'];
  var INPUTS = LIQUID.concat(ILLIQUID, LIABILITIES);
  var OUT = ['nwTotal', 'nwTotalInr', 'nwLiquid', 'nwLiquidInr', 'nwSplitLiquid', 'nwSplitIlliquid',
             'nwLiquidPct', 'nwLiquidAssets', 'nwIlliquidPct', 'nwIlliquidAssets',
             'nwAssets', 'nwLiabilities', 'nwMeta'];
  var els = {};
  var lastResult = null;

  function $(id) { return document.getElementById(id); }
  function val(id) {
    var v = els[id].value;
    if (v.trim() === '') return 0;
    var n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : (isFinite(n) ? n : 0);
  }
  function sum(ids) { var t = 0; for (var i = 0; i < ids.length; i++) t += val(ids[i]); return t; }
  function anyEntered() {
    for (var i = 0; i < INPUTS.length; i++) if (els[INPUTS[i]].value.trim() !== '') return true;
    return false;
  }

  function compute() {
    if (!anyEntered()) { render(null); persist(null); return; }

    var liquidAssets = sum(LIQUID);
    var illiquidAssets = sum(ILLIQUID);
    var totalAssets = liquidAssets + illiquidAssets;
    var totalLiabilities = sum(LIABILITIES);
    var totalNetWorth = totalAssets - totalLiabilities;
    var liquidNetWorth = liquidAssets - totalLiabilities;

    var r = {
      totalNetWorth: totalNetWorth,
      liquidNetWorth: liquidNetWorth,
      liquidAssets: liquidAssets,
      illiquidAssets: illiquidAssets,
      totalAssets: totalAssets,
      totalLiabilities: totalLiabilities
    };
    lastResult = r;
    render(r);
    persist(r);
  }

  function render(r) {
    if (!r) {
      lastResult = null;
      els.nwTotal.textContent = '–';
      els.nwLiquid.textContent = '–';
      els.nwTotalInr.textContent = '';
      els.nwLiquidInr.textContent = '';
      els.nwAssets.textContent = '–';
      els.nwLiabilities.textContent = '–';
      els.nwLiquidPct.textContent = '–';
      els.nwIlliquidPct.textContent = '–';
      els.nwLiquidAssets.textContent = '–';
      els.nwIlliquidAssets.textContent = '–';
      els.nwSplitLiquid.style.width = '0%';
      els.nwSplitIlliquid.style.width = '0%';
      els.nwMeta.textContent = 'Enter your assets and liabilities to see your net worth.';
      return;
    }
    els.nwTotal.textContent = AIO.formatEUR(r.totalNetWorth);
    els.nwLiquid.textContent = AIO.formatEUR(r.liquidNetWorth);
    els.nwAssets.textContent = AIO.formatEUR(r.totalAssets);
    els.nwLiabilities.textContent = AIO.formatEUR(r.totalLiabilities);

    var liquidPct = r.totalAssets > 0 ? (r.liquidAssets / r.totalAssets) * 100 : 0;
    var illiquidPct = r.totalAssets > 0 ? 100 - liquidPct : 0;
    els.nwSplitLiquid.style.width = liquidPct + '%';
    els.nwSplitIlliquid.style.width = illiquidPct + '%';
    els.nwLiquidPct.textContent = Math.round(liquidPct) + '%';
    els.nwIlliquidPct.textContent = Math.round(illiquidPct) + '%';
    els.nwLiquidAssets.textContent = AIO.formatEUR(r.liquidAssets);
    els.nwIlliquidAssets.textContent = AIO.formatEUR(r.illiquidAssets);

    els.nwMeta.textContent = r.totalNetWorth < 0
      ? 'Your liabilities currently exceed your assets.'
      : Math.round(liquidPct) + '% of your assets are liquid (easy to access quickly).';

    renderINR();
  }

  function renderINR() {
    if (!lastResult) { els.nwTotalInr.textContent = ''; els.nwLiquidInr.textContent = ''; return; }
    var rate = AIO.getRate();
    if (rate == null) {
      els.nwTotalInr.textContent = '≈ ₹… (loading rate)';
      els.nwLiquidInr.textContent = '≈ ₹… (loading rate)';
      return;
    }
    els.nwTotalInr.textContent = '≈ ' + AIO.formatINR(lastResult.totalNetWorth * rate);
    els.nwLiquidInr.textContent = '≈ ' + AIO.formatINR(lastResult.liquidNetWorth * rate);
  }

  function persist(result) {
    var s = { result: result };
    INPUTS.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    INPUTS.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
  }

  function init() {
    INPUTS.concat(OUT).forEach(function (id) { els[id] = $(id); });
    restore();
    INPUTS.forEach(function (k) { els[k].addEventListener('input', compute); });
    AIO.onRate(renderINR);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
