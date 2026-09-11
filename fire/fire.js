/* ---------------------------------------------------------------------------
   FIRE Calculator: Freedom Number, years to financial independence, projected
   year. Each investment category compounds independently at its own return;
   existing net worth grows at the contribution-weighted average of those
   returns. All in today's euros (no inflation applied). Optionally reuses the
   pension calculator's "leave Germany" assumptions to show a converted view.
   Uses the shared window.AIO helpers (formatting, rate, localStorage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:fire';
  var FIELDS = ['fireCurrentAge', 'fireTargetAge', 'fireExpenses', 'fireNetWorth', 'fireWithdrawal'];
  var MAX_MONTHS = 1200; // 100 years cap
  // Editable starter rows. Not mandatory: the user can change or remove them.
  var STARTER = [
    { name: 'Index funds / ETFs', amount: '', rate: '7' },
    { name: 'Fixed deposits', amount: '', rate: '3' }
  ];
  var els = {};
  var investments = [];      // [{ nameEl, amtEl, rateEl, row }]
  var lastFireNumber = null; // for the converted view
  var lastYears = null;
  var userTouched = false;   // set once the user changes anything; gates the homepage dashboard

  function $(id) { return document.getElementById(id); }
  function num(v) { return AIO.parseNumber(v); } // sanitizes thousands separators
  function opt(v, dflt) { return v.trim() === '' ? dflt : num(v); }

  /* ---------------- dynamic investment categories ---------------- */
  function addInvestment(name, amount, rate) {
    var row = document.createElement('div');
    row.className = 'fire-inv-row';

    var nameEl = document.createElement('input');
    nameEl.type = 'text';
    nameEl.placeholder = 'e.g. Stocks';
    nameEl.setAttribute('aria-label', 'Investment category name');
    if (name != null) nameEl.value = name;

    var amtEl = document.createElement('input');
    amtEl.type = 'text';
    amtEl.className = 'amt';
    amtEl.inputMode = 'numeric';
    amtEl.placeholder = '0';
    amtEl.setAttribute('aria-label', 'Monthly investment (euros)');
    if (amount != null && amount !== '') amtEl.value = amount;

    var rateEl = document.createElement('input');
    rateEl.type = 'number';          // keeps the number spinners on the rate field
    rateEl.className = 'rate';
    rateEl.inputMode = 'decimal';
    rateEl.step = '0.1';
    rateEl.min = '0';
    rateEl.placeholder = '7';
    rateEl.setAttribute('aria-label', 'Expected annual return (%)');
    if (rate != null && rate !== '') rateEl.value = rate;

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nw-cat-remove';
    removeBtn.setAttribute('aria-label', 'Remove this category');
    removeBtn.textContent = '×';

    var entry = { nameEl: nameEl, amtEl: amtEl, rateEl: rateEl, row: row };
    removeBtn.addEventListener('click', function () {
      userTouched = true;
      var i = investments.indexOf(entry);
      if (i > -1) investments.splice(i, 1);
      row.parentNode.removeChild(row);
      compute();
    });
    nameEl.addEventListener('input', function () { userTouched = true; compute(); });
    amtEl.addEventListener('input', function () { userTouched = true; compute(); });
    rateEl.addEventListener('input', function () { userTouched = true; compute(); });

    row.appendChild(nameEl);
    row.appendChild(amtEl);
    row.appendChild(rateEl);
    row.appendChild(removeBtn);
    els.fireInvList.appendChild(row);
    investments.push(entry);
    return entry;
  }

  // Parsed, sanitized view of the current investment rows.
  function collectInvestments() {
    var out = [];
    for (var i = 0; i < investments.length; i++) {
      var monthly = opt(investments[i].amtEl.value, 0);
      var rate = opt(investments[i].rateEl.value, 0);
      if (!isFinite(monthly) || monthly < 0) monthly = 0;
      if (!isFinite(rate) || rate < 0) rate = 0;
      out.push({ monthly: monthly, rate: rate });
    }
    return out;
  }

  // Growth rate for the existing net worth: weighted by monthly contribution so
  // the pot tracks where money is actually going; falls back to the simple
  // average of the entered rates, or 0 if there is nothing to average.
  function blendedRate(cats) {
    var wSum = 0, w = 0, rSum = 0, n = 0;
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].monthly > 0) { wSum += cats[i].monthly * cats[i].rate; w += cats[i].monthly; }
      if (cats[i].rate > 0) { rSum += cats[i].rate; n++; }
    }
    if (w > 0) return wSum / w;
    if (n > 0) return rSum / n;
    return 0;
  }

  // Smallest number of years for (net worth compounded at nwRate + each category
  // compounding its own monthly contribution at its own rate) to reach the
  // target. Month-by-month with linear interpolation. Null if not reached.
  function yearsToReach(netWorth, nwRate, cats, target) {
    if (target <= 0) return null;
    if (netWorth >= target) return 0;
    var nwBal = netWorth;
    var nwRm = nwRate / 100 / 12;
    var bals = [], rms = [];
    for (var i = 0; i < cats.length; i++) { bals.push(0); rms.push(cats[i].rate / 100 / 12); }

    var prevTotal = netWorth; // month 0
    for (var m = 1; m <= MAX_MONTHS; m++) {
      nwBal = nwBal * (1 + nwRm);
      var total = nwBal;
      for (var j = 0; j < cats.length; j++) {
        bals[j] = bals[j] * (1 + rms[j]) + cats[j].monthly;
        total += bals[j];
      }
      if (total >= target) {
        var frac = (total - prevTotal) !== 0 ? (target - prevTotal) / (total - prevTotal) : 0;
        return (m - 1 + frac) / 12;
      }
      prevTotal = total;
    }
    return null;
  }

  function compute() {
    var currentAge = num(els.fireCurrentAge.value);
    var targetAge = num(els.fireTargetAge.value);
    var expenses = num(els.fireExpenses.value);
    var netWorth = opt(els.fireNetWorth.value, 0);
    var wr = opt(els.fireWithdrawal.value, 4);

    if (!isFinite(netWorth) || netWorth < 0) netWorth = 0;

    var valid = isFinite(expenses) && expenses > 0 && isFinite(wr) && wr > 0;
    if (!valid) { render(null); return; }

    var cats = collectInvestments();
    var nwRate = blendedRate(cats);
    var annualExpenses = expenses * 12; // input is monthly
    var fireNumber = annualExpenses / (wr / 100);
    var years = yearsToReach(netWorth, nwRate, cats, fireNumber);
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

  // "Comfortable / Extra safe / Very safe" multiples of annual expenses: an
  // informational range, independent of the chosen withdrawal rate.
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
      els.fireGrounding.hidden = true;
      els.fireGrounding.textContent = '';
      els.fireYears.textContent = '–';
      els.fireYearMeta.textContent = '';
      els.fireNumber.textContent = '–';
      els.fireYear.textContent = '–';
      els.fireMeta.textContent = 'Fill in your monthly expenses to see your Freedom Number.';
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
      els.fireYearMeta.textContent = 'Not reached within 100 years at these inputs. Raise your monthly investments or returns, or lower your expenses.';
      els.fireYear.textContent = '–';
      els.fireGrounding.hidden = false;
      els.fireGrounding.textContent = 'At your current pace, you won\'t reach your Freedom Number of ' +
        AIO.formatEUR(r.fireNumber) + ' within 100 years. Raise your monthly investments or returns, or lower your expenses.';
      els.fireMeta.textContent = 'Your Freedom Number is your annual expenses divided by your withdrawal rate.';
      persist({ yearsToFire: null, fireNumber: r.fireNumber, projectedYear: null });
      renderIndia();
      return;
    }

    if (r.years <= 0) {
      els.fireYears.textContent = 'Already there';
      els.fireYearMeta.textContent = 'Your invested assets already cover your Freedom Number.';
      els.fireYear.textContent = String(r.currentYear);
      els.fireGrounding.hidden = false;
      els.fireGrounding.textContent = 'You already have enough saved (' + AIO.formatEUR(r.fireNumber) +
        ') to stop working today, if your expenses hold.';
    } else {
      var projectedYear = Math.floor(r.currentYear + r.years);
      els.fireYears.textContent = r.years.toFixed(1) + ' years';
      els.fireYear.textContent = String(projectedYear);
      els.fireGrounding.hidden = false;
      els.fireGrounding.textContent = 'At your current pace, you could stop working by ' + projectedYear +
        ' with ' + AIO.formatEUR(r.fireNumber) + ' saved.';
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
    els.fireMeta.textContent = 'Your Freedom Number is your annual expenses divided by your withdrawal rate.';

    persist({
      yearsToFire: r.years,
      fireNumber: r.fireNumber,
      projectedYear: r.years <= 0 ? r.currentYear : Math.floor(r.currentYear + r.years)
    });
    renderIndia();
  }

  // Reuse the pension calculator's stored "leave Germany" assumptions for a converted view.
  function renderIndia() {
    var pen = AIO.load('aio:pension') || {};
    var leaveYear = pen.leaveYear != null && String(pen.leaveYear).trim() !== '' ? AIO.parseNumber(pen.leaveYear) : NaN;
    var infl = pen.indiaInflation != null && String(pen.indiaInflation).trim() !== '' ? AIO.parseNumber(pen.indiaInflation) : 7;
    if (!isFinite(infl) || infl < 0) infl = 7;

    var hasLeave = isFinite(leaveYear);
    els.fireIndiaBlock.hidden = !hasLeave;
    els.fireIndiaNote.hidden = hasLeave;
    if (els.fireCurCode) els.fireCurCode.textContent = AIO.getCurrency();

    if (!hasLeave || lastFireNumber == null || lastYears == null) {
      els.fireIndiaNominal.textContent = '–';
      els.fireIndiaReal.textContent = '';
      return;
    }
    var rate = AIO.getRate();
    if (rate == null) {
      els.fireIndiaNominal.textContent = '≈ … (loading rate)';
      els.fireIndiaReal.textContent = '';
      return;
    }
    var nominalINR = lastFireNumber * rate;
    var realINR = nominalINR / Math.pow(1 + infl / 100, lastYears);
    els.fireIndiaNominal.textContent = '≈ ' + AIO.formatAmount(nominalINR);
    els.fireIndiaReal.textContent = 'Real value in today\'s purchasing power: ≈ ' + AIO.formatAmount(realINR) +
      ' (after ' + lastYears.toFixed(1) + ' years at ' + infl + '% inflation)';
  }

  /* ---------------- persistence ---------------- */
  function serializeInvestments() {
    var out = [];
    for (var i = 0; i < investments.length; i++) {
      out.push({ name: investments[i].nameEl.value, amount: investments[i].amtEl.value, rate: investments[i].rateEl.value });
    }
    return out;
  }
  function persist(result) {
    var s = { result: result, touched: userTouched, investments: serializeInvestments() };
    FIELDS.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function persistNull() {
    var s = { result: null, touched: userTouched, investments: serializeInvestments() };
    FIELDS.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return false;
    if (s.touched) userTouched = true;
    FIELDS.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
    if (Array.isArray(s.investments)) {
      for (var i = 0; i < s.investments.length; i++) {
        addInvestment(s.investments[i].name, s.investments[i].amount, s.investments[i].rate);
      }
      return true; // rows were restored (even if the list was intentionally emptied)
    }
    return false;
  }

  function seedStarterRows() {
    for (var i = 0; i < STARTER.length; i++) addInvestment(STARTER[i].name, STARTER[i].amount, STARTER[i].rate);
  }

  function init() {
    FIELDS.concat(['fireYears', 'fireYearMeta', 'fireNumber', 'fireYear', 'fireMeta', 'fireNwHint',
                   'fireGrounding', 'fireInvList', 'fireAddBtn',
                   'fireMultiples', 'fire25', 'fire30', 'fire35',
                   'fireIndiaBlock', 'fireIndiaNote', 'fireIndiaNominal', 'fireIndiaReal', 'fireCurCode']).forEach(function (id) { els[id] = $(id); });

    var firstVisit = !AIO.load(KEY);
    var hadSavedRows = restore();
    // Fresh visitor (or a pre-investments backup): show the editable starter rows.
    if (!hadSavedRows) seedStarterRows();

    // First visit only: prefill net worth from the Net Worth calculator if available.
    if (firstVisit) {
      var nw = AIO.load('aio:networth');
      if (nw && nw.result && isFinite(nw.result.totalNetWorth)) {
        els.fireNetWorth.value = nw.result.totalNetWorth;
        els.fireNwHint.textContent = 'Pulled from your Net Worth calculator. Edit to override.';
      }
    }

    FIELDS.forEach(function (k) { els[k].addEventListener('input', function () { userTouched = true; compute(); }); });
    els.fireAddBtn.addEventListener('click', function () {
      userTouched = true;
      addInvestment('', '', '').nameEl.focus();
    });
    AIO.onRate(renderIndia);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
