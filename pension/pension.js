/* ---------------------------------------------------------------------------
   German Pension Calculator: live estimate + two scenarios.
   Simplified model (see the on-page disclaimer). Uses window.PENSION_CONSTANTS,
   window.estimateIncomeTax, and the shared window.AIO helpers.

   Sections:
     - main estimate (gross -> net-of-insurance -> net)
     - "What if I leave Germany?"  (frozen points + vesting + real INR value)
     - "Add a private pension"     (annuity FV + 4% rule + combined payout)
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.PENSION_CONSTANTS;
  var KEY = 'aio:pension';
  var MAIN_FIELDS = ['birthYear', 'retireAge', 'salary', 'careerStart', 'growth', 'override'];
  var EXTRA_FIELDS = ['leaveYear', 'indiaInflation', 'privateMonthly', 'privateReturn'];
  var els = {};

  // shared state so the scenarios and the async rate callback can re-render.
  var main = null;          // valid main result + the inputs the scenarios need, or null
  var leaveState = null;    // { grossMonthly, infl, yearsUntilRet } for INR re-render, or null
  var privateState = null;  // { combinedEUR } for INR re-render, or null
  var userTouched = false;  // set once the user changes any field; gates the homepage dashboard

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function show(el, on) { el.hidden = !on; }
  function setPreview(el, text, empty) { el.textContent = text; el.classList.toggle('empty', !!empty); }

  /* ---------------- shared model ---------------- */
  function salaryAt(year, current, g, currentYear) {
    return current * Math.pow(1 + g / 100, year - currentYear);
  }
  // Entgeltpunkte over [fromYear, toYearExcl): each year adds min(gross, BBG) / average wage.
  function pointsForRange(fromYear, toYearExcl, current, g, currentYear) {
    var sum = 0;
    for (var y = fromYear; y < toYearExcl; y++) {
      var s = salaryAt(y, current, g, currentYear);
      if (s < 0) s = 0;
      sum += Math.min(s, C.BEITRAGSBEMESSUNGSGRENZE_2026) / C.DURCHSCHNITTSENTGELT_2026;
    }
    return sum;
  }

  /* ---------------- main estimate ---------------- */
  function computeMain() {
    var v = {
      birthYear: num(els.birthYear.value),
      retireAge: num(els.retireAge.value),
      salary: num(els.salary.value),
      careerStart: num(els.careerStart.value),
      growth: els.growth.value.trim() === '' ? 0 : num(els.growth.value),
      override: els.override.value.trim() === '' ? null : num(els.override.value)
    };
    var currentYear = new Date().getFullYear();
    var g = isFinite(v.growth) ? v.growth : 0;

    var valid = isFinite(v.birthYear) && isFinite(v.retireAge) &&
                isFinite(v.salary) && v.salary > 0 && isFinite(v.careerStart);
    var retirementYear = v.birthYear + v.retireAge;
    if (!valid || retirementYear <= v.careerStart) { main = null; renderMain(null); return; }

    var totalEP;
    var usedOverride = (v.override != null && isFinite(v.override) && v.override >= 0);
    if (usedOverride) {
      var futureFrom = Math.max(currentYear, v.careerStart);
      var future = futureFrom < retirementYear ? pointsForRange(futureFrom, retirementYear, v.salary, g, currentYear) : 0;
      totalEP = v.override + future;
    } else {
      totalEP = pointsForRange(v.careerStart, retirementYear, v.salary, g, currentYear);
    }

    var grossMonthly = totalEP * C.AKTUELLER_RENTENWERT;
    var netOfInsuranceMonthly = grossMonthly * (1 - C.KRANKEN_PFLEGE_RATE);
    var annualTax = window.estimateIncomeTax(netOfInsuranceMonthly * 12);
    var netMonthly = netOfInsuranceMonthly - annualTax / 12;
    var monthlyGrossSalary = v.salary / 12;
    var coveragePct = monthlyGrossSalary > 0 ? (netMonthly / monthlyGrossSalary) * 100 : null;

    main = {
      totalEP: totalEP, grossMonthly: grossMonthly, netOfInsuranceMonthly: netOfInsuranceMonthly,
      netMonthly: netMonthly, retirementYear: retirementYear, usedOverride: usedOverride,
      monthlyGrossSalary: monthlyGrossSalary, coveragePct: coveragePct,
      // inputs the scenarios reuse:
      careerStart: v.careerStart, salary: v.salary, growth: g, override: usedOverride ? v.override : null,
      currentYear: currentYear
    };
    renderMain(main);
  }

  function renderMain(r) {
    if (!r) {
      els.points.textContent = '–';
      els.gross.textContent = '–';
      els.netins.textContent = '–';
      els.net.textContent = '–';
      els.meta.textContent = 'Fill in your birth year, retirement age, salary and career start to see an estimate.';
      return;
    }
    els.points.textContent = r.totalEP.toFixed(2);
    els.gross.textContent = AIO.formatEUR(r.grossMonthly);
    els.netins.textContent = AIO.formatEUR(r.netOfInsuranceMonthly);
    els.net.textContent = AIO.formatEUR(r.netMonthly);
    // Core state pension (gross/net/breakdown) always stays in EUR: no conversion.
    els.meta.textContent = 'Assumes retirement in ' + r.retirementYear +
      (r.usedOverride ? ', using your stated Entgeltpunkte plus estimated future years.' : '.');
  }

  /* ---------------- scenario: leaving Germany ---------------- */
  var LEAVE_PROMPT_DEFAULT = 'Fill in the main calculator above, then enter the year you plan to leave.';

  function showLeavePrompt(msg) {
    els.leavePrompt.textContent = msg;
    show(els.leavePrompt, true);
    show(els.leaveVested, false);
    show(els.leaveUnvested, false);
    setPreview(els.leavePreview, 'Tap to calculate', true);
  }

  function computeLeaving() {
    leaveState = null;
    if (!main) { showLeavePrompt(LEAVE_PROMPT_DEFAULT); return; }

    var leaveYear = num(els.leaveYear.value);
    if (!isFinite(leaveYear)) { showLeavePrompt(LEAVE_PROMPT_DEFAULT); return; }

    if (leaveYear < main.careerStart) {
      showLeavePrompt('Your leave year must be on or after your career start (' + main.careerStart + ').');
      return;
    }

    var infl = els.indiaInflation.value.trim() === '' ? 7 : num(els.indiaInflation.value);
    if (!isFinite(infl) || infl < 0) infl = 0;

    show(els.leavePrompt, false);

    var endYear = Math.min(leaveYear, main.retirementYear);
    var yearsContrib = endYear - main.careerStart;

    if (yearsContrib < 5) {
      els.leaveYearsNote.textContent = '(' + Math.max(0, Math.floor(yearsContrib)) + ' of 5 years)';
      show(els.leaveUnvested, true); show(els.leaveVested, false);
      setPreview(els.leavePreview, 'Not vested', true);
      return;
    }

    // Vested: freeze points at the leave year.
    var frozenEP;
    if (main.override != null) {
      var from = Math.max(main.currentYear, main.careerStart);
      var fut = from < endYear ? pointsForRange(from, endYear, main.salary, main.growth, main.currentYear) : 0;
      frozenEP = main.override + fut;
    } else {
      frozenEP = pointsForRange(main.careerStart, endYear, main.salary, main.growth, main.currentYear);
    }
    var grossMonthly = frozenEP * C.AKTUELLER_RENTENWERT;
    var yearsUntilRet = Math.max(0, main.retirementYear - main.currentYear);

    leaveState = { grossMonthly: grossMonthly, infl: infl, yearsUntilRet: yearsUntilRet, year: leaveYear };

    els.leaveEP.textContent = frozenEP.toFixed(2);
    els.leaveGross.textContent = AIO.formatEUR(grossMonthly) + ' / mo';
    renderLeaveINR();

    show(els.leaveUnvested, false); show(els.leaveVested, true);
    setPreview(els.leavePreview, AIO.formatEUR(grossMonthly) + '/mo', false);
  }

  function renderLeaveINR() {
    if (!leaveState) { els.leaveNominalInr.textContent = ''; els.leaveRealInr.textContent = ''; return; }
    var rate = AIO.getRate();
    if (rate == null) {
      els.leaveNominalInr.textContent = 'Nominal value at retirement: ≈ … (loading rate)';
      els.leaveRealInr.textContent = '';
      return;
    }
    var nominal = leaveState.grossMonthly * rate;
    var real = nominal / Math.pow(1 + leaveState.infl / 100, leaveState.yearsUntilRet);
    els.leaveNominalInr.textContent = 'Nominal value at retirement: ≈ ' + AIO.formatAmount(nominal) + ' / mo';
    els.leaveRealInr.textContent = 'Real value in today\'s purchasing power: ≈ ' + AIO.formatAmount(real) +
      ' / mo (after ' + leaveState.yearsUntilRet + ' years at ' + leaveState.infl + '% inflation)';
  }

  /* ---------------- scenario: private pension top-up ---------------- */
  function computePrivate() {
    privateState = null;
    if (!main) {
      els.privateYears.textContent = '–';
      show(els.privatePrompt, true); show(els.privateResults, false);
      setPreview(els.privatePreview, 'Tap to calculate', true);
      return;
    }
    var yrs = Math.max(0, main.retirementYear - main.currentYear);
    els.privateYears.textContent = yrs + (yrs === 1 ? ' year' : ' years');

    var monthly = num(els.privateMonthly.value);
    if (!isFinite(monthly) || monthly <= 0) {
      show(els.privatePrompt, true); show(els.privateResults, false);
      setPreview(els.privatePreview, 'Tap to calculate', true);
      return;
    }

    var ret = els.privateReturn.value.trim() === '' ? 6 : num(els.privateReturn.value);
    if (!isFinite(ret) || ret < 0) ret = 0;

    var n = yrs * 12;
    var i = ret / 100 / 12;
    // Full-career: contribute monthly all the way to retirement (unchanged).
    var fv = i > 0 ? monthly * ((Math.pow(1 + i, n) - 1) / i) : monthly * n;
    var payout = fv * 0.04 / 12;
    var stateNet = main.netMonthly;
    var fullCombined = stateNet + payout;

    // Leave-Germany scenario: private contributions realistically stop at the leave
    // year (Riester/Rürup need German tax residency; ETF-Sparpläne get disrupted by
    // relocation). Two-phase: contribute until leave, then let the balance keep
    // compounding with NO further contributions until retirement.
    var leaveCombined = null;
    var leaveLump = null;
    if (leaveState) {
      var effLeave = Math.min(leaveState.year, main.retirementYear);
      var n1 = Math.max(0, effLeave - main.currentYear) * 12;    // contributing months
      var n2 = Math.max(0, main.retirementYear - effLeave) * 12; // growth-only months
      var phase1 = i > 0 ? monthly * ((Math.pow(1 + i, n1) - 1) / i) : monthly * n1;
      leaveLump = phase1 * Math.pow(1 + i, n2);
      var leavePayout = leaveLump * 0.04 / 12;
      leaveCombined = leaveState.grossMonthly + leavePayout;
    }

    privateState = { fullCombinedEUR: fullCombined, leaveCombinedEUR: leaveCombined, payout: payout, leaveLump: leaveLump };

    els.privateLump.textContent = AIO.formatEUR(fv);
    els.privatePayout.textContent = AIO.formatEUR(payout) + ' / mo';
    els.privateCombinedFull.textContent = AIO.formatEUR(fullCombined) + ' / mo';

    if (leaveCombined != null) {
      els.privateCombinedLeaveLabel.innerHTML = 'If you leave in ' + leaveState.year +
        ' + private pension <span class="combo-sub">frozen gross state pension; private contributions stop at ' + leaveState.year + ', balance keeps growing</span>';
      els.privateCombinedLeave.textContent = AIO.formatEUR(leaveCombined) + ' / mo';
      show(els.privateCombinedLeaveWrap, true);
    } else {
      show(els.privateCombinedLeaveWrap, false);
    }

    els.privateCompare.textContent = 'State pension alone (net, full career): ' + AIO.formatEUR(stateNet) +
      ' / mo → with private top-up: ' + AIO.formatEUR(fullCombined) + ' / mo';

    show(els.privatePrompt, false); show(els.privateResults, true);
    setPreview(els.privatePreview, '+' + AIO.formatEUR(payout) + '/mo → ' + AIO.formatEUR(fullCombined) + '/mo combined', false);
  }

  /* ---------------- orchestration ---------------- */
  function recompute() {
    computeMain();
    computeLeaving();
    computePrivate();
    persist();
  }
  // Only the leave-Germany section converts to the selected currency; the core
  // state pension and the private-pension figures always stay in EUR.
  function renderAllINR() { renderLeaveINR(); }

  function persist() {
    var s = {};
    MAIN_FIELDS.concat(EXTRA_FIELDS).forEach(function (k) { s[k] = els[k].value; });
    s.result = main ? {
      grossMonthly: main.grossMonthly, netOfInsuranceMonthly: main.netOfInsuranceMonthly,
      netMonthly: main.netMonthly, monthlyGrossSalary: main.monthlyGrossSalary,
      coveragePct: main.coveragePct, totalEP: main.totalEP,
      // for the dashboard card: the leave-Germany scenario figure, if vested
      leave: leaveState ? { year: leaveState.year, grossMonthly: leaveState.grossMonthly } : null,
      // for the dashboard: private payout + full-career combined + leave-Germany combined
      private: privateState ? { payout: privateState.payout, fullCombined: privateState.fullCombinedEUR, leaveCombined: privateState.leaveCombinedEUR } : null
    } : null;
    s.touched = userTouched;
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    if (s.touched) userTouched = true;
    MAIN_FIELDS.concat(EXTRA_FIELDS).forEach(function (k) { if (s[k] != null && s[k] !== '') els[k].value = s[k]; });
  }

  function init() {
    var ids = MAIN_FIELDS.concat(EXTRA_FIELDS, [
      'points', 'gross', 'netins', 'net', 'meta',
      'leavePrompt', 'leaveVested', 'leaveUnvested', 'leaveYearsNote', 'leaveEP', 'leaveGross', 'leaveNominalInr', 'leaveRealInr', 'leavePreview',
      'privatePrompt', 'privateResults', 'privateYears', 'privateLump', 'privatePayout',
      'privateCombinedFull', 'privateCombinedLeaveWrap', 'privateCombinedLeave', 'privateCombinedLeaveLabel', 'privateCompare', 'privatePreview'
    ]);
    ids.forEach(function (id) { els[id] = $(id); });
    var rw = $('rw'); if (rw) rw.textContent = C.AKTUELLER_RENTENWERT.toFixed(2);

    restore();
    MAIN_FIELDS.concat(EXTRA_FIELDS).forEach(function (k) {
      els[k].addEventListener('input', function () { userTouched = true; recompute(); });
    });
    AIO.onRate(renderAllINR);
    recompute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
