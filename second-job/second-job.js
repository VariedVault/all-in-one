/* ---------------------------------------------------------------------------
   Second Job / Nebenjob tax calculator. EUR-locked core via AIO.formatEUR, with
   a secondary converted line from the header currency selector. Reuses the
   shared payroll engine (window.DEPayroll) with Steuerklasse VI for the second job.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.DE_PAYROLL_CONSTANTS;
  var KEY = 'aio:secondjob';
  var INPUTS = ['sjMainGross', 'sjSecondGross'];
  var els = {};
  var userTouched = false;
  var lastCombined = null;

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function eur(n) { return AIO.formatEUR(n); }
  function show(el, on) { if (el) el.hidden = !on; }

  function conv(el, nettoEUR) {
    if (nettoEUR == null || AIO.getCurrency() === 'EUR') { el.textContent = ''; return; }
    var rate = AIO.getRate();
    el.textContent = rate == null ? '≈ … (loading rate)' : '≈ ' + AIO.formatAmount(nettoEUR * rate) + ' / month';
  }

  function compute() {
    var mainClass = els.sjMainClass.value;
    var mainGross = num(els.sjMainGross.value);
    var secondGross = num(els.sjSecondGross.value);
    if (!(isFinite(mainGross) && mainGross > 0 && isFinite(secondGross) && secondGross > 0)) {
      lastCombined = null;
      show(els.sjResults, false);
      return persist(null);
    }

    var mainNet = DEPayroll.compute(mainGross, { steuerklasse: mainClass }).netto;
    var result;

    if (secondGross <= C.MINIJOB_THRESHOLD_MONTH) {
      // Tax-free Minijob: the employee keeps the full amount.
      var combinedMini = mainNet + secondGross;
      els.sjCombined.textContent = eur(combinedMini);
      lastCombined = combinedMini;
      conv(els.sjCombinedConv, combinedMini);
      els.sjMinijobNote.textContent = 'Your second job is €' + Math.round(secondGross) +
        '/month, within the €' + C.MINIJOB_THRESHOLD_MONTH + ' Minijob threshold, so it is tax- and contribution-free for you (the employer pays flat-rate contributions separately). You keep the full amount.';
      show(els.sjMinijobNote, true);
      show(els.sjSecondBlock, false);
      show(els.sjResults, true);
      result = { combinedNet: combinedMini, refund: null };
      return persist(result);
    }

    // Regular Zweitjob: withheld under Steuerklasse VI (no allowances).
    var secondNet = DEPayroll.compute(secondGross, { steuerklasse: 'VI' }).netto;
    var combined = mainNet + secondNet;

    var mainLohnAnnual = DEPayroll.annualLohnsteuer(mainGross * 12, mainClass);
    var secondLohnAnnual = DEPayroll.annualLohnsteuer(secondGross * 12, 'VI');
    var withheld = mainLohnAnnual + secondLohnAnnual;
    var owed = window.estimateIncomeTax((mainGross + secondGross) * 12, DEPayroll.gfForClass(mainClass));
    var refund = withheld - owed;

    els.sjCombined.textContent = eur(combined);
    lastCombined = combined;
    conv(els.sjCombinedConv, combined);
    els.sjSecondGrossOut.textContent = eur(secondGross);
    els.sjSecondNet.textContent = eur(secondNet);
    els.sjWithholding.textContent = eur(withheld);
    els.sjOwed.textContent = eur(owed);
    if (refund >= 0) {
      els.sjRefundLabel.textContent = 'Estimated refund at tax filing';
      els.sjRefund.textContent = eur(refund);
    } else {
      els.sjRefundLabel.textContent = 'Estimated additional tax due at filing';
      els.sjRefund.textContent = eur(-refund);
    }
    show(els.sjMinijobNote, false);
    show(els.sjSecondBlock, true);
    show(els.sjResults, true);
    result = { combinedNet: combined, refund: refund > 0 ? refund : 0 };
    return persist(result);
  }

  function renderConvOnly() { conv(els.sjCombinedConv, lastCombined); }

  function persist(result) {
    var s = { touched: userTouched, sjMainClass: els.sjMainClass.value, result: result || null };
    INPUTS.forEach(function (id) { s[id] = els[id].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    if (s.touched) userTouched = true;
    if (s.sjMainClass != null) els.sjMainClass.value = s.sjMainClass;
    INPUTS.forEach(function (id) { if (s[id] != null && s[id] !== '') els[id].value = s[id]; });
  }

  function init() {
    ['sjMainClass'].concat(INPUTS, [
      'sjPrompt', 'sjResults', 'sjCombined', 'sjCombinedConv', 'sjMinijobNote', 'sjSecondBlock',
      'sjSecondGrossOut', 'sjSecondNet', 'sjWithholding', 'sjOwed', 'sjRefundLabel', 'sjRefund'
    ]).forEach(function (id) { els[id] = $(id); });

    restore();
    els.sjMainClass.addEventListener('change', function () { userTouched = true; compute(); });
    INPUTS.forEach(function (id) { els[id].addEventListener('input', function () { userTouched = true; compute(); }); });
    AIO.onRate(renderConvOnly);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
