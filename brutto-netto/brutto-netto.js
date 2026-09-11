/* ---------------------------------------------------------------------------
   Brutto/Netto Calculator. One person's net is always computed from their own
   gross + Steuerklasse (I, II, III, IV, V, VI). An optional partner section adds
   the partner's own net and the combined household net; IV mit Faktor is the only
   class that needs both incomes (joint Splittingtarif apportioned by income share).
   EUR-locked core via AIO.formatEUR, with a secondary converted line.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.DE_PAYROLL_CONSTANTS;
  var KEY = 'aio:bruttonetto';
  var NUM_INPUTS = ['bnSalary', 'bnChildren', 'bnPGross'];
  var SELECTS = ['bnClass', 'bnState', 'bnPClass', 'bnPState'];
  var CHECKS = ['bnChildless', 'bnChurch', 'bnPChildless', 'bnPChurch'];
  var els = {};
  var bnUnit = 'month';
  var userTouched = false;
  var lastPrimaryNetto = null, lastHouseholdNetto = null;

  function $(id) { return document.getElementById(id); }
  function num(v) { return AIO.parseNumber(v); } // sanitizes thousands separators
  function eur(n) { return AIO.formatEUR(n); }
  function show(el, on) { if (el) el.hidden = !on; }
  function setPreview(el, text, empty) { el.textContent = text; el.classList.toggle('empty', !!empty); }

  function conv(el, nettoEUR) {
    if (nettoEUR == null || AIO.getCurrency() === 'EUR') { el.textContent = ''; return; }
    var rate = AIO.getRate();
    el.textContent = rate == null ? '≈ … (loading rate)' : '≈ ' + AIO.formatAmount(nettoEUR * rate) + ' / month';
  }
  function churchRate(isMember, stateCode) { return isMember ? DEPayroll.churchRateForState(stateCode) : 0; }
  function classLabel(cls) { return cls === 'faktor' ? 'Steuerklasse IV mit Faktor' : 'Steuerklasse ' + cls; }

  function renderPrimaryBreakdown(r, gross) {
    els.bnBrutto.textContent = eur(gross);
    els.bnLohn.textContent = eur(r.lohnsteuer);
    els.bnSoli.textContent = eur(r.soli);
    els.bnKirche.textContent = eur(r.kirchensteuer);
    els.bnRv.textContent = eur(r.rv);
    els.bnAv.textContent = eur(r.av);
    els.bnKv.textContent = eur(r.kv);
    els.bnPv.textContent = eur(r.pv);
    els.bnNetto.textContent = eur(r.netto);
    lastPrimaryNetto = r.netto;
    conv(els.bnNettoConv, r.netto);
    els.bnMeta.textContent = 'Effective deduction rate ' + Math.round(r.effectiveRate) + '%.';
  }
  function clearPrimary() {
    lastPrimaryNetto = null;
    ['bnBrutto', 'bnLohn', 'bnSoli', 'bnKirche', 'bnRv', 'bnAv', 'bnKv', 'bnPv', 'bnNetto'].forEach(function (id) { els[id].textContent = '–'; });
    els.bnNettoConv.textContent = '';
    els.bnMeta.textContent = 'Enter your gross salary and tax class to see your net.';
  }
  function clearPartner() {
    lastHouseholdNetto = null;
    show(els.partnerResults, false); show(els.partnerPrompt, true);
    setPreview(els.partnerPreview, 'optional', true);
  }

  function compute() {
    var primaryClass = els.bnClass.value;
    els.partnerClassField.hidden = (primaryClass === 'faktor'); // partner is IV under Faktor

    var amount = num(els.bnSalary.value);
    var validPrimary = isFinite(amount) && amount > 0;
    var primaryGross = validPrimary ? (bnUnit === 'year' ? amount / 12 : amount) : 0;
    var children = num(els.bnChildren.value) || 0;

    var pGross = num(els.bnPGross.value);
    var partnerFilled = isFinite(pGross) && pGross > 0;

    /* ---- IV mit Faktor: needs both incomes ---- */
    if (primaryClass === 'faktor') {
      if (!validPrimary || !partnerFilled) {
        show(els.bnPrimaryOut, false);
        show(els.bnFaktorMsg, true);
        clearPrimary(); clearPartner();
        return persist(null);
      }
      var f = DEPayroll.faktorLohnsteuer(primaryGross * 12, pGross * 12);
      var A = DEPayroll.compute(primaryGross, {
        steuerklasse: 'IV', childless23: els.bnChildless.checked,
        churchRate: churchRate(els.bnChurch.checked, els.bnState.value), children: children,
        lohnsteuerMonthlyOverride: f.lohnsteuerA / 12
      });
      var Bf = DEPayroll.compute(pGross, {
        steuerklasse: 'IV', childless23: els.bnPChildless.checked,
        churchRate: churchRate(els.bnPChurch.checked, els.bnPState.value), children: children,
        lohnsteuerMonthlyOverride: f.lohnsteuerB / 12
      });
      show(els.bnFaktorMsg, false); show(els.bnPrimaryOut, true);
      renderPrimaryBreakdown(A, primaryGross);
      renderPartner(Bf, A.netto);
      return persist({ brutto: primaryGross, netto: A.netto, label: classLabel('faktor'), household: A.netto + Bf.netto });
    }

    /* ---- normal classes: each net is independent ---- */
    show(els.bnFaktorMsg, false); show(els.bnPrimaryOut, true);
    if (!validPrimary) { clearPrimary(); clearPartner(); return persist(null); }

    var P = DEPayroll.compute(primaryGross, {
      steuerklasse: primaryClass, childless23: els.bnChildless.checked,
      churchRate: churchRate(els.bnChurch.checked, els.bnState.value), children: children
    });
    renderPrimaryBreakdown(P, primaryGross);

    var household = null;
    if (partnerFilled) {
      var B = DEPayroll.compute(pGross, {
        steuerklasse: els.bnPClass.value, childless23: els.bnPChildless.checked,
        churchRate: churchRate(els.bnPChurch.checked, els.bnPState.value), children: children
      });
      household = P.netto + B.netto;
      renderPartner(B, P.netto);
    } else {
      clearPartner();
    }
    persist({ brutto: primaryGross, netto: P.netto, label: classLabel(primaryClass), household: household });
  }

  function renderPartner(B, yourNetto) {
    els.partnerNet.textContent = eur(B.netto);
    els.partnerYourNet.textContent = eur(yourNetto);
    var household = yourNetto + B.netto;
    els.bnHousehold.textContent = eur(household);
    lastHouseholdNetto = household;
    conv(els.bnHouseholdConv, household);
    show(els.partnerPrompt, false); show(els.partnerResults, true);
    setPreview(els.partnerPreview, eur(household) + ' household', false);
  }

  function renderConvOnly() {
    conv(els.bnNettoConv, lastPrimaryNetto);
    conv(els.bnHouseholdConv, lastHouseholdNetto);
  }

  /* ---------------- toggles ---------------- */
  function toggleStateWraps() {
    show(els.bnStateWrap, els.bnChurch.checked);
    show(els.bnPStateWrap, els.bnPChurch.checked);
  }
  function updateUnitSeg() {
    var btns = els.bnUnitSeg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-unit') === bnUnit);
  }

  /* ---------------- persistence ---------------- */
  function persist(result) {
    var s = { bnUnit: bnUnit, touched: userTouched, result: result || null };
    NUM_INPUTS.forEach(function (id) { s[id] = els[id].value; });
    SELECTS.forEach(function (id) { s[id] = els[id].value; });
    CHECKS.forEach(function (id) { s[id] = els[id].checked; });
    AIO.save(KEY, s);
  }
  function restore() {
    var st = AIO.load(KEY);
    if (!st) return;
    if (st.touched) userTouched = true;
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
    els.bnState.innerHTML = opts; els.bnPState.innerHTML = opts;
  }

  function init() {
    NUM_INPUTS.concat(SELECTS, CHECKS, [
      'bnUnitSeg', 'bnStateWrap', 'bnPStateWrap', 'partnerClassField', 'partnerCard',
      'bnPrimaryOut', 'bnFaktorMsg',
      'bnBrutto', 'bnLohn', 'bnSoli', 'bnKirche', 'bnRv', 'bnAv', 'bnKv', 'bnPv', 'bnNetto', 'bnNettoConv', 'bnMeta',
      'partnerPrompt', 'partnerResults', 'partnerNet', 'partnerYourNet', 'bnHousehold', 'bnHouseholdConv', 'partnerPreview'
    ]).forEach(function (id) { els[id] = $(id); });

    populateStates();
    restore();
    updateUnitSeg();
    toggleStateWraps();

    NUM_INPUTS.forEach(function (id) { els[id].addEventListener('input', function () { userTouched = true; compute(); }); });
    els.bnClass.addEventListener('change', function () {
      userTouched = true;
      if (els.bnClass.value === 'faktor' && !(num(els.bnPGross.value) > 0)) els.partnerCard.open = true;
      compute();
    });
    els.bnPClass.addEventListener('change', function () { userTouched = true; compute(); });
    CHECKS.forEach(function (id) { els[id].addEventListener('change', function () { userTouched = true; toggleStateWraps(); compute(); }); });
    els.bnState.addEventListener('change', function () { userTouched = true; compute(); });
    els.bnPState.addEventListener('change', function () { userTouched = true; compute(); });
    els.bnUnitSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { userTouched = true; bnUnit = b.getAttribute('data-unit'); updateUnitSeg(); compute(); });
    });

    AIO.onRate(renderConvOnly);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
