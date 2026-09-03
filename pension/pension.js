/* ---------------------------------------------------------------------------
   German Pension Calculator: live estimate.
   Simplified model (see the on-page disclaimer). Uses window.PENSION_CONSTANTS,
   window.estimateIncomeTax, and the shared window.AIO helpers.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.PENSION_CONSTANTS;
  var KEY = 'aio:pension';
  var FIELDS = ['birthYear', 'retireAge', 'salary', 'careerStart', 'growth', 'override'];
  var els = {};
  var lastNetEUR = null; // net monthly pension, used for the INR conversion

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
    if (!valid) { render(null); persist(null); return; }

    var retirementYear = v.birthYear + v.retireAge;
    if (retirementYear <= v.careerStart) { render(null); persist(null); return; }

    var totalEP;
    var usedOverride = (v.override != null && isFinite(v.override) && v.override >= 0);
    if (usedOverride) {
      var futureFrom = Math.max(currentYear, v.careerStart);
      var future = futureFrom < retirementYear ? pointsForRange(futureFrom, retirementYear, v.salary, g, currentYear) : 0;
      totalEP = v.override + future;
    } else {
      totalEP = pointsForRange(v.careerStart, retirementYear, v.salary, g, currentYear);
    }

    // Gross -> net-of-insurance -> net monthly.
    var grossMonthly = totalEP * C.AKTUELLER_RENTENWERT;
    var netOfInsuranceMonthly = grossMonthly * (1 - C.KRANKEN_PFLEGE_RATE);
    var annualTax = window.estimateIncomeTax(netOfInsuranceMonthly * 12);
    var monthlyTax = annualTax / 12;
    var netMonthly = netOfInsuranceMonthly - monthlyTax;

    var monthlyGrossSalary = v.salary / 12;
    var coveragePct = monthlyGrossSalary > 0 ? (netMonthly / monthlyGrossSalary) * 100 : null;

    lastNetEUR = netMonthly;

    var r = {
      totalEP: totalEP,
      grossMonthly: grossMonthly,
      netOfInsuranceMonthly: netOfInsuranceMonthly,
      netMonthly: netMonthly,
      retirementYear: retirementYear,
      usedOverride: usedOverride,
      monthlyGrossSalary: monthlyGrossSalary,
      coveragePct: coveragePct
    };
    render(r);
    persist(r);
  }

  function render(r) {
    if (!r) {
      lastNetEUR = null;
      els.points.textContent = '–';
      els.gross.textContent = '–';
      els.netins.textContent = '–';
      els.net.textContent = '–';
      els.inr.textContent = '';
      els.meta.textContent = 'Fill in your birth year, retirement age, salary and career start to see an estimate.';
      return;
    }
    els.points.textContent = r.totalEP.toFixed(2);
    els.gross.textContent = AIO.formatEUR(r.grossMonthly);
    els.netins.textContent = AIO.formatEUR(r.netOfInsuranceMonthly);
    els.net.textContent = AIO.formatEUR(r.netMonthly);
    renderINR();
    els.meta.textContent = 'Assumes retirement in ' + r.retirementYear +
      (r.usedOverride ? ', using your stated Entgeltpunkte plus estimated future years.' : '.');
  }

  function renderINR() {
    if (lastNetEUR == null) { els.inr.textContent = ''; return; }
    var rate = AIO.getRate();
    if (rate == null) { els.inr.textContent = '≈ ₹… (loading rate)'; return; }
    els.inr.textContent = '≈ ' + AIO.formatINR(lastNetEUR * rate) + ' / month';
  }

  // Save inputs (so the form restores) plus the computed result (so the homepage
  // dashboard can read it). result is null when inputs are incomplete.
  function persist(result) {
    var s = {};
    FIELDS.forEach(function (k) { s[k] = els[k].value; });
    s.result = result ? {
      grossMonthly: result.grossMonthly,
      netOfInsuranceMonthly: result.netOfInsuranceMonthly,
      netMonthly: result.netMonthly,
      monthlyGrossSalary: result.monthlyGrossSalary,
      coveragePct: result.coveragePct,
      totalEP: result.totalEP
    } : null;
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    FIELDS.forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
  }

  function init() {
    FIELDS.concat(['points', 'gross', 'netins', 'net', 'inr', 'meta']).forEach(function (id) { els[id] = $(id); });
    var rw = $('rw'); if (rw) rw.textContent = C.AKTUELLER_RENTENWERT.toFixed(2);
    restore();
    FIELDS.forEach(function (k) { els[k].addEventListener('input', compute); });
    AIO.onRate(renderINR);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
