/* ---------------------------------------------------------------------------
   German statutory pension — official constants.
   These change roughly once a year. Update the value + the dated comment when
   Deutsche Rentenversicherung / the Sozialversicherung publishes new figures.
   Last reviewed: 2026-09.
--------------------------------------------------------------------------- */
window.PENSION_CONSTANTS = {
  // Provisional average annual gross wage ("Durchschnittsentgelt"), used to
  // convert a year's earnings into Entgeltpunkte. Value for 2026, €/year.
  DURCHSCHNITTSENTGELT_2026: 51944,

  // Current pension value ("aktueller Rentenwert"): € of monthly pension per
  // Entgeltpunkt. Valid since 2026-07-01; next scheduled update 2027-07-01.
  AKTUELLER_RENTENWERT: 42.52,

  // Contribution assessment ceiling ("Beitragsbemessungsgrenze", pension
  // insurance). Earnings above this don't earn extra points. Value for 2026, €/year.
  BEITRAGSBEMESSUNGSGRENZE_2026: 101400
};
