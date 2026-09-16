/* ---------------------------------------------------------------------------
   CAGR Calculator. Two modes:
     return  -> CAGR = (end / start)^(1/years) - 1
     project -> future value = start * (1 + rate)^years
   Both show a year-by-year table + a small bar chart of the compounding curve.
   Uses the shared window.AIO helpers (formatting, storage). Stays in the browser.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:cagr';
  var els = {};
  var mode = 'return';       // 'return' | 'project'
  var userTouched = false;   // gates the homepage dashboard

  function $(id) { return document.getElementById(id); }
  function num(v) { return AIO.parseNumber(v); } // sanitizes thousands separators
  function eur(n) { return AIO.formatAmount(n); } // values are native to the selected currency
  function pctStr(n) { return (n >= 0 ? '' : '−') + Math.abs(n).toFixed(2) + '%'; }

  function setMode(newMode) {
    if (newMode !== 'return' && newMode !== 'project') return;
    mode = newMode;
    var btns = els.cagrModeSeg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
    toggleModeFields();
    compute();
  }
  function toggleModeFields() {
    var ret = mode === 'return';
    var r = document.querySelectorAll('.cagr-return-only');
    var p = document.querySelectorAll('.cagr-project-only');
    for (var i = 0; i < r.length; i++) r[i].hidden = !ret;
    for (var j = 0; j < p.length; j++) p[j].hidden = ret;
    els.cagrHeadLabel.textContent = ret ? 'Compound annual growth rate' : 'Projected future value';
  }

  function compute() {
    var start = num(els.cagrStart.value);
    var years = num(els.cagrYears.value);
    var validCommon = isFinite(start) && start > 0 && isFinite(years) && years > 0;

    if (mode === 'return') {
      var end = num(els.cagrEnd.value);
      if (!validCommon || !(isFinite(end) && end > 0)) { render(null); return; }
      var cagr = Math.pow(end / start, 1 / years) - 1;
      render({ mode: 'return', start: start, end: end, years: years, rate: cagr });
    } else {
      var rate = num(els.cagrRate.value);
      if (!validCommon || !isFinite(rate)) { render(null); return; }
      var fv = start * Math.pow(1 + rate / 100, years);
      render({ mode: 'project', start: start, end: fv, years: years, rate: rate / 100 });
    }
  }

  // Build per-year values from start compounding at `rate` (decimal). For the
  // return mode this reproduces end at the final whole year; fractional final
  // years are handled by using the exact rate, so the last row may be partial.
  function yearlySeries(start, rate, years) {
    var out = [];
    var whole = Math.floor(years);
    for (var y = 1; y <= whole; y++) out.push({ year: y, value: start * Math.pow(1 + rate, y) });
    if (years > whole) out.push({ year: years, value: start * Math.pow(1 + rate, years), partial: true });
    return out;
  }

  function render(r) {
    if (!r) {
      els.cagrHead.textContent = '–';
      els.cagrHead.classList.remove('result-good', 'result-bad');
      els.cagrPlain.textContent = '';
      els.cagrReceipt.hidden = true;
      els.cagrTableBlock.hidden = true;
      els.cagrFireNudge.hidden = true;
      els.cagrMeta.textContent = mode === 'return'
        ? 'Enter a starting value, ending value and number of years.'
        : 'Enter a starting value, an expected rate and number of years.';
      persist(null);
      return;
    }

    var ratePct = r.rate * 100;
    var growth = r.end - r.start;

    if (r.mode === 'return') {
      els.cagrHead.textContent = pctStr(ratePct);
      els.cagrHead.classList.toggle('result-good', r.rate > 0);
      els.cagrHead.classList.toggle('result-bad', r.rate < 0);
      var word = r.rate >= 0 ? 'grew' : 'shrank';
      els.cagrPlain.textContent = 'Your investment ' + word + ' at an average of ' + pctStr(ratePct) +
        ' per year over ' + trimYears(r.years) + ' year' + (r.years === 1 ? '' : 's') + '.';
      els.cagrR1Label.textContent = 'Starting value';
      els.cagrR2Label.textContent = 'Ending value';
      els.cagrHeadLabel.textContent = 'Compound annual growth rate';
    } else {
      els.cagrHead.textContent = eur(r.end);
      els.cagrHead.classList.remove('result-good', 'result-bad');
      els.cagrPlain.textContent = eur(r.start) + ' growing at ' + pctStr(ratePct) + ' per year becomes ' +
        eur(r.end) + ' after ' + trimYears(r.years) + ' year' + (r.years === 1 ? '' : 's') + '.';
      els.cagrR1Label.textContent = 'Starting value';
      els.cagrR2Label.textContent = 'Future value';
      els.cagrHeadLabel.textContent = 'Projected future value';
    }

    els.cagrR1.textContent = eur(r.start);
    els.cagrR2.textContent = eur(r.end);
    els.cagrR3.textContent = (growth >= 0 ? '' : '−') + eur(Math.abs(growth)) +
      ' (' + (growth >= 0 ? '+' : '−') + Math.abs(Math.round((r.end / r.start - 1) * 100)) + '%)';
    els.cagrReceipt.hidden = false;
    els.cagrMeta.textContent = '';

    renderTable(r);
    renderChart(r);
    renderFireNudge(r, ratePct);
    persist(r);
  }

  function trimYears(y) { return (y % 1 === 0) ? String(y) : y.toFixed(1); }

  function renderTable(r) {
    var series = yearlySeries(r.start, r.rate, r.years);
    var html = '';
    var prev = r.start;
    // Row 0: the starting point.
    html += '<tr><td>0 (start)</td><td>' + eur(r.start) + '</td><td>–</td></tr>';
    for (var i = 0; i < series.length; i++) {
      var s = series[i];
      var g = s.value - prev;
      var label = s.partial ? trimYears(s.year) : String(s.year);
      html += '<tr><td>' + label + '</td><td>' + eur(s.value) + '</td><td>' +
        (g >= 0 ? '+' : '−') + eur(Math.abs(g)) + '</td></tr>';
      prev = s.value;
    }
    els.cagrTableBody.innerHTML = html;
    els.cagrTableBlock.hidden = false;
  }

  // Small pure-CSS bar chart of the compounding curve (start + each year).
  function renderChart(r) {
    var series = yearlySeries(r.start, r.rate, r.years);
    var points = [{ year: 0, value: r.start }].concat(series);
    var max = 0;
    for (var i = 0; i < points.length; i++) if (points[i].value > max) max = points[i].value;
    if (max <= 0) { els.cagrChart.innerHTML = ''; return; }
    var html = '';
    for (var j = 0; j < points.length; j++) {
      var h = Math.max(2, (points[j].value / max) * 100);
      var lbl = points[j].year === 0 ? '0' : (points[j].partial ? trimYears(points[j].year) : points[j].year);
      html += '<div class="cagr-col" title="Year ' + lbl + ': ' + eur(points[j].value) + '">' +
        '<div class="cagr-col-bar" style="height:' + h + '%"></div>' +
        '<div class="cagr-col-lbl">' + lbl + '</div></div>';
    }
    els.cagrChart.innerHTML = html;
  }

  function renderFireNudge(r, ratePct) {
    var msg = r.mode === 'project'
      ? 'Planning ahead? <a href="../fire/">Use this rate in your FIRE plan →</a>'
      : 'Curious how this stacks up? <a href="../fire/">Compare this to your FIRE calculator\'s assumed return →</a>';
    els.cagrFireNudge.innerHTML = msg;
    els.cagrFireNudge.hidden = false;
  }

  /* ---------------- persistence ---------------- */
  function persist(r) {
    var summary = r ? { mode: r.mode, start: r.start, end: r.end, years: r.years, ratePct: r.rate * 100 } : null;
    var s = {
      result: summary, touched: userTouched, mode: mode,
      start: els.cagrStart.value, end: els.cagrEnd.value, rate: els.cagrRate.value, years: els.cagrYears.value
    };
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return;
    if (s.touched) userTouched = true;
    if (s.mode === 'project') mode = 'project';
    if (s.start != null) els.cagrStart.value = s.start;
    if (s.end != null) els.cagrEnd.value = s.end;
    if (s.rate != null) els.cagrRate.value = s.rate;
    if (s.years != null) els.cagrYears.value = s.years;
  }

  function init() {
    ['cagrModeSeg', 'cagrStart', 'cagrEnd', 'cagrRate', 'cagrYears',
     'cagrHead', 'cagrHeadLabel', 'cagrPlain', 'cagrReceipt',
     'cagrR1', 'cagrR2', 'cagrR3', 'cagrR1Label', 'cagrR2Label', 'cagrR3Label',
     'cagrTableBlock', 'cagrTable', 'cagrTableBody', 'cagrChart', 'cagrMeta', 'cagrFireNudge'
    ].forEach(function (id) { els[id] = $(id); });

    restore();

    // Reflect a restored mode in the toggle + fields before first compute.
    var btns = els.cagrModeSeg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
    toggleModeFields();

    els.cagrModeSeg.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-mode') === mode) return;
        userTouched = true;
        setMode(b.getAttribute('data-mode'));
      });
    });
    ['cagrStart', 'cagrEnd', 'cagrRate', 'cagrYears'].forEach(function (id) {
      els[id].addEventListener('input', function () { userTouched = true; compute(); });
    });

    AIO.onRate(compute); // reformat figures when the selected currency changes
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
