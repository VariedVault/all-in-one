/* ---------------------------------------------------------------------------
   German payroll (Brutto -> Netto) constants, 2026.
   These change roughly once a year. Update the values + this dated comment when
   the new Sozialversicherungsrechengrößen / Steuertarif are published.
   Last reviewed: 2026-09. Values flagged "verify" should be re-checked yearly.
--------------------------------------------------------------------------- */
window.DE_PAYROLL_CONSTANTS = {
  YEAR: 2026,

  GRUNDFREIBETRAG: 12348,           // €/year, standard basic tax-free allowance

  // Contribution assessment ceilings (Beitragsbemessungsgrenzen), employee share.
  BBG_RV_AV_MONTH: 8450,            // Rentenversicherung + Arbeitslosenversicherung, €/month (verify)
  BBG_RV_AV_YEAR: 101400,           // €/year
  BBG_KV_PV_MONTH: 5512.50,         // Kranken- + Pflegeversicherung, €/month (verify)

  // Social insurance employee rates.
  RV_RATE: 0.093,                   // Rentenversicherung (pension), employee half
  AV_RATE: 0.013,                   // Arbeitslosenversicherung (unemployment), employee half
  KV_RATE: 0.0875,                  // Krankenversicherung: 7.3% + half of avg. Zusatzbeitrag (2.9%/2 = 1.45%)
  ZUSATZBEITRAG_AVG: 0.029,         // average additional health contribution (for reference; half is in KV_RATE)
  PV_BASE: 0.018,                   // Pflegeversicherung base employee rate
  PV_CHILDLESS_SURCHARGE: 0.006,    // +0.6% for childless members aged 23+, paid entirely by the employee
  PV_CHILD_DISCOUNT_STEP: 0.0025,   // -0.25 pp per child from the 2nd to the 5th child (under 25)
  PV_CHILD_DISCOUNT_MAX_STEPS: 4,   // applies to the 2nd, 3rd, 4th, 5th child

  // Solidaritätszuschlag: 5.5% of Lohnsteuer, only above the annual Freigrenze
  // (doubled under joint assessment / Steuerklasse III). Most incomes show €0.
  SOLI_RATE: 0.055,
  SOLI_FREIGRENZE_ANNUAL: 19950,    // annual Lohnsteuer below this -> no Soli (single; verify)

  // Church tax: 8% in Bavaria & Baden-Württemberg, 9% in the other 14 states.
  CHURCH_RATE_DEFAULT: 0.09,
  CHURCH_RATE_REDUCED: 0.08,
  CHURCH_REDUCED_STATES: { BY: 1, BW: 1 }, // Bayern, Baden-Württemberg

  // Second job / Minijob tax-free threshold, €/month.
  MINIJOB_THRESHOLD_MONTH: 603,

  // The 16 Bundesländer (code -> name), for the church-tax state dropdown.
  BUNDESLAENDER: [
    { code: 'BW', name: 'Baden-Württemberg' },
    { code: 'BY', name: 'Bayern' },
    { code: 'BE', name: 'Berlin' },
    { code: 'BB', name: 'Brandenburg' },
    { code: 'HB', name: 'Bremen' },
    { code: 'HH', name: 'Hamburg' },
    { code: 'HE', name: 'Hessen' },
    { code: 'MV', name: 'Mecklenburg-Vorpommern' },
    { code: 'NI', name: 'Niedersachsen' },
    { code: 'NW', name: 'Nordrhein-Westfalen' },
    { code: 'RP', name: 'Rheinland-Pfalz' },
    { code: 'SL', name: 'Saarland' },
    { code: 'SN', name: 'Sachsen' },
    { code: 'ST', name: 'Sachsen-Anhalt' },
    { code: 'SH', name: 'Schleswig-Holstein' },
    { code: 'TH', name: 'Thüringen' }
  ]
};
