/* ---------------------------------------------------------------------------
   Simplified German income tax (Einkommensteuer), 2026.

   A deliberately SIMPLIFIED, piecewise-LINEAR approximation of the §32a EStG
   tariff, NOT the exact BMF quadratic formula. Within each progression zone the
   marginal rate is treated as rising linearly, and total tax is the integral of
   the marginal rate across the taxable income (zvE). Isolated here so it is easy
   to correct or replace later without touching the calculator logic.

   Zones (2026):
     zvE <= 12,348            -> 0
     12,349 .. 17,799         -> marginal 14% rising linearly to ~24%
     17,800 .. 69,878         -> marginal ~24% rising linearly to 42%
     69,879 .. 277,825        -> flat 42%
     >= 277,826               -> flat 45%
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var GRUNDFREIBETRAG = 12348; // tax-free basic allowance
  var B1 = 17799;              // end of first progression zone
  var B2 = 69878;              // end of second progression zone
  var B3 = 277825;             // start of the top (45%) zone is just above this

  var R_START = 0.14; // entry marginal rate
  var R_MID = 0.24;   // marginal rate at the B1 boundary
  var R_TOP = 0.42;   // marginal rate reached at B2 (Spitzensteuersatz)
  var R_RICH = 0.45;  // Reichensteuer

  // Tax accrued within a zone [lo, hi] where the marginal rate rises linearly
  // from rLo to rHi, integrated from lo up to x (lo <= x <= hi). Exact for a
  // linear marginal rate: average of the two endpoint rates times the width.
  function zoneLinear(lo, hi, rLo, rHi, x) {
    var dx = x - lo;
    if (dx <= 0) return 0;
    var rAtX = rLo + (rHi - rLo) * (dx / (hi - lo));
    return (rLo + rAtX) / 2 * dx;
  }

  // Total annual income tax for a given taxable income (zu versteuerndes Einkommen).
  function estimateIncomeTax(zvE) {
    if (!(zvE > GRUNDFREIBETRAG)) return 0;

    var tax = 0;

    // Zone: (Grundfreibetrag, B1], marginal 14% -> 24%
    var x = Math.min(zvE, B1);
    tax += zoneLinear(GRUNDFREIBETRAG, B1, R_START, R_MID, x);
    if (zvE <= B1) return tax;

    // Zone: (B1, B2], marginal 24% -> 42%
    x = Math.min(zvE, B2);
    tax += zoneLinear(B1, B2, R_MID, R_TOP, x);
    if (zvE <= B2) return tax;

    // Zone: (B2, B3], flat 42%
    x = Math.min(zvE, B3);
    tax += R_TOP * (x - B2);
    if (zvE <= B3) return tax;

    // Zone: above B3, flat 45%
    tax += R_RICH * (zvE - B3);
    return tax;
  }

  window.estimateIncomeTax = estimateIncomeTax;
})();
