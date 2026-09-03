/* ---------------------------------------------------------------------------
   German Pension Calculator — live estimate.
   Simplified model (see the on-page disclaimer). Uses window.PENSION_CONSTANTS
   and the shared window.AIO helpers (formatting, rate, localStorage).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.PENSION_CONSTANTS;
  var KEY = 'aio:pension';
  var FIELDS = ['birthYear', 'retireAge', 'salary', 'careerStart', 'growth', 'override'];
  var els = {};
  var lastMonthlyEUR = null;

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }

  function readInputs() {
    return {
      birthYear: num(els.birthYear.value),
      retireAge: num(els.retireAge.value),
      salary: num(els.salary.value),
      careerStart: num(els.careerStart.value),
      growth: els.growth.value.trim() === '' ? 0 : num(els.growth.value),
      override: els.override.value.trim() === '' ? null : num(els.override.value)
    };
  }

  // Salary in a given year, projecting the current salary forward/backward by the growth rate.
  function salaryAt(year, current, g, currentYear) {
    return current * Math.pow(1 + g / 100, year - currentYear);
  }

  // Entgeltpunkte accumulated over [fromYear, toYearExcl): each year contributes
  // min(that year's gross, BBG) / average wage.
  function pointsForRange(fromYear, toYearExcl, current, g, currentYear) {
    var sum = 0;
    for (var y = fromYear; y < toYearExcl; y++) {
      var s = salaryAt(y, current, g, currentYear);
      if (s < 0) s = 0;
      sum += Math.min(s, C.BEITRAGSBEMESSUNGSGRENZE_2026) / C.DURCHSCHNITTSENTGELT_2026;
    }
    return sum;
  }

  function compute() {
    var v = readInputs();
    var currentYear = new Date().getFullYear();
    var g = isFinite(v.growth) ? v.growth : 0;

    var valid = isFinite(v.birthYear) && isFinite(v.retireAge) &&
                isFinite(v.salary) && v.salary > 0 && isFinite(v.careerStart);
    if (!valid) { render(null); persist(); return; }

    var retirementYear = v.birthYear + v.retireAge;
    if (retirementYear <= v.careerStart) { render(null); persist(); return; }

    var totalEP;
    var usedOverride = (v.override != null && isFinite(v.override) && v.override >= 0);
    if (usedOverride) {
      var futureFrom = Math.max(currentYear, v.careerStart);
      var future = futureFrom < retirementYear ? pointsForRange(futureFrom, retirementYear, v.salary, g, currentYear) : 0;
      totalEP = v.override + future;
    } else {
      totalEP = pointsForRange(v.careerStart, retirementYear, v.salary, g, currentYear);
    }

    var monthly = totalEP * C.AKTUELLER_RENTENWERT;
    lastMonthlyEUR = monthly;
    render({ totalEP: totalEP, monthly: monthly, retirementYear: retirementYear, usedOverride: usedOverride });
    persist();
  }

  function render(r) {
    if (!r) {
      lastMonthlyEUR = null;
      els.points.textContent = '—';
      els.monthly.textContent = '—';
      els.inr.textContent = '';
      els.meta.textContent = 'Fill in your birth year, retirement age, salary and career start to see an estimate.';
      return;
    }
    els.points.textContent = r.totalEP.toFixed(2);
    els.monthly.textContent = AIO.formatEUR(r.monthly);
    renderINR();
    els.meta.textContent = 'Assumes retirement in ' + r.retirementYear +
      (r.usedOverride ? ' · using your stated Entgeltpunkte plus estimated future years.' : '.');
  }

  function renderINR() {
    if (lastMonthlyEUR == null) { els.inr.textContent = ''; return; }
    var rate = AIO.getRate();
    if (rate == null) { els.inr.textContent = '≈ ₹… (loading rate)'; return; }
    els.inr.textContent = '≈ ' + AIO.formatINR(lastMonthlyEUR * rate) + ' / month';
  }

  function persist() {
    var s = {};
    FIELDS.forEach(function (k) { s[k] = els[k].value; });
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    FIELDS.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
  }

  function init() {
    FIELDS.concat(['points', 'monthly', 'inr', 'meta']).forEach(function (id) { els[id] = $(id); });
    var rw = $('rw'); if (rw) rw.textContent = C.AKTUELLER_RENTENWERT.toFixed(2);
    restore();
    FIELDS.forEach(function (k) { els[k].addEventListener('input', compute); });
    AIO.onRate(renderINR);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
