# All-in-One

A small, growing suite of clean financial calculators. Vanilla HTML/CSS/JS, no build step, no framework, no backend. Everything runs in your browser and stays there.

**Live:** https://variedvault.github.io/all-in-one/

## Calculators

- **German Pension Calculator** (`/pension/`): estimates your statutory monthly pension (gesetzliche Rente) from your salary history and Entgeltpunkte, with a net-of-insurance and net-of-tax breakdown, plus two optional scenarios: "What if I leave Germany?" (frozen points, vesting, real rupee value) and "Add a private pension" (annuity future value + 4% rule top-up).
- **Emergency Fund Calculator** (`/emergency-fund/`): your target safety net and how far along you already are.
- **Net Worth Calculator** (`/net-worth/`): your net worth from preset and custom asset categories minus liabilities.
- **FIRE Calculator** (`/fire/`): your FIRE number and years to financial independence, with an optional Indian-rupee view.
- More coming (compound interest, loan/EMI).

## How it works

- **No backend.** All calculations run client-side. Inputs are saved to `localStorage` per calculator so they persist between visits. Nothing is ever sent to a server.
- **Live EUR → INR** rate is fetched once from [ExchangeRate-API](https://www.exchangerate-api.com) (`open.er-api.com`, no key) and cached in `localStorage` for an hour; it falls back to a fixed estimate offline.
- **Yearly constants** for the pension calculator live in one dated file, [`pension/constants.js`](pension/constants.js), so annual updates are a one-line change.

## Structure

```
/                 hub / landing page (+ home.js dashboard)
/pension/         German Pension Calculator (+ constants.js, tax.js, pension.js)
/emergency-fund/  Emergency Fund Calculator (+ emergency.js)
/net-worth/       Net Worth Calculator (+ networth.js)
/fire/            FIRE Calculator (+ fire.js)
/shared/          shared design tokens (tokens.css) + runtime (app.js)
/impressum/       Impressum
/datenschutz/     Datenschutzerklärung / Privacy Policy
```

## Development

No tooling required. Open `index.html`, or serve the folder statically:

```bash
python3 -m http.server 8000
```

## License

MIT, see [LICENSE](LICENSE). Built by [Balaji](https://balajijayakumar.com).
