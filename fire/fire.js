/* ---------------------------------------------------------------------------
   FIRE Calculator: FIRE number, years to financial independence, projected year.
   All in today's euros (no inflation applied). Optionally reuses the pension
   calculator's "leave Germany" assumptions to show an Indian-rupee view.
   Uses the shared window.AIO helpers (formatting, rate, localStorage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:fire';
  var FIELDS = ['fireCurrentAge', 'fireTargetAge', 'fireExpenses', 'fireNetWorth', 'fireSavings', 'fireReturn', 'fireWithdrawal'];
  var MAX_MONTHS = 1200; // 100 years cap
  var els = {};
  var lastFireNumber = null; // for the INR conversion
  var lastYears = null;
  var userTouched = false;   // set once the user changes any field; gates the homepage dashboard

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function opt(v, dflt) { return v.trim() === '' ? dflt : num(v); }

  // Smallest number of years for (netWorth compounded + monthly contributions
  // compounded) to reach the target. Month-by-month with linear interpolation
  // for a smooth figure. Returns null if not reached within the cap.
  function yearsToReach(netWorth, monthly, annualReturn, target) {
    if (netWorth >= target) return 0;
    var rm = annualReturn / 100 / 12;
    var bal = netWorth;
    for (var m = 1; m <= MAX_MONTHS; m++) {
      var prev = bal;
      bal = bal * (1 + rm) + monthly;
      if (bal >= target) {
        var frac = (bal - prev) !== 0 ? (target - prev) / (bal - prev) : 0;
        return (m - 1 + frac) / 12;
      }
    }
    return null;
  }

  function compute() {
    var currentAge = num(els.fireCurrentAge.value);
    var targetAge = num(els.fireTargetAge.value);
    var expenses = num(els.fireExpenses.value);
    var netWorth = opt(els.fireNetWorth.value, 0);
    var savings = opt(els.fireSavings.value, 0);
    var ret = opt(els.fireReturn.value, 6.5);
    var wr = opt(els.fireWithdrawal.value, 4);

    if (!isFinite(netWorth) || netWorth < 0) netWorth = 0;
    if (!isFinite(savings) || savings < 0) savings = 0;
    if (!isFinite(ret) || ret < 0) ret = 0;

    var valid = isFinite(expenses) && expenses > 0 && isFinite(wr) && wr > 0;
    if (!valid) { render(null); return; }

    var annualExpenses = expenses * 12; // input is monthly
    var fireNumber = annualExpenses / (wr / 100);
    var years = yearsToReach(netWorth, savings, ret, fireNumber);
    var currentYear = new Date().getFullYear();

    render({
      fireNumber: fireNumber,
      annualExpenses: annualExpenses,
      years: years,
      currentAge: isFinite(currentAge) ? currentAge : null,
      targetAge: isFinite(targetAge) ? targetAge : null,
      currentYear: currentYear
    });
  }

  // 25x / 30x / 35x of annual expenses: an informational range, independent of
  // the user's chosen withdrawal rate. Does not affect any other figure.
  function renderMultiples(annualExpenses) {
    if (annualExpenses == null) { els.fireMultiples.hidden = true; return; }
    els.fire25.textContent = AIO.formatEUR(annualExpenses * 25);
    els.fire30.textContent = AIO.formatEUR(annualExpenses * 30);
    els.fire35.textContent = AIO.formatEUR(annualExpenses * 35);
    els.fireMultiples.hidden = false;
  }

  function render(r) {
    if (!r) {
      lastFireNumber = null; lastYears = null;
      els.fireYears.textContent = '–';
      els.fireYearMeta.textContent = '';
      els.fireNumber.textContent = '–';
      els.fireYear.textContent = '–';
      els.fireMeta.textContent = 'Fill in your expenses and withdrawal rate to see your FIRE number.';
      renderMultiples(null);
      persistNull();
      renderIndia();
      return;
    }

    els.fireNumber.textContent = AIO.formatEUR(r.fireNumber);
    lastFireNumber = r.fireNumber;
    lastYears = r.years;
    renderMultiples(r.annualExpenses);

    if (r.years === null) {
      els.fireYears.textContent = 'Over 100';
      els.fireYearMeta.textContent = 'Not reached within 100 years at these inputs. Raise your savings or return, or lower your expenses.';
      els.fireYear.textContent = '–';
      els.fireMeta.textContent = 'Your FIRE number is ' + AIO.formatEUR(r.fireNumber) + '.';
      persist({ yearsToFire: null, fireNumber: r.fireNumber, projectedYear: null });
      renderIndia();
      return;
    }

    if (r.years <= 0) {
      els.fireYears.textContent = 'Already there';
      els.fireYearMeta.textContent = 'Your invested assets already cover your FIRE number.';
      els.fireYear.textContent = String(r.currentYear);
    } else {
      var projectedYear = Math.floor(r.currentYear + r.years);
      els.fireYears.textContent = r.years.toFixed(1) + ' years';
      els.fireYear.textContent = String(projectedYear);
      var meta = 'Projected FIRE year: ' + projectedYear;
      if (r.currentAge != null) {
        var projAge = Math.round(r.currentAge + r.years);
        meta += ' (age ' + projAge + ')';
        if (r.targetAge != null) {
          var diff = Math.round(r.targetAge - projAge);
          if (diff > 0) meta += ', ' + diff + ' year' + (diff === 1 ? '' : 's') + ' ahead of your target of ' + r.targetAge + '.';
          else if (diff < 0) meta += ', ' + (-diff) + ' year' + (diff === -1 ? '' : 's') + ' past your target of ' + r.targetAge + '.';
          else meta += ', right on your target of ' + r.targetAge + '.';
        }
      }
      els.fireYearMeta.textContent = meta;
    }
    els.fireMeta.textContent = 'Your FIRE number is annual expenses divided by your withdrawal rate.';

    persist({
      yearsToFire: r.years,
      fireNumber: r.fireNumber,
      projectedYear: r.years <= 0 ? r.currentYear : Math.floor(r.currentYear + r.years)
    });
    renderIndia();
  }

  // Reuse the pension calculator's stored "leave Germany" assumptions for a rupee view.
  function renderIndia() {
    var pen = AIO.load('aio:pension') || {};
    var leaveYear = pen.leaveYear != null && String(pen.leaveYear).trim() !== '' ? parseFloat(pen.leaveYear) : NaN;
    var infl = pen.indiaInflation != null && String(pen.indiaInflation).trim() !== '' ? parseFloat(pen.indiaInflation) : 7;
    if (!isFinite(infl) || infl < 0) infl = 7;

    var hasLeave = isFinite(leaveYear);
    els.fireIndiaBlock.hidden = !hasLeave;
    els.fireIndiaNote.hidden = hasLeave;

    if (!hasLeave || lastFireNumber == null || lastYears == null) {
      els.fireIndiaNominal.textContent = '–';
      els.fireIndiaReal.textContent = '';
      return;
    }
    var rate = AIO.getRate();
    if (rate == null) {
      els.fireIndiaNominal.textContent = '≈ ₹… (loading rate)';
      els.fireIndiaReal.textContent = '';
      return;
    }
    var nominalINR = lastFireNumber * rate;
    var realINR = nominalINR / Math.pow(1 + infl / 100, lastYears);
    els.fireIndiaNominal.textContent = '≈ ' + AIO.formatINR(nominalINR);
    els.fireIndiaReal.textContent = 'Real value in today\'s purchasing power: ≈ ' + AIO.formatINR(realINR) +
      ' (after ' + lastYears.toFixed(1) + ' years at ' + infl + '% inflation)';
  }

  function persist(result) {
    var s = { result: result, touched: userTouched };
    FIELDS.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function persistNull() {
    var s = { result: null, touched: userTouched };
    FIELDS.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    if (s.touched) userTouched = true;
    FIELDS.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
  }

  function init() {
    FIELDS.concat(['fireYears', 'fireYearMeta', 'fireNumber', 'fireYear', 'fireMeta', 'fireNwHint',
                   'fireMultiples', 'fire25', 'fire30', 'fire35',
                   'fireIndiaBlock', 'fireIndiaNote', 'fireIndiaNominal', 'fireIndiaReal']).forEach(function (id) { els[id] = $(id); });

    var firstVisit = !AIO.load(KEY);
    restore();

    // First visit only: prefill net worth from the Net Worth calculator if available.
    if (firstVisit) {
      var nw = AIO.load('aio:networth');
      if (nw && nw.result && isFinite(nw.result.totalNetWorth)) {
        els.fireNetWorth.value = nw.result.totalNetWorth;
        els.fireNwHint.textContent = 'Pulled from your Net Worth calculator. Edit to override.';
      }
    }

    FIELDS.forEach(function (k) { els[k].addEventListener('input', function () { userTouched = true; compute(); }); });
    AIO.onRate(renderIndia);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
