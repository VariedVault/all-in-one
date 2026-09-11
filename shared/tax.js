/* ---------------------------------------------------------------------------
   German income tax (Einkommensteuer) per §32a EStG, EXACT tariff for 2026.

   This is the official Bundesministerium der Finanzen zone formula for the
   Veranlagungszeitraum 2026 (not a linear approximation). The taxable income
   (zvE) is rounded down to a full euro, the tariff applied, and the result
   rounded down to a full euro, exactly as the statute prescribes.

   Zones (standard Grundfreibetrag 12,348):
     zvE <= 12,348            -> 0
     12,349 .. 17,799         -> (914.51 * y + 1400) * y,      y = (zvE-12348)/10000
     17,800 .. 69,878         -> (173.10 * z + 2397) * z + 1034.87, z = (zvE-17799)/10000
     69,879 .. 277,825        -> 0.42 * zvE - 11135.63
     >= 277,826               -> 0.45 * zvE - 19470.38

   estimateIncomeTax(zvE, gf) keeps its original signature: with the default
   (standard) Grundfreibetrag it returns the exact official tariff; when a
   different allowance is passed (e.g. 0 for Steuerklasse V/VI) the same zone
   shape is shifted to that allowance. Steuerklasse III uses the exact splitting
   method via taxSplitting(). Coefficients confirmed against gesetze-im-internet.de
   and buzer.de for VZ 2026.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var GRUNDFREIBETRAG_DEFAULT = 12348;
  // Progression-zone widths (independent of the allowance).
  var W1 = 5451;    // 17799 - 12348
  var W2 = 52079;   // 69878 - 17799
  var W3 = 207947;  // 277825 - 69878

  function floorEuro(n) { return n > 0 ? Math.floor(n) : 0; }

  // Exact official §32a tariff for 2026 with the standard Grundfreibetrag.
  function taxStandard(zvE) {
    zvE = Math.floor(zvE);
    if (zvE <= 12348) return 0;
    if (zvE <= 17799) { var y = (zvE - 12348) / 10000; return floorEuro((914.51 * y + 1400) * y); }
    if (zvE <= 69878) { var z = (zvE - 17799) / 10000; return floorEuro((173.10 * z + 2397) * z + 1034.87); }
    if (zvE <= 277825) return floorEuro(0.42 * zvE - 11135.63);
    return floorEuro(0.45 * zvE - 19470.38);
  }

  // Splitting tariff (Steuerklasse III / joint assessment): tax half the income
  // under the basic tariff, then double. This is the exact PAP method.
  function taxSplitting(zvE) {
    zvE = Math.floor(zvE);
    return 2 * taxStandard(Math.floor(zvE / 2));
  }

  // Same zone shape shifted to an arbitrary allowance `gf`. Used for the
  // Steuerklasse V/VI approximation (gf = 0, i.e. no basic allowance). The zone
  // constants are derived from continuity so the curve stays smooth. For the
  // standard allowance we defer to taxStandard() to stay exactly on the statute.
  function taxShifted(zvE, gf) {
    zvE = Math.floor(zvE);
    if (zvE <= gf) return 0;
    var b1 = gf + W1, b2 = gf + W1 + W2, b3 = gf + W1 + W2 + W3;
    if (zvE <= b1) { var y = (zvE - gf) / 10000; return floorEuro((914.51 * y + 1400) * y); }
    var e1 = (914.51 * (W1 / 10000) + 1400) * (W1 / 10000);           // zone1 at its top
    if (zvE <= b2) { var z = (zvE - b1) / 10000; return floorEuro((173.10 * z + 2397) * z + e1); }
    var e2 = (173.10 * (W2 / 10000) + 2397) * (W2 / 10000) + e1;      // zone2 at its top
    if (zvE <= b3) return floorEuro(0.42 * (zvE - b2) + e2);
    var e3 = 0.42 * W3 + e2;                                          // zone3 at its top
    return floorEuro(0.45 * (zvE - b3) + e3);
  }

  // Annual income tax for a taxable income (zvE). With the default/standard
  // Grundfreibetrag this is the exact official tariff; a different allowance
  // shifts the same zones (used for Steuerklasse V/VI with gf = 0).
  function estimateIncomeTax(zvE, gf) {
    if (gf == null || !isFinite(gf) || gf < 0) gf = GRUNDFREIBETRAG_DEFAULT;
    if (gf === GRUNDFREIBETRAG_DEFAULT) return taxStandard(zvE);
    return taxShifted(zvE, gf);
  }

  window.estimateIncomeTax = estimateIncomeTax;
  window.taxSplitting = taxSplitting;
  window.GRUNDFREIBETRAG_DEFAULT = GRUNDFREIBETRAG_DEFAULT;
})();
