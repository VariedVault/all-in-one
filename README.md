# All-in-One

A small, growing suite of clean financial calculators — vanilla HTML/CSS/JS, no build step, no framework, no backend. Everything runs in your browser and stays there.

**Live:** https://variedvault.github.io/all-in-one/

## Calculators

- **German Pension Calculator** (`/pension/`) — estimates your statutory monthly gross pension (gesetzliche Rente) from your salary history and Entgeltpunkte.
- **Emergency Fund Calculator** (`/emergency-fund/`) — your target safety net and how far along you already are.
- More coming (compound interest, loan/EMI, net salary).

## How it works

- **No backend.** All calculations run client-side. Inputs are saved to `localStorage` per calculator so they persist between visits — nothing is ever sent to a server.
- **Live EUR → INR** rate is fetched once from [ExchangeRate-API](https://www.exchangerate-api.com) (`open.er-api.com`, no key) and cached in `localStorage` for an hour; it falls back to a fixed estimate offline.
- **Yearly constants** for the pension calculator live in one dated file, [`pension/constants.js`](pension/constants.js), so annual updates are a one-line change.

## Structure

```
/                 hub / landing page
/pension/         German Pension Calculator (+ constants.js, pension.js)
/emergency-fund/  Emergency Fund Calculator (+ emergency.js)
/shared/          shared design tokens (tokens.css) + runtime (app.js)
/impressum/       Impressum
/datenschutz/     Datenschutzerklärung / Privacy Policy
```

## Development

No tooling required — open `index.html`, or serve the folder statically:

```bash
python3 -m http.server 8000
```

## License

MIT — see [LICENSE](LICENSE). Built by [Balaji](https://balajijayakumar.com).
