/* ---------------------------------------------------------------------------
   Emergency Fund Calculator: live target + gap.
   Uses the shared window.AIO helpers (formatting, rate, localStorage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:emergency';
  var PRESETS = [3, 6, 12];
  var els = {};
  var months = 6;          // default coverage
  var isCustom = false;
  var lastTargetEUR = null;
  var lastGapEUR = null;
  var reached = false;
  var userTouched = false;  // set once the user changes any field; gates the homepage dashboard

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }

  function updateActive() {
    var btns = els.seg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      var m = parseInt(btns[i].getAttribute('data-months'), 10);
      btns[i].classList.toggle('active', !isCustom && m === months);
    }
  }

  function selectPreset(m) {
    userTouched = true;
    months = m;
    isCustom = false;
    els.custom.value = '';
    updateActive();
    compute();
  }

  function onCustom() {
    userTouched = true;
    var m = parseInt(els.custom.value, 10);
    if (els.custom.value.trim() !== '' && isFinite(m) && m > 0) {
      months = m;
      isCustom = true;
    } else if (els.custom.value.trim() === '') {
      // cleared custom → fall back to the default preset
      isCustom = false;
      months = 6;
    }
    updateActive();
    compute();
  }

  function compute() {
    var expenses = num(els.expenses.value);
    var current = els.current.value.trim() === '' ? 0 : num(els.current.value);
    if (!isFinite(current) || current < 0) current = 0;

    if (!isFinite(expenses) || expenses < 0 || !isFinite(months) || months <= 0) {
      render(null);
      persist(null);
      return;
    }

    var target = expenses * months;
    var gap = target - current;
    reached = current >= target;
    lastTargetEUR = target;
    lastGapEUR = reached ? 0 : gap;
    render({ target: target, gap: gap, current: current });
    persist({ target: target, current: current, gap: gap, months: months, reached: reached });
  }

  function render(r) {
    if (!r) {
      lastTargetEUR = null; lastGapEUR = null; reached = false;
      els.target.textContent = '–';
      els.targetInr.textContent = '';
      els.gap.textContent = '–';
      els.gap.className = 'result-mid';
      els.gapInr.textContent = '';
      els.gapLabel.textContent = 'Still to save';
      els.meta.textContent = 'Enter your monthly expenses to see your target.';
      return;
    }
    els.target.textContent = AIO.formatEUR(r.target);

    if (reached) {
      els.gapLabel.textContent = 'Status';
      els.gap.className = 'result-good';
      els.gap.textContent = "✓ You've reached your goal";
      els.gapInr.textContent = '';
    } else {
      els.gapLabel.textContent = 'Still to save';
      els.gap.className = 'result-mid';
      els.gap.textContent = AIO.formatEUR(r.gap);
    }

    els.meta.textContent = months + ' months of cover' +
      (reached ? '. You have ' + AIO.formatEUR(r.current) + ' saved.' : '.');

    renderINR();
  }

  function renderINR() {
    var rate = AIO.getRate();
    if (lastTargetEUR == null) { els.targetInr.textContent = ''; els.gapInr.textContent = ''; return; }
    if (rate == null) {
      els.targetInr.textContent = '≈ … (loading rate)';
      els.gapInr.textContent = reached ? '' : '≈ … (loading rate)';
      return;
    }
    els.targetInr.textContent = '≈ ' + AIO.formatAmount(lastTargetEUR * rate);
    els.gapInr.textContent = reached ? '' : '≈ ' + AIO.formatAmount(lastGapEUR * rate);
  }

  // Save inputs (so the form restores) plus the computed result (so the homepage
  // dashboard can read it). result is null when inputs are incomplete.
  function persist(result) {
    AIO.save(KEY, {
      expenses: els.expenses.value,
      current: els.current.value,
      months: months,
      isCustom: isCustom,
      result: result,
      touched: userTouched
    });
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) { updateActive(); return; }
    if (s.touched) userTouched = true;
    if (s.expenses != null) els.expenses.value = s.expenses;
    if (s.current != null) els.current.value = s.current;
    if (typeof s.months === 'number' && s.months > 0) {
      months = s.months;
      isCustom = !!s.isCustom || PRESETS.indexOf(s.months) === -1;
      if (isCustom) els.custom.value = s.months;
    }
    updateActive();
  }

  function init() {
    ['expenses', 'current', 'target', 'targetInr', 'gap', 'gapInr', 'gapLabel', 'meta'].forEach(function (id) { els[id] = $(id); });
    els.seg = $('monthsSeg');
    els.custom = $('customMonths');

    restore();

    els.expenses.addEventListener('input', function () { userTouched = true; compute(); });
    els.current.addEventListener('input', function () { userTouched = true; compute(); });
    els.custom.addEventListener('input', onCustom);
    var btns = els.seg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selectPreset(parseInt(btn.getAttribute('data-months'), 10));
        });
      })(btns[i]);
    }

    AIO.onRate(renderINR);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
