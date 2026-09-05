/* ---------------------------------------------------------------------------
   Loan & EMI Calculator.
   Two modes:
     - Standard amortizing loan (EMI formula)
     - German Annuitätendarlehen (flat annuity over the Zinsbindung; interest
       shrinks and Tilgung grows each year while the payment stays constant)
   Currency follows the header selector via AIO.formatAmount (values are entered
   in, and shown in, the selected currency: no EUR conversion here).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:loan';
  var INPUT_IDS = [
    'stdAmount', 'stdRate', 'stdTenure',
    'gerAmount', 'gerSollzins', 'gerTilgung', 'gerZinsCustom',
    'xtraStdMonthly', 'xtraGerPct',
    'cmpStdAmount', 'cmpStdRate', 'cmpStdTenure',
    'cmpGerAmount', 'cmpGerSollzins', 'cmpGerTilgung', 'cmpGerZins'
  ];
  var els = {};
  var mode = 'standard';
  var stdUnit = 'years';
  var cmpStdUnit = 'years';
  var gerZins = 10;        // base fixed-rate period (years)
  var gerZinsIsCustom = false;

  // last computed base results, kept so previews/cards recompute against them
  var baseStd = null;      // { P, r, nMonths, emi, totalPaid, totalInterest }
  var baseGer = null;      // { P, s, monthly, restschuld, totalInterest, annualRate, zins, rows }

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function val(id) { return num(els[id].value); }
  function m(n) { return AIO.formatAmount(n); }
  function show(el, on) { if (el) el.hidden = !on; }
  function setPreview(el, text, empty) { el.textContent = text; el.classList.toggle('empty', !!empty); }
  function fmtMonths(mo) {
    mo = Math.round(mo);
    var y = Math.floor(mo / 12), r = mo % 12;
    if (y <= 0) return r + ' month' + (r === 1 ? '' : 's');
    if (r === 0) return y + ' year' + (y === 1 ? '' : 's');
    return y + ' yr ' + r + ' mo';
  }

  /* ---------------- core maths ---------------- */
  // Standard EMI.
  function emiCalc(P, annualPct, n) {
    var r = (annualPct / 12) / 100;
    var emi = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    var totalPaid = emi * n;
    return { emi: emi, r: r, totalPaid: totalPaid, totalInterest: totalPaid - P };
  }

  // Month-by-month amortization, grouped into year rows. payment = monthly outgo.
  // Returns null if the payment never covers the interest (loan never amortizes).
  function amortize(P, monthlyRate, payment) {
    var bal = P, totalInterest = 0, months = 0, MAXM = 1200;
    var rows = [], yPay = 0, yPrin = 0, yInt = 0, yr = 1;
    while (bal > 1e-6 && months < MAXM) {
      var interest = bal * monthlyRate;
      var principal = payment - interest;
      if (principal <= 0) return null;
      if (principal > bal) principal = bal;
      var pay = principal + interest;
      bal -= principal;
      totalInterest += interest;
      months++;
      yPay += pay; yPrin += principal; yInt += interest;
      if (months % 12 === 0 || bal <= 1e-6) {
        rows.push({ year: yr, payment: yPay, principal: yPrin, interest: yInt, balance: Math.max(0, bal) });
        yr++; yPay = 0; yPrin = 0; yInt = 0;
      }
    }
    return { months: months, totalInterest: totalInterest, rows: rows, balance: Math.max(0, bal) };
  }

  // German annuity over the fixed-rate period. sonderPct = annual Sondertilgung as
  // % of the ORIGINAL loan, paid once a year on top of the annuity (0 for the base).
  function germanCalc(P, sollzinsPct, tilgungPct, zinsYears, sonderPct) {
    var s = sollzinsPct / 100;
    var annualRate = P * (sollzinsPct + tilgungPct) / 100; // flat annuity, per year
    var sonder = sonderPct ? P * sonderPct / 100 : 0;
    var bal = P, totalInterest = 0, rows = [];
    for (var y = 1; y <= zinsYears && bal > 1e-6; y++) {
      var interest = bal * s;
      var principal = annualRate - interest; // regular Tilgung this year
      var total = principal + sonder;
      if (total > bal) total = bal;
      var payment = interest + total;
      bal -= total;
      totalInterest += interest;
      rows.push({ year: y, payment: payment, principal: total, interest: interest, balance: Math.max(0, bal) });
    }
    return {
      annualRate: annualRate, monthly: annualRate / 12,
      restschuld: Math.max(0, bal), totalInterest: totalInterest, rows: rows
    };
  }

  /* ---------------- base view ---------------- */
  function computeStandardBase() {
    var P = val('stdAmount'), rate = val('stdRate'), tenure = val('stdTenure');
    var nMonths = Math.round(stdUnit === 'years' ? tenure * 12 : tenure);
    var ok = isFinite(P) && P > 0 && isFinite(rate) && rate >= 0 && isFinite(nMonths) && nMonths > 0;
    if (!ok) {
      baseStd = null;
      els.emi.textContent = '–'; els.stdInterest.textContent = '–'; els.stdTotal.textContent = '–';
      els.stdSplitP.style.width = '0%'; els.stdSplitI.style.width = '0%';
      els.stdPPct.textContent = '–'; els.stdIPct.textContent = '–'; els.stdPAmt.textContent = '–'; els.stdIAmt.textContent = '–';
      els.stdMeta.textContent = 'Enter a loan amount, interest rate and tenure to see your EMI.';
      return;
    }
    var res = emiCalc(P, rate, nMonths);
    baseStd = { P: P, rate: rate, r: res.r, nMonths: nMonths, emi: res.emi, totalPaid: res.totalPaid, totalInterest: res.totalInterest };
    els.emi.textContent = m(res.emi) + ' / mo';
    els.stdInterest.textContent = m(res.totalInterest);
    els.stdTotal.textContent = m(res.totalPaid);
    var pPct = res.totalPaid > 0 ? (P / res.totalPaid) * 100 : 0;
    els.stdSplitP.style.width = pPct + '%'; els.stdSplitI.style.width = (100 - pPct) + '%';
    els.stdPPct.textContent = Math.round(pPct) + '%'; els.stdIPct.textContent = Math.round(100 - pPct) + '%';
    els.stdPAmt.textContent = m(P); els.stdIAmt.textContent = m(res.totalInterest);
    els.stdMeta.textContent = 'Over ' + fmtMonths(nMonths) + ' at ' + rate + '% a year.';
  }

  function computeGermanBase() {
    var P = val('gerAmount'), sollzins = val('gerSollzins'), tilgung = val('gerTilgung');
    var ok = isFinite(P) && P > 0 && isFinite(sollzins) && sollzins >= 0 && isFinite(tilgung) && tilgung > 0 && gerZins > 0;
    if (!ok) {
      baseGer = null;
      els.gerMonthly.textContent = '–'; els.gerRest.textContent = '–'; els.gerInterest.textContent = '–';
      show(els.gerNote, false);
      els.gerPrompt.textContent = 'Enter your Darlehenssumme, Sollzins and Tilgung to see your monthly payment.';
      show(els.gerPrompt, true);
      return;
    }
    var g = germanCalc(P, sollzins, tilgung, gerZins, 0);
    baseGer = { P: P, sollzins: sollzins, tilgung: tilgung, zins: gerZins, monthly: g.monthly, restschuld: g.restschuld, totalInterest: g.totalInterest, annualRate: g.annualRate, rows: g.rows };
    els.gerMonthly.textContent = m(g.monthly) + ' / mo';
    els.gerRest.textContent = m(g.restschuld);
    els.gerInterest.textContent = m(g.totalInterest);
    els.gerNote.textContent = 'After ' + gerZins + ' years, ' + m(g.restschuld) +
      ' remains. You will need Anschlussfinanzierung (follow-up refinancing) at whatever interest rates apply at that time; this is not included in the calculation above.';
    show(els.gerNote, true);
    show(els.gerPrompt, false);
  }

  /* ---------------- card 1: amortization ---------------- */
  function computeAmort() {
    var rows = null;
    if (mode === 'standard') {
      els.amortSub.textContent = 'One row per year, for the full tenure.';
      if (baseStd) { var a = amortize(baseStd.P, baseStd.r, baseStd.emi); rows = a ? a.rows : null; }
    } else {
      els.amortSub.textContent = 'One row per year, through the Zinsbindung period only.';
      if (baseGer) rows = baseGer.rows;
    }
    if (!rows || !rows.length) {
      els.amortBody.innerHTML = '';
      show(els.amortTable, false); show(els.amortEmpty, true);
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<tr><td>' + r.year + '</td><td>' + m(r.payment) + '</td><td>' + m(r.principal) +
        '</td><td>' + m(r.interest) + '</td><td>' + m(r.balance) + '</td></tr>';
    }
    els.amortBody.innerHTML = html;
    show(els.amortTable, true); show(els.amortEmpty, false);
  }

  /* ---------------- card 2: extra payment ---------------- */
  function computeExtra() {
    if (mode === 'standard') {
      if (!baseStd) { show(els.xtraStdResults, false); els.xtraStdPrompt.textContent = 'Fill in the loan above, then enter an extra monthly payment.'; show(els.xtraStdPrompt, true); setPreview(els.extraPreview, 'Tap to calculate', true); return; }
      var extra = val('xtraStdMonthly');
      if (!isFinite(extra) || extra <= 0) { show(els.xtraStdResults, false); show(els.xtraStdPrompt, true); setPreview(els.extraPreview, 'Tap to calculate', true); return; }
      var base = amortize(baseStd.P, baseStd.r, baseStd.emi);
      var withX = amortize(baseStd.P, baseStd.r, baseStd.emi + extra);
      if (!base || !withX) { show(els.xtraStdResults, false); show(els.xtraStdPrompt, true); setPreview(els.extraPreview, 'Tap to calculate', true); return; }
      var saved = base.totalInterest - withX.totalInterest;
      var earlier = base.months - withX.months;
      els.xtraStdTenure.textContent = fmtMonths(withX.months);
      els.xtraStdEarlier.textContent = fmtMonths(earlier);
      els.xtraStdSaved.textContent = m(saved);
      show(els.xtraStdPrompt, false); show(els.xtraStdResults, true);
      setPreview(els.extraPreview, m(extra) + '/mo → save ' + m(saved) + ', finish ' + fmtMonths(earlier) + ' early', false);
    } else {
      if (!baseGer) { show(els.xtraGerResults, false); els.xtraGerPrompt.textContent = 'Fill in the mortgage above, then enter a Sondertilgung rate.'; show(els.xtraGerPrompt, true); setPreview(els.extraPreview, 'Tap to calculate', true); return; }
      var pct = val('xtraGerPct');
      if (!isFinite(pct) || pct <= 0) { show(els.xtraGerResults, false); show(els.xtraGerPrompt, true); setPreview(els.extraPreview, 'Tap to calculate', true); return; }
      var g = germanCalc(baseGer.P, baseGer.sollzins, baseGer.tilgung, baseGer.zins, pct);
      var savedG = baseGer.totalInterest - g.totalInterest;
      els.xtraGerRest.textContent = m(g.restschuld);
      els.xtraGerSaved.textContent = m(savedG);
      show(els.xtraGerPrompt, false); show(els.xtraGerResults, true);
      setPreview(els.extraPreview, pct + '%/yr → Restschuld ' + m(g.restschuld) + ', save ' + m(savedG), false);
    }
  }

  /* ---------------- card 3: compare ---------------- */
  function row3(label, a, b, aBest) {
    return '<tr><td>' + label + '</td><td class="' + (aBest ? 'cmp-best' : '') + '">' + a +
      '</td><td class="' + (aBest ? '' : 'cmp-best') + '">' + b + '</td></tr>';
  }
  function computeCompare() {
    if (mode === 'standard') {
      if (!baseStd) { show(els.compareResults, false); els.comparePrompt.textContent = 'Fill in both loans to compare them.'; show(els.comparePrompt, true); setPreview(els.comparePreview, 'Tap to calculate', true); return; }
      var P = val('cmpStdAmount'), rate = val('cmpStdRate'), t = val('cmpStdTenure');
      var n = Math.round(cmpStdUnit === 'years' ? t * 12 : t);
      if (!(isFinite(P) && P > 0 && isFinite(rate) && rate >= 0 && isFinite(n) && n > 0)) { show(els.compareResults, false); show(els.comparePrompt, true); setPreview(els.comparePreview, 'Tap to calculate', true); return; }
      var B = emiCalc(P, rate, n);
      var aBest = baseStd.totalInterest <= B.totalInterest;
      var diff = Math.abs(baseStd.totalInterest - B.totalInterest);
      els.compareBody.innerHTML =
        row3('Monthly EMI', m(baseStd.emi), m(B.emi), baseStd.emi <= B.emi) +
        row3('Total interest', m(baseStd.totalInterest), m(B.totalInterest), aBest) +
        row3('Total amount paid', m(baseStd.totalPaid), m(B.totalPaid), baseStd.totalPaid <= B.totalPaid);
      els.compareVerdict.textContent = (aBest ? 'Loan A' : 'Loan B') + ' costs ' + m(diff) + ' less in interest.';
      show(els.comparePrompt, false); show(els.compareResults, true);
      setPreview(els.comparePreview, 'A: ' + m(baseStd.totalInterest) + ' vs B: ' + m(B.totalInterest) + ' interest, ' + (aBest ? 'A' : 'B') + ' saves ' + m(diff), false);
    } else {
      if (!baseGer) { show(els.compareResults, false); els.comparePrompt.textContent = 'Fill in both loans to compare them.'; show(els.comparePrompt, true); setPreview(els.comparePreview, 'Tap to calculate', true); return; }
      var bP = val('cmpGerAmount'), bS = val('cmpGerSollzins'), bT = val('cmpGerTilgung'), bZ = Math.round(val('cmpGerZins'));
      if (!(isFinite(bP) && bP > 0 && isFinite(bS) && bS >= 0 && isFinite(bT) && bT > 0 && isFinite(bZ) && bZ > 0)) { show(els.compareResults, false); show(els.comparePrompt, true); setPreview(els.comparePreview, 'Tap to calculate', true); return; }
      var B2 = germanCalc(bP, bS, bT, bZ, 0);
      var aCost = baseGer.totalInterest + baseGer.restschuld;
      var bCost = B2.totalInterest + B2.restschuld;
      var aBest2 = aCost <= bCost;
      var diff2 = Math.abs(aCost - bCost);
      els.compareBody.innerHTML =
        row3('Monthly payment', m(baseGer.monthly), m(B2.monthly), baseGer.monthly <= B2.monthly) +
        row3('Interest (Zinsbindung)', m(baseGer.totalInterest), m(B2.totalInterest), baseGer.totalInterest <= B2.totalInterest) +
        row3('Restschuld', m(baseGer.restschuld), m(B2.restschuld), baseGer.restschuld <= B2.restschuld) +
        row3('Interest + Restschuld', m(aCost), m(bCost), aBest2);
      els.compareVerdict.textContent = (aBest2 ? 'Loan A' : 'Loan B') + ' costs ' + m(diff2) + ' less over the Zinsbindung (interest + Restschuld).';
      show(els.comparePrompt, false); show(els.compareResults, true);
      setPreview(els.comparePreview, 'A: ' + m(aCost) + ' vs B: ' + m(bCost) + ', ' + (aBest2 ? 'A' : 'B') + ' saves ' + m(diff2), false);
    }
  }

  /* ---------------- orchestration ---------------- */
  function recompute() {
    computeStandardBase();
    computeGermanBase();
    computeAmort();
    computeExtra();
    computeCompare();
    persist();
  }

  function setMode(next) {
    mode = next;
    var tabs = document.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-mode') === mode);
    var panels = document.querySelectorAll('[data-mode-panel]');
    for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute('data-mode-panel') !== mode;
    // re-hide computed sub-blocks; recompute will re-show the right ones
    recompute();
  }

  function updateUnitSeg(seg, unit) {
    var btns = seg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-unit') === unit);
  }
  function updateGerZinsSeg() {
    var btns = els.gerZinsSeg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', !gerZinsIsCustom && parseInt(btns[i].getAttribute('data-zins'), 10) === gerZins);
    }
  }

  /* ---------------- persistence ---------------- */
  function persist() {
    var s = { mode: mode, stdUnit: stdUnit, cmpStdUnit: cmpStdUnit, gerZins: gerZins, gerZinsIsCustom: gerZinsIsCustom };
    INPUT_IDS.forEach(function (id) { s[id] = els[id].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    INPUT_IDS.forEach(function (id) { if (s[id] != null && s[id] !== '') els[id].value = s[id]; });
    if (s.mode === 'german') mode = 'german';
    if (s.stdUnit === 'months') stdUnit = 'months';
    if (s.cmpStdUnit === 'months') cmpStdUnit = 'months';
    if (typeof s.gerZins === 'number' && s.gerZins > 0) gerZins = s.gerZins;
    gerZinsIsCustom = !!s.gerZinsIsCustom;
  }

  function init() {
    INPUT_IDS.concat([
      'emi', 'stdInterest', 'stdTotal', 'stdSplitP', 'stdSplitI', 'stdPPct', 'stdIPct', 'stdPAmt', 'stdIAmt', 'stdMeta',
      'gerMonthly', 'gerRest', 'gerInterest', 'gerNote', 'gerPrompt',
      'amortSub', 'amortTable', 'amortBody', 'amortEmpty', 'amortPreview',
      'xtraStdMonthly', 'xtraStdPrompt', 'xtraStdResults', 'xtraStdTenure', 'xtraStdEarlier', 'xtraStdSaved',
      'xtraGerPct', 'xtraGerPrompt', 'xtraGerResults', 'xtraGerRest', 'xtraGerSaved', 'extraPreview',
      'comparePrompt', 'compareResults', 'compareBody', 'compareVerdict', 'comparePreview',
      'stdUnitSeg', 'cmpStdUnitSeg', 'gerZinsSeg', 'gerZinsCustom'
    ]).forEach(function (id) { els[id] = $(id); });

    restore();

    // apply restored mode + toggles to the DOM
    var tabs = document.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-mode') === mode);
    var panels = document.querySelectorAll('[data-mode-panel]');
    for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute('data-mode-panel') !== mode;
    updateUnitSeg(els.stdUnitSeg, stdUnit);
    updateUnitSeg(els.cmpStdUnitSeg, cmpStdUnit);
    if (gerZinsIsCustom) els.gerZinsCustom.value = gerZins;
    updateGerZinsSeg();

    // mode tabs
    for (var t = 0; t < tabs.length; t++) {
      (function (tab) { tab.addEventListener('click', function () { setMode(tab.getAttribute('data-mode')); }); })(tabs[t]);
    }
    // input listeners
    INPUT_IDS.forEach(function (id) { els[id].addEventListener('input', recompute); });
    // std tenure unit
    els.stdUnitSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { stdUnit = b.getAttribute('data-unit'); updateUnitSeg(els.stdUnitSeg, stdUnit); recompute(); });
    });
    els.cmpStdUnitSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { cmpStdUnit = b.getAttribute('data-unit'); updateUnitSeg(els.cmpStdUnitSeg, cmpStdUnit); recompute(); });
    });
    // german Zinsbindung presets + custom
    els.gerZinsSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { gerZins = parseInt(b.getAttribute('data-zins'), 10); gerZinsIsCustom = false; els.gerZinsCustom.value = ''; updateGerZinsSeg(); recompute(); });
    });
    els.gerZinsCustom.addEventListener('input', function () {
      var v = parseInt(els.gerZinsCustom.value, 10);
      if (els.gerZinsCustom.value.trim() !== '' && isFinite(v) && v > 0) { gerZins = v; gerZinsIsCustom = true; }
      else { gerZinsIsCustom = false; gerZins = 10; }
      updateGerZinsSeg(); recompute();
    });

    AIO.onRate(recompute); // re-render money when the currency changes
    recompute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
