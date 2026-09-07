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

  function bnCard(bn) {
    return '<div class="dash-card">' +
      '<p class="dash-label">Net monthly salary <span class="dash-sublabel">(' + bn.label + ')</span></p>' +
      '<div class="dash-big">' + AIO.formatEUR(bn.netto) + '</div>' +
      '<p class="dash-sub">' + AIO.formatEUR(bn.brutto) + ' gross → ' + AIO.formatEUR(bn.netto) + ' net</p>' +
      '<a class="recalc" href="brutto-netto/">Recalculate →</a>' +
      '</div>';
  }
  function sjCard(sj) {
    var sub = sj.refund == null ? 'Second job is a tax-free Minijob'
            : (sj.refund > 0 ? 'Est. refund at filing ' + AIO.formatEUR(sj.refund) : 'No refund expected');
    return '<div class="dash-card">' +
      '<p class="dash-label">Combined monthly net <span class="dash-sublabel">(both jobs)</span></p>' +
      '<div class="dash-big">' + AIO.formatEUR(sj.combinedNet) + '</div>' +
      '<p class="dash-sub">' + sub + '</p>' +
      '<a class="recalc" href="second-job/">Recalculate →</a>' +
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

  function loadInGermany() { return AIO.load('aio:inGermany') === false ? false : true; } // default ON

  function init() {
    wireDataTools(); // export / import / clear are always available on the homepage
    var eb = document.getElementById('exportImgBtn');
    if (eb) eb.addEventListener('click', exportImage);

    var inGermany = loadInGermany();
    var toggle = document.getElementById('inGermanyToggle');
    if (toggle) {
      toggle.checked = inGermany;
      toggle.addEventListener('change', function () {
        inGermany = toggle.checked;
        AIO.save('aio:inGermany', inGermany);
        renderAll(inGermany);
      });
    }
    renderAll(inGermany);
  }

  function resetGridCards() {
    var cards = document.querySelectorAll('.card-grid .calc-card');
    for (var i = 0; i < cards.length; i++) cards[i].hidden = false;
  }

  function renderAll(inGermany) {
    document.getElementById('grpGermany').hidden = !inGermany;
    renderDashboard(inGermany);
  }

  function renderDashboard(inGermany) {
    var penSaved = AIO.load('aio:pension') || {};
    var emSaved = AIO.load('aio:emergency') || {};
    var nwSaved = AIO.load('aio:networth') || {};
    var fireSaved = AIO.load('aio:fire') || {};
    var bnSaved = AIO.load('aio:bruttonetto') || {};
    var sjSaved = AIO.load('aio:secondjob') || {};
    var pen = penSaved.result || null, em = emSaved.result || null, nw = nwSaved.result || null,
        fire = fireSaved.result || null, bn = bnSaved.result || null, sj = sjSaved.result || null;

    // A calculator counts as "calculated" only once the user touched a field.
    var penDone = penSaved.touched === true && !!(pen && isFinite(pen.netMonthly));
    var emDone = emSaved.touched === true && !!(em && isFinite(em.target));
    var nwDone = nwSaved.touched === true && !!(nw && isFinite(nw.totalNetWorth));
    var fireDone = fireSaved.touched === true && !!(fire && isFinite(fire.fireNumber));
    var bnDone = bnSaved.touched === true && !!(bn && isFinite(bn.netto));
    var sjDone = sjSaved.touched === true && !!(sj && isFinite(sj.combinedNet));

    // Germany-group results only show when the region toggle is on.
    var penInc = penDone && inGermany, bnInc = bnDone && inGermany, sjInc = sjDone && inGermany;
    var emInc = emDone, nwInc = nwDone, fireInc = fireDone;

    resetGridCards();

    var gerHTML = '';
    if (penInc) gerHTML += penCard(pen);
    if (bnInc) gerHTML += bnCard(bn);
    if (sjInc) gerHTML += sjCard(sj);
    document.getElementById('dashCardsGermany').innerHTML = gerHTML;
    document.getElementById('dashGrpGermany').hidden = (gerHTML === '');

    var genHTML = '';
    if (nwInc) genHTML += nwCard(nw);
    if (emInc) genHTML += emCard(em);
    if (fireInc) genHTML += fireCard(fire);
    document.getElementById('dashCardsGeneral').innerHTML = genHTML;
    document.getElementById('dashGrpGeneral').hidden = (genHTML === '');

    // Emergency-first / pension-gap synthesis (pension only when in the Germany view).
    var synth = synthesise(pen, em, penInc, emInc);
    var synthEl = document.getElementById('synthesis');
    if (synth) {
      synthEl.className = 'synthesis ' + synth.cls;
      synthEl.innerHTML = '<p class="lead">' + synth.lead + '</p>' +
        (synth.secondary ? '<p class="secondary">' + synth.secondary + '</p>' : '');
      synthEl.hidden = false;
    } else { synthEl.hidden = true; }

    var nudge = document.getElementById('nwNudge');
    if (nwInc && !emInc) {
      nudge.innerHTML = '<p class="lead">You\'ve mapped a net worth of <span class="accent">' + AIO.formatEUR(nw.totalNetWorth) +
        '</span>. Have you calculated your emergency fund target?</p>' +
        '<p class="secondary"><a href="emergency-fund/">Open the Emergency Fund Calculator →</a></p>';
      nudge.hidden = false;
    } else { nudge.hidden = true; }

    document.getElementById('dashboard').hidden = !(gerHTML !== '' || genHTML !== '');

    // Cards shown in the dashboard drop out of the grid below.
    if (penInc) hideCard('pension');
    if (bnInc) hideCard('bruttonetto');
    if (sjInc) hideCard('secondjob');
    if (nwInc) hideCard('networth');
    if (emInc) hideCard('emergency');
    if (fireInc) hideCard('fire');
  }

  function hideCard(calc) {
    var c = document.querySelector('.calc-card[data-calc="' + calc + '"]');
    if (c) c.hidden = true;
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
