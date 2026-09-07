/* ---------------------------------------------------------------------------
   Simplified German income tax (Einkommensteuer), 2026.

   A deliberately SIMPLIFIED, piecewise-LINEAR approximation of the §32a EStG
   tariff, NOT the exact BMF quadratic formula. Within each progression zone the
   marginal rate is treated as rising linearly, and total tax is the integral of
   the marginal rate across the taxable income (zvE).

   The tariff is defined by a tax-free allowance (Grundfreibetrag) followed by
   progression zones of fixed WIDTH. estimateIncomeTax(zvE, gf) lets the caller
   override the allowance (used by the Brutto/Netto calculator per Steuerklasse:
   doubled for III, zero for V/VI); it defaults to the standard 2026 value so the
   Pension calculator keeps its existing behaviour.

   Zones (standard gf = 12,348):
     zvE <= 12,348            -> 0
     12,349 .. 17,799         -> marginal 14% rising linearly to ~24%
     17,800 .. 69,878         -> marginal ~24% rising linearly to 42%
     69,879 .. 277,825        -> flat 42%
     >= 277,826               -> flat 45%
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var GRUNDFREIBETRAG_DEFAULT = 12348;

  // Progression-zone widths (relative to the allowance) and their marginal rates.
  var W1 = 5451;    // 17799 - 12348: marginal 14% -> 24%
  var W2 = 52079;   // 69878 - 17799: marginal 24% -> 42%
  var W3 = 207947;  // 277825 - 69878: flat 42%
  var R_START = 0.14;
  var R_MID = 0.24;
  var R_TOP = 0.42;
  var R_RICH = 0.45;

  // Tax accrued in a zone [lo, hi] whose marginal rate rises linearly rLo -> rHi,
  // integrated from lo up to x. Exact for a linear rate: average rate times width.
  function zoneLinear(lo, hi, rLo, rHi, x) {
    var dx = x - lo;
    if (dx <= 0) return 0;
    var rAtX = rLo + (rHi - rLo) * (dx / (hi - lo));
    return (rLo + rAtX) / 2 * dx;
  }

  // Annual income tax for a taxable income (zvE), with an optional Grundfreibetrag
  // (defaults to the standard 2026 allowance). The zones shift with the allowance.
  function estimateIncomeTax(zvE, gf) {
    if (gf == null || !isFinite(gf) || gf < 0) gf = GRUNDFREIBETRAG_DEFAULT;
    if (!(zvE > gf)) return 0;

    var b1 = gf + W1, b2 = gf + W1 + W2, b3 = gf + W1 + W2 + W3;
    var tax = 0;

    var x = Math.min(zvE, b1);
    tax += zoneLinear(gf, b1, R_START, R_MID, x);
    if (zvE <= b1) return tax;

    x = Math.min(zvE, b2);
    tax += zoneLinear(b1, b2, R_MID, R_TOP, x);
    if (zvE <= b2) return tax;

    x = Math.min(zvE, b3);
    tax += R_TOP * (x - b2);
    if (zvE <= b3) return tax;

    tax += R_RICH * (zvE - b3);
    return tax;
  }

  window.estimateIncomeTax = estimateIncomeTax;
  window.GRUNDFREIBETRAG_DEFAULT = GRUNDFREIBETRAG_DEFAULT;
})();
