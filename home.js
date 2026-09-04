/* ---------------------------------------------------------------------------
   Homepage dashboard.
   Reads the results each calculator saved to localStorage and, if at least one
   has been run, shows a snapshot above the card grid with a single synthesis
   line that prioritises the next sensible money move. Uses window.AIO helpers.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  function pctOf(pen) { return Math.round(pen.coveragePct); }

  function penCard(pen) {
    // When a private pension is filled in, the card reflects the combined
    // (state + private) figures; otherwise state-only, as before. The full-career
    // combined number here is the same one the synthesis coverage % uses.
    var hasPrivate = pen.private && isFinite(pen.private.fullCombined);
    var fullNum = hasPrivate ? pen.private.fullCombined : pen.netMonthly;
    var sub = hasPrivate
      ? 'State + private pension, working to retirement age with no relocation.'
      : 'Assumes working to retirement age with no relocation.';

    var html = '<div class="dash-card">' +
      '<p class="dash-label">Net monthly pension <span class="dash-sublabel">(full career)</span></p>' +
      '<div class="dash-big">' + AIO.formatEUR(fullNum) + '</div>' +
      '<p class="dash-sub">' + sub + '</p>';
    // If the "leave Germany" scenario was calculated, show it alongside so neither
    // number is ever read in isolation. Use the combined figure when private exists.
    if (pen.leave && isFinite(pen.leave.grossMonthly)) {
      var leaveNum = (hasPrivate && pen.private.leaveCombined != null && isFinite(pen.private.leaveCombined))
        ? pen.private.leaveCombined
        : pen.leave.grossMonthly;
      html += '<p class="dash-leave">If you leave in ' + pen.leave.year + ': ' +
        AIO.formatEUR(leaveNum) + '/mo</p>';
    }
    html += '<a class="recalc" href="pension/">Recalculate →</a></div>';
    return html;
  }

  function emCard(em) {
    var head = em.reached
      ? '<p class="dash-label">Emergency fund</p><div class="dash-big accent">✓ Goal reached</div>'
      : '<p class="dash-label">Still to save</p><div class="dash-big">' + AIO.formatEUR(em.gap) + '</div>';
    return '<div class="dash-card">' +
      head +
      '<p class="dash-sub">' + AIO.formatEUR(em.current) + ' saved of ' + AIO.formatEUR(em.target) + ' target</p>' +
      '<a class="recalc" href="emergency-fund/">Recalculate →</a>' +
      '</div>';
  }

  function nwCard(nw) {
    return '<div class="dash-card">' +
      '<p class="dash-label">Net worth</p>' +
      '<div class="dash-big">' + AIO.formatEUR(nw.totalNetWorth) + '</div>' +
      '<p class="dash-sub">' + AIO.formatEUR(nw.totalAssets) + ' assets, ' + AIO.formatEUR(nw.totalLiabilities) + ' liabilities</p>' +
      '<a class="recalc" href="net-worth/">Recalculate →</a>' +
      '</div>';
  }

  function fireCard(f) {
    var big = (f.yearsToFire == null) ? 'Over 100 yrs'
            : (f.yearsToFire <= 0 ? 'At FIRE' : f.yearsToFire.toFixed(1) + ' yrs');
    return '<div class="dash-card">' +
      '<p class="dash-label">Years to FIRE</p>' +
      '<div class="dash-big">' + big + '</div>' +
      '<p class="dash-sub">FIRE number ' + AIO.formatEUR(f.fireNumber) + '</p>' +
      '<a class="recalc" href="fire/">Recalculate →</a>' +
      '</div>';
  }

  // Decide the single synthesis message from the priority logic. Returns
  // { cls, lead(HTML), secondary(text) } or null for "no synthesis line".
  function synthesise(pen, em, penDone, emDone) {
    if (!emDone) return null; // emergency fund not run yet: no synthesis line

    var underfunded = em.current < em.target;

    if (underfunded) {
      var lead = 'Build your emergency fund first. You\'re <span class="accent">' +
        AIO.formatEUR(em.gap) + '</span> short of ' + em.months + ' months of coverage.';
      var secondary = penDone
        ? 'Once that\'s covered, worth knowing: your projected pension covers about ' + pctOf(pen) + '% of your current income.'
        : null;
      return { cls: 'warn', lead: lead, secondary: secondary };
    }

    // Emergency fund fully funded.
    if (penDone) {
      var stateCov = pctOf(pen);
      var hasPrivate = pen.private && isFinite(pen.private.fullCombined) &&
                       isFinite(pen.monthlyGrossSalary) && pen.monthlyGrossSalary > 0;

      if (hasPrivate) {
        // Combined % = (net state pension + private payout) / current monthly gross salary.
        var combinedCov = Math.round((pen.private.fullCombined / pen.monthlyGrossSalary) * 100);
        if (combinedCov >= 50) {
          return {
            cls: 'ok',
            lead: 'Your state pension alone covers about <span class="accent">' + stateCov + '%</span> of your current income. With your private pension included, that rises to <span class="accent">' + combinedCov + '%</span>.',
            secondary: 'A solid base. Keep it up, and top up further if you want more cushion.'
          };
        }
        return {
          cls: 'warn',
          lead: 'Your state pension alone covers about <span class="accent">' + stateCov + '%</span> of your current income. With your private pension, that rises to <span class="accent">' + combinedCov + '%</span>, still under half.',
          secondary: 'Consider increasing your monthly contribution or ETF investing to close the gap.'
        };
      }

      // No private pension yet: state-only coverage.
      if (stateCov >= 50) {
        return {
          cls: 'ok',
          lead: 'You\'re on track. Your projected pension covers about <span class="accent">' + stateCov + '%</span> of your current income, a reasonable base.',
          secondary: 'Consider topping up if you want more cushion.'
        };
      }
      return {
        cls: 'warn',
        lead: 'Your projected pension covers only about <span class="accent">' + stateCov + '%</span> of your current income.',
        secondary: 'Consider a private pension (Riester or Rürup) or ETF investing to close the gap.'
      };
    }

    // Emergency fund funded, pension not run yet: soft nudge only.
    return {
      cls: 'info',
      lead: 'Your emergency fund is set.',
      secondary: 'Next, try the pension calculator to see how your retirement is shaping up.'
    };
  }

  /* ---------------- data tools: export / import / clear / image ---------------- */
  // Cached exchange rates are not user data, so they are excluded from export/import.
  // ('aio:eurinr' is the pre-multi-currency cache key, kept here for older backups.)
  var RATE_KEYS = { 'aio:rates': 1, 'aio:eurinr': 1 };
  function isRateKey(k) { return RATE_KEYS[k] === 1; }

  function allAioKeys() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('aio:') === 0) keys.push(k);
    }
    return keys;
  }
  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function setMsg(text, cls) {
    var m = document.getElementById('dataMsg');
    if (!m) return;
    m.textContent = text;
    m.className = 'data-tools-msg' + (cls ? ' ' + cls : '');
  }

  // Export all calculator data (but not the cached exchange rate) as one JSON file.
  function exportData() {
    var data = {};
    allAioKeys().forEach(function (k) {
      if (isRateKey(k)) return;
      var raw = localStorage.getItem(k);
      try { data[k] = JSON.parse(raw); } catch (e) { data[k] = raw; }
    });
    if (Object.keys(data).length === 0) { setMsg('Nothing to export yet.', 'err'); return; }
    var payload = { app: 'all-in-one', type: 'all-in-one-data', version: 1, exportedAt: new Date().toISOString(), data: data };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'all-in-one-data-' + todayStr() + '.json');
    setMsg('Exported your data.', 'ok');
  }

  // Import a previously exported file. Validates structure; never wipes existing data on failure.
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(reader.result); }
      catch (e) { setMsg('That file is not valid JSON.', 'err'); return; }
      var looksRight = payload && typeof payload === 'object' &&
        (payload.app === 'all-in-one' || payload.type === 'all-in-one-data') &&
        payload.data && typeof payload.data === 'object';
      if (!looksRight) { setMsg('That does not look like an All-in-One backup file.', 'err'); return; }

      var written = 0;
      Object.keys(payload.data).forEach(function (k) {
        if (k.indexOf('aio:') === 0 && !isRateKey(k)) {
          try { localStorage.setItem(k, JSON.stringify(payload.data[k])); written++; } catch (e) {}
        }
      });
      if (written === 0) { setMsg('No calculator data found in that file.', 'err'); return; }
      setMsg('Imported ' + written + ' item' + (written === 1 ? '' : 's') + '. Refreshing…', 'ok');
      setTimeout(function () { location.reload(); }, 500);
    };
    reader.onerror = function () { setMsg('Could not read that file.', 'err'); };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!window.confirm('This will erase all calculator data. Continue?')) return;
    allAioKeys().forEach(function (k) { localStorage.removeItem(k); });
    location.reload(); // back to the empty homepage state
  }

  function exportImage() {
    var target = document.getElementById('dashCapture');
    var btn = document.getElementById('exportImgBtn');
    if (!target || typeof html2canvas === 'undefined') { setMsg('Image export is unavailable.', 'err'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Rendering…'; }
    html2canvas(target, { backgroundColor: '#0b0b0c', scale: 2, logging: false }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        if (blob) downloadBlob(blob, 'all-in-one-dashboard-' + todayStr() + '.png');
        if (btn) { btn.disabled = false; btn.textContent = 'Export as image'; }
      }, 'image/png');
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Export as image'; }
      setMsg('Could not render the image.', 'err');
    });
  }

  function wireDataTools() {
    var ex = document.getElementById('exportDataBtn');
    var im = document.getElementById('importDataBtn');
    var fileIn = document.getElementById('importFileInput');
    var clr = document.getElementById('clearDataBtn');
    if (ex) ex.addEventListener('click', exportData);
    if (im && fileIn) {
      im.addEventListener('click', function () { fileIn.click(); });
      fileIn.addEventListener('change', function () {
        if (fileIn.files && fileIn.files[0]) importData(fileIn.files[0]);
        fileIn.value = '';
      });
    }
    if (clr) clr.addEventListener('click', clearAllData);
  }

  function init() {
    wireDataTools(); // export / import / clear are always available on the homepage

    var penSaved = AIO.load('aio:pension') || {};
    var emSaved = AIO.load('aio:emergency') || {};
    var nwSaved = AIO.load('aio:networth') || {};
    var fireSaved = AIO.load('aio:fire') || {};
    var pen = penSaved.result || null;
    var em = emSaved.result || null;
    var nw = nwSaved.result || null;
    var fire = fireSaved.result || null;

    // A calculator only counts as "calculated" once the user has actually changed
    // a field (touched flag), so an untouched calculator (or one left at 0/default)
    // never triggers a dashboard card.
    var penDone = penSaved.touched === true && !!(pen && isFinite(pen.netMonthly));
    var emDone = emSaved.touched === true && !!(em && isFinite(em.target));
    var nwDone = nwSaved.touched === true && !!(nw && isFinite(nw.totalNetWorth));
    var fireDone = fireSaved.touched === true && !!(fire && isFinite(fire.fireNumber));

    if (!penDone && !emDone && !nwDone && !fireDone) return; // nothing run: plain card grid

    var cardsHTML = '';
    if (penDone) cardsHTML += penCard(pen);
    if (emDone) cardsHTML += emCard(em);
    if (nwDone) cardsHTML += nwCard(nw);   // net worth sits alongside as another card
    if (fireDone) cardsHTML += fireCard(fire);
    document.getElementById('dashCards').innerHTML = cardsHTML;

    // Existing emergency-first / pension-gap priority messaging, unchanged.
    var synth = synthesise(pen, em, penDone, emDone);
    var synthEl = document.getElementById('synthesis');
    if (synth) {
      synthEl.className = 'synthesis ' + synth.cls;
      synthEl.innerHTML = '<p class="lead">' + synth.lead + '</p>' +
        (synth.secondary ? '<p class="secondary">' + synth.secondary + '</p>' : '');
      synthEl.hidden = false;
    }

    // Separate net-worth nudge: net worth known but no emergency fund target yet.
    if (nwDone && !emDone) {
      var nudge = document.getElementById('nwNudge');
      nudge.innerHTML = '<p class="lead">You\'ve mapped a net worth of <span class="accent">' + AIO.formatEUR(nw.totalNetWorth) +
        '</span>. Have you calculated your emergency fund target?</p>' +
        '<p class="secondary"><a href="emergency-fund/">Open the Emergency Fund Calculator →</a></p>';
      nudge.hidden = false;
    }

    document.getElementById('dashboard').hidden = false;

    // A calculator shown in the dashboard drops out of the grid below; the grid
    // keeps the not-yet-run calculators (and the coming-soon cards) as prompts.
    if (penDone) hideCard('pension');
    if (emDone) hideCard('emergency');
    if (nwDone) hideCard('networth');
    if (fireDone) hideCard('fire');
    document.getElementById('gridHeading').hidden = false;

    // Export-as-image is only relevant once the dashboard is showing.
    var eb = document.getElementById('exportImgBtn');
    if (eb) eb.addEventListener('click', exportImage);
  }

  function hideCard(calc) {
    var c = document.querySelector('.calc-card[data-calc="' + calc + '"]');
    if (c) c.hidden = true;
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
