/* ---------------------------------------------------------------------------
   German payroll engine (Brutto -> Netto), used by the Brutto/Netto calculator.
   Simplified approximation (see the on-page disclaimer), not the official
   Lohnsteuer PAP formula. Uses window.estimateIncomeTax and
   window.DE_PAYROLL_CONSTANTS. All figures returned are MONTHLY.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var C = window.DE_PAYROLL_CONSTANTS;

  // Grundfreibetrag applied for a Steuerklasse: doubled for III, none for V/VI.
  function gfForClass(steuerklasse) {
    if (steuerklasse === 'III') return C.GRUNDFREIBETRAG * 2;
    if (steuerklasse === 'V' || steuerklasse === 'VI') return 0;
    return C.GRUNDFREIBETRAG; // I, II, IV
  }

  // Vorsorgepauschale: the tariff is applied to income AFTER the mandatory pension,
  // health and care contributions, not to raw gross. Approximated here by the
  // employee social-insurance contributions (each capped at its BBG). Without this
  // the simplified model overstates Lohnsteuer noticeably.
  function vorsorgeAnnual(grossAnnual) {
    var gm = grossAnnual / 12;
    var rvav = Math.min(gm, C.BBG_RV_AV_MONTH);
    var kvpv = Math.min(gm, C.BBG_KV_PV_MONTH);
    return 12 * (rvav * C.RV_RATE + rvav * C.AV_RATE + kvpv * C.KV_RATE + kvpv * C.PV_BASE);
  }

  // Pflegeversicherung employee rate given childless surcharge + number of children.
  function pflegeRate(childless23, children) {
    var rate = C.PV_BASE + (childless23 ? C.PV_CHILDLESS_SURCHARGE : 0);
    if (children >= 2) {
      var steps = Math.min(children - 1, C.PV_CHILD_DISCOUNT_MAX_STEPS);
      rate -= steps * C.PV_CHILD_DISCOUNT_STEP;
    }
    return Math.max(0, rate);
  }

  // Annual Lohnsteuer for a given annual gross under a Steuerklasse. The taxable
  // income is gross minus the Vorsorgepauschale, then the §32a tariff with the
  // class's Grundfreibetrag (doubled for III, none for V/VI) is applied.
  function annualLohnsteuer(grossAnnual, steuerklasse) {
    var zvE = Math.max(0, grossAnnual - vorsorgeAnnual(grossAnnual));
    return window.estimateIncomeTax(zvE, gfForClass(steuerklasse));
  }

  // Solidaritätszuschlag on an annual Lohnsteuer amount (Freigrenze doubled for III).
  function annualSoli(lohnsteuerAnnual, steuerklasse) {
    var freigrenze = steuerklasse === 'III' ? C.SOLI_FREIGRENZE_ANNUAL * 2 : C.SOLI_FREIGRENZE_ANNUAL;
    return lohnsteuerAnnual > freigrenze ? C.SOLI_RATE * lohnsteuerAnnual : 0;
  }

  // Monthly employee social insurance, each capped at its BBG.
  function socialInsurance(grossMonthly, childless23, children) {
    var rvavBase = Math.min(grossMonthly, C.BBG_RV_AV_MONTH);
    var kvpvBase = Math.min(grossMonthly, C.BBG_KV_PV_MONTH);
    return {
      rv: rvavBase * C.RV_RATE,
      av: rvavBase * C.AV_RATE,
      kv: kvpvBase * C.KV_RATE,
      pv: kvpvBase * pflegeRate(childless23, children)
    };
  }

  /* Full monthly Brutto -> Netto for one person.
     opts:
       steuerklasse     'I'|'II'|'III'|'IV'|'V'|'VI'
       childless23      boolean (Pflege surcharge)
       churchRate       0 | 0.08 | 0.09
       children         number
       lohnsteuerMonthlyOverride  optional (used for IV mit Faktor)
     Returns monthly: { grossMonthly, lohnsteuer, soli, kirchensteuer, rv, av, kv, pv,
                        totalDeductions, netto, effectiveRate } */
  function compute(grossMonthly, opts) {
    opts = opts || {};
    var steuerklasse = opts.steuerklasse || 'I';
    var children = opts.children > 0 ? opts.children : 0;
    var churchRate = opts.churchRate || 0;

    var lohnsteuerMonthly, soliMonthly;
    if (opts.lohnsteuerMonthlyOverride != null && isFinite(opts.lohnsteuerMonthlyOverride)) {
      lohnsteuerMonthly = Math.max(0, opts.lohnsteuerMonthlyOverride);
      soliMonthly = annualSoli(lohnsteuerMonthly * 12, steuerklasse) / 12;
    } else {
      var lsAnnual = annualLohnsteuer(grossMonthly * 12, steuerklasse);
      lohnsteuerMonthly = lsAnnual / 12;
      soliMonthly = annualSoli(lsAnnual, steuerklasse) / 12;
    }
    var kirchensteuerMonthly = churchRate > 0 ? churchRate * lohnsteuerMonthly : 0;

    var si = socialInsurance(grossMonthly, !!opts.childless23, children);

    var total = lohnsteuerMonthly + soliMonthly + kirchensteuerMonthly + si.rv + si.av + si.kv + si.pv;
    var netto = grossMonthly - total;

    return {
      grossMonthly: grossMonthly,
      lohnsteuer: lohnsteuerMonthly,
      soli: soliMonthly,
      kirchensteuer: kirchensteuerMonthly,
      rv: si.rv, av: si.av, kv: si.kv, pv: si.pv,
      totalDeductions: total,
      netto: netto,
      effectiveRate: grossMonthly > 0 ? (total / grossMonthly) * 100 : 0
    };
  }

  // IV mit Faktor: joint (Splitting) tax apportioned by each partner's income share.
  // Returns { factor, lohnsteuerA, lohnsteuerB } (annual amounts) for the two partners.
  function faktorLohnsteuer(grossAnnualA, grossAnnualB) {
    var taxA4 = annualLohnsteuer(grossAnnualA, 'IV');
    var taxB4 = annualLohnsteuer(grossAnnualB, 'IV');
    var sum4 = taxA4 + taxB4;
    // Splittingtarif on the combined taxable income (after Vorsorgepauschale):
    // tax half the combined zvE, then double.
    var zvA = Math.max(0, grossAnnualA - vorsorgeAnnual(grossAnnualA));
    var zvB = Math.max(0, grossAnnualB - vorsorgeAnnual(grossAnnualB));
    var jointTax = 2 * window.estimateIncomeTax((zvA + zvB) / 2, C.GRUNDFREIBETRAG);
    var factor = sum4 > 0 ? Math.min(1, jointTax / sum4) : 1;
    return { factor: factor, lohnsteuerA: taxA4 * factor, lohnsteuerB: taxB4 * factor };
  }

  function churchRateForState(stateCode) {
    return C.CHURCH_REDUCED_STATES[stateCode] ? C.CHURCH_RATE_REDUCED : C.CHURCH_RATE_DEFAULT;
  }

  window.DEPayroll = {
    compute: compute,
    faktorLohnsteuer: faktorLohnsteuer,
    gfForClass: gfForClass,
    churchRateForState: churchRateForState,
    annualLohnsteuer: annualLohnsteuer
  };
})();
