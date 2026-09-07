/* ---------------------------------------------------------------------------
   Brutto/Netto Calculator (single + married). EUR-locked core figures via
   AIO.formatEUR; a secondary converted line uses the header currency selector.
   Uses window.DEPayroll (shared payroll engine) and window.DE_PAYROLL_CONSTANTS.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.DE_PAYROLL_CONSTANTS;
  var KEY = 'aio:bruttonetto';
  var NUM_INPUTS = ['bnSalary', 'bnChildren', 'bnGrossA', 'bnGrossB', 'bnMChildren'];
  var SELECTS = ['bnClass', 'bnState', 'bnCombo', 'bnStateA', 'bnStateB'];
  var CHECKS = ['bnChildless', 'bnChurch', 'bnChildlessA', 'bnChurchA', 'bnChildlessB', 'bnChurchB'];
  var els = {};
  var mode = 'single';
  var bnUnit = 'month';
  var userTouched = false;
  var lastSingleNetto = null, lastHouseholdNetto = null;

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function eur(n) { return AIO.formatEUR(n); }
  function show(el, on) { if (el) el.hidden = !on; }

  function conv(el, nettoEUR) {
    if (nettoEUR == null || AIO.getCurrency() === 'EUR') { el.textContent = ''; return; }
    var rate = AIO.getRate();
    el.textContent = rate == null ? '≈ … (loading rate)' : '≈ ' + AIO.formatAmount(nettoEUR * rate) + ' / month';
  }

  function churchRate(isMember, stateCode) {
    return isMember ? DEPayroll.churchRateForState(stateCode) : 0;
  }

  /* ---------------- single ---------------- */
  function computeSingle() {
    var amount = num(els.bnSalary.value);
    if (!isFinite(amount) || amount <= 0) {
      lastSingleNetto = null;
      ['bnBrutto', 'bnLohn', 'bnSoli', 'bnKirche', 'bnRv', 'bnAv', 'bnKv', 'bnPv', 'bnNetto'].forEach(function (id) { els[id].textContent = '–'; });
      els.bnNettoConv.textContent = '';
      els.bnMeta.textContent = 'Enter your gross salary and tax class to see your net.';
      return null;
    }
    var grossMonthly = bnUnit === 'year' ? amount / 12 : amount;
    var r = DEPayroll.compute(grossMonthly, {
      steuerklasse: els.bnClass.value,
      childless23: els.bnChildless.checked,
      churchRate: churchRate(els.bnChurch.checked, els.bnState.value),
      children: num(els.bnChildren.value) || 0
    });
    els.bnBrutto.textContent = eur(grossMonthly);
    els.bnLohn.textContent = eur(r.lohnsteuer);
    els.bnSoli.textContent = eur(r.soli);
    els.bnKirche.textContent = eur(r.kirchensteuer);
    els.bnRv.textContent = eur(r.rv);
    els.bnAv.textContent = eur(r.av);
    els.bnKv.textContent = eur(r.kv);
    els.bnPv.textContent = eur(r.pv);
    els.bnNetto.textContent = eur(r.netto);
    lastSingleNetto = r.netto;
    conv(els.bnNettoConv, r.netto);
    els.bnMeta.textContent = 'Effective deduction rate ' + Math.round(r.effectiveRate) + '% (tax class ' + els.bnClass.value + ').';
    return { brutto: grossMonthly, netto: r.netto, label: 'Class ' + els.bnClass.value };
  }

  /* ---------------- married ---------------- */
  var COMBO_LABEL = { iiiv: 'III/V', iviv: 'IV/IV', faktor: 'IV Faktor' };

  function computeMarried() {
    var gA = num(els.bnGrossA.value), gB = num(els.bnGrossB.value);
    var grossA = isFinite(gA) && gA > 0 ? gA : 0;
    var grossB = isFinite(gB) && gB > 0 ? gB : 0;
    if (grossA <= 0 && grossB <= 0) {
      lastHouseholdNetto = null;
      show(els.bnMResults, false); show(els.bnMPrompt, true);
      return null;
    }
    var combo = els.bnCombo.value;
    var children = num(els.bnMChildren.value) || 0;
    var classA = combo === 'iiiv' ? 'III' : 'IV';
    var classB = combo === 'iiiv' ? 'V' : 'IV';
    var optsA = { steuerklasse: classA, childless23: els.bnChildlessA.checked, churchRate: churchRate(els.bnChurchA.checked, els.bnStateA.value), children: children };
    var optsB = { steuerklasse: classB, childless23: els.bnChildlessB.checked, churchRate: churchRate(els.bnChurchB.checked, els.bnStateB.value), children: children };
    var classLabelA = classA, classLabelB = classB;
    if (combo === 'faktor') {
      var f = DEPayroll.faktorLohnsteuer(grossA * 12, grossB * 12);
      optsA.lohnsteuerMonthlyOverride = f.lohnsteuerA / 12;
      optsB.lohnsteuerMonthlyOverride = f.lohnsteuerB / 12;
      classLabelA = 'IV (Faktor)'; classLabelB = 'IV (Faktor)';
    }
    var A = DEPayroll.compute(grossA, optsA);
    var B = DEPayroll.compute(grossB, optsB);
    var household = A.netto + B.netto;

    function rowN(label, a, b) { return '<tr><td>' + label + '</td><td>' + a + '</td><td>' + b + '</td></tr>'; }
    els.bnMBody.innerHTML =
      rowN('Tax class', classLabelA, classLabelB) +
      rowN('Gross', eur(grossA), eur(grossB)) +
      rowN('Income tax', eur(A.lohnsteuer), eur(B.lohnsteuer)) +
      rowN('Total deductions', eur(A.totalDeductions), eur(B.totalDeductions)) +
      rowN('Net', eur(A.netto), eur(B.netto));
    els.bnHousehold.textContent = eur(household);
    lastHouseholdNetto = household;
    conv(els.bnHouseholdConv, household);
    show(els.bnMPrompt, false); show(els.bnMResults, true);
    return { brutto: grossA + grossB, netto: household, label: 'Married: ' + COMBO_LABEL[combo] };
  }

  /* ---------------- orchestration ---------------- */
  function recompute() {
    var result;
    if (mode === 'single') result = computeSingle();
    else result = computeMarried();
    persist(result);
  }
  function renderConvOnly() {
    if (mode === 'single') conv(els.bnNettoConv, lastSingleNetto);
    else conv(els.bnHouseholdConv, lastHouseholdNetto);
  }

  function setMode(next) {
    mode = next;
    var tabs = document.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-mode') === mode);
    var panels = document.querySelectorAll('[data-mode-panel]');
    for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute('data-mode-panel') !== mode;
    recompute();
  }

  function toggleStateWraps() {
    show(els.bnStateWrap, els.bnChurch.checked);
    show(els.bnStateAWrap, els.bnChurchA.checked);
    show(els.bnStateBWrap, els.bnChurchB.checked);
  }
  function updateUnitSeg() {
    var btns = els.bnUnitSeg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-unit') === bnUnit);
  }

  /* ---------------- persistence ---------------- */
  function persist(result) {
    var s = { mode: mode, bnUnit: bnUnit, touched: userTouched, result: result || null };
    NUM_INPUTS.forEach(function (id) { s[id] = els[id].value; });
    SELECTS.forEach(function (id) { s[id] = els[id].value; });
    CHECKS.forEach(function (id) { s[id] = els[id].checked; });
    AIO.save(KEY, s);
  }
  function restore() {
    var st = AIO.load(KEY);
    if (!st) return;
    if (st.touched) userTouched = true;
    if (st.mode === 'married') mode = 'married';
    if (st.bnUnit === 'year') bnUnit = 'year';
    NUM_INPUTS.forEach(function (id) { if (st[id] != null && st[id] !== '') els[id].value = st[id]; });
    SELECTS.forEach(function (id) { if (st[id] != null) els[id].value = st[id]; });
    CHECKS.forEach(function (id) { if (st[id] != null) els[id].checked = !!st[id]; });
  }

  function populateStates() {
    var opts = '';
    for (var i = 0; i < C.BUNDESLAENDER.length; i++) {
      var b = C.BUNDESLAENDER[i];
      opts += '<option value="' + b.code + '">' + b.name + '</option>';
    }
    els.bnState.innerHTML = opts; els.bnStateA.innerHTML = opts; els.bnStateB.innerHTML = opts;
  }

  function init() {
    NUM_INPUTS.concat(SELECTS, CHECKS, [
      'bnUnitSeg', 'bnStateWrap', 'bnStateAWrap', 'bnStateBWrap',
      'bnBrutto', 'bnLohn', 'bnSoli', 'bnKirche', 'bnRv', 'bnAv', 'bnKv', 'bnPv', 'bnNetto', 'bnNettoConv', 'bnMeta',
      'bnMPrompt', 'bnMResults', 'bnMBody', 'bnHousehold', 'bnHouseholdConv'
    ]).forEach(function (id) { els[id] = $(id); });

    populateStates();
    restore();

    // apply restored state to DOM
    var tabs = document.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-mode') === mode);
    var panels = document.querySelectorAll('[data-mode-panel]');
    for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute('data-mode-panel') !== mode;
    updateUnitSeg();
    toggleStateWraps();

    for (var t = 0; t < tabs.length; t++) {
      (function (tab) { tab.addEventListener('click', function () { userTouched = true; setMode(tab.getAttribute('data-mode')); }); })(tabs[t]);
    }
    NUM_INPUTS.concat(SELECTS).forEach(function (id) { els[id].addEventListener('input', function () { userTouched = true; recompute(); }); });
    els.bnClass.addEventListener('change', function () { userTouched = true; recompute(); });
    CHECKS.forEach(function (id) { els[id].addEventListener('change', function () { userTouched = true; toggleStateWraps(); recompute(); }); });
    els.bnUnitSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { userTouched = true; bnUnit = b.getAttribute('data-unit'); updateUnitSeg(); recompute(); });
    });

    AIO.onRate(renderConvOnly);
    recompute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
