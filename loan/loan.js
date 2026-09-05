/* ---------------------------------------------------------------------------
   Loan & EMI Calculator (standard amortizing loan).
   Currency follows the header selector via AIO.formatAmount (values are entered
   in, and shown in, the selected currency: no EUR conversion here).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:loan';
  var INPUT_IDS = ['stdAmount', 'stdRate', 'stdTenure', 'xtraStdMonthly', 'cmpStdAmount', 'cmpStdRate', 'cmpStdTenure'];
  var els = {};
  var stdUnit = 'years';
  var cmpStdUnit = 'years';

  var baseStd = null; // { P, rate, r, nMonths, emi, totalPaid, totalInterest }

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
  function emiCalc(P, annualPct, n) {
    var r = (annualPct / 12) / 100;
    var emi = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    var totalPaid = emi * n;
    return { emi: emi, r: r, totalPaid: totalPaid, totalInterest: totalPaid - P };
  }

  // Month-by-month amortization grouped into year rows. Returns null if the
  // payment never covers the interest (loan never amortizes).
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

  /* ---------------- base view ---------------- */
  function computeBase() {
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

  /* ---------------- card 1: amortization ---------------- */
  function computeAmort() {
    var rows = null;
    if (baseStd) { var a = amortize(baseStd.P, baseStd.r, baseStd.emi); rows = a ? a.rows : null; }
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
    if (!baseStd) {
      show(els.xtraStdResults, false); show(els.xtraStdPrompt, true);
      setPreview(els.extraPreview, 'Tap to calculate', true);
      return;
    }
    var extra = val('xtraStdMonthly');
    if (!isFinite(extra) || extra <= 0) {
      show(els.xtraStdResults, false); show(els.xtraStdPrompt, true);
      setPreview(els.extraPreview, 'Tap to calculate', true);
      return;
    }
    var base = amortize(baseStd.P, baseStd.r, baseStd.emi);
    var withX = amortize(baseStd.P, baseStd.r, baseStd.emi + extra);
    if (!base || !withX) {
      show(els.xtraStdResults, false); show(els.xtraStdPrompt, true);
      setPreview(els.extraPreview, 'Tap to calculate', true);
      return;
    }
    var saved = base.totalInterest - withX.totalInterest;
    var earlier = base.months - withX.months;
    els.xtraStdTenure.textContent = fmtMonths(withX.months);
    els.xtraStdEarlier.textContent = fmtMonths(earlier);
    els.xtraStdSaved.textContent = m(saved);
    show(els.xtraStdPrompt, false); show(els.xtraStdResults, true);
    setPreview(els.extraPreview, m(extra) + '/mo → save ' + m(saved) + ', finish ' + fmtMonths(earlier) + ' early', false);
  }

  /* ---------------- card 3: compare ---------------- */
  function row3(label, a, b, aBest) {
    return '<tr><td>' + label + '</td><td class="' + (aBest ? 'cmp-best' : '') + '">' + a +
      '</td><td class="' + (aBest ? '' : 'cmp-best') + '">' + b + '</td></tr>';
  }
  function computeCompare() {
    if (!baseStd) {
      show(els.compareResults, false); els.comparePrompt.textContent = 'Fill in both loans to compare them.'; show(els.comparePrompt, true);
      setPreview(els.comparePreview, 'Tap to calculate', true);
      return;
    }
    var P = val('cmpStdAmount'), rate = val('cmpStdRate'), t = val('cmpStdTenure');
    var n = Math.round(cmpStdUnit === 'years' ? t * 12 : t);
    if (!(isFinite(P) && P > 0 && isFinite(rate) && rate >= 0 && isFinite(n) && n > 0)) {
      show(els.compareResults, false); show(els.comparePrompt, true);
      setPreview(els.comparePreview, 'Tap to calculate', true);
      return;
    }
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
  }

  /* ---------------- orchestration ---------------- */
  function recompute() {
    computeBase();
    computeAmort();
    computeExtra();
    computeCompare();
    persist();
  }

  function updateUnitSeg(seg, unit) {
    var btns = seg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-unit') === unit);
  }

  /* ---------------- persistence ---------------- */
  function persist() {
    var s = { stdUnit: stdUnit, cmpStdUnit: cmpStdUnit };
    INPUT_IDS.forEach(function (id) { s[id] = els[id].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    INPUT_IDS.forEach(function (id) { if (s[id] != null && s[id] !== '') els[id].value = s[id]; });
    if (s.stdUnit === 'months') stdUnit = 'months';
    if (s.cmpStdUnit === 'months') cmpStdUnit = 'months';
  }

  function init() {
    INPUT_IDS.concat([
      'emi', 'stdInterest', 'stdTotal', 'stdSplitP', 'stdSplitI', 'stdPPct', 'stdIPct', 'stdPAmt', 'stdIAmt', 'stdMeta',
      'amortTable', 'amortBody', 'amortEmpty', 'amortPreview',
      'xtraStdPrompt', 'xtraStdResults', 'xtraStdTenure', 'xtraStdEarlier', 'xtraStdSaved', 'extraPreview',
      'comparePrompt', 'compareResults', 'compareBody', 'compareVerdict', 'comparePreview',
      'stdUnitSeg', 'cmpStdUnitSeg'
    ]).forEach(function (id) { els[id] = $(id); });

    restore();
    updateUnitSeg(els.stdUnitSeg, stdUnit);
    updateUnitSeg(els.cmpStdUnitSeg, cmpStdUnit);

    INPUT_IDS.forEach(function (id) { els[id].addEventListener('input', recompute); });
    els.stdUnitSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { stdUnit = b.getAttribute('data-unit'); updateUnitSeg(els.stdUnitSeg, stdUnit); recompute(); });
    });
    els.cmpStdUnitSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { cmpStdUnit = b.getAttribute('data-unit'); updateUnitSeg(els.cmpStdUnitSeg, cmpStdUnit); recompute(); });
    });

    AIO.onRate(recompute); // re-render money when the currency changes
    recompute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
