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
    var html = '<div class="dash-card">' +
      '<p class="dash-label">Net monthly pension <span class="dash-sublabel">(full career)</span></p>' +
      '<div class="dash-big">' + AIO.formatEUR(pen.netMonthly) + '</div>' +
      '<p class="dash-sub">Assumes working to retirement age with no relocation.</p>';
    // If the "leave Germany" scenario was calculated, show it alongside so neither
    // number is ever read in isolation.
    if (pen.leave && isFinite(pen.leave.grossMonthly)) {
      html += '<p class="dash-leave">If you leave in ' + pen.leave.year + ': ' +
        AIO.formatEUR(pen.leave.grossMonthly) + '/mo</p>';
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
      var cov = pctOf(pen);
      if (cov >= 50) {
        return {
          cls: 'ok',
          lead: 'You\'re on track. Your projected pension covers about <span class="accent">' + cov + '%</span> of your current income, a reasonable base.',
          secondary: 'Consider topping up if you want more cushion.'
        };
      }
      return {
        cls: 'warn',
        lead: 'Your projected pension covers only about <span class="accent">' + cov + '%</span> of your current income.',
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

  function init() {
    var penSaved = AIO.load('aio:pension') || {};
    var emSaved = AIO.load('aio:emergency') || {};
    var nwSaved = AIO.load('aio:networth') || {};
    var fireSaved = AIO.load('aio:fire') || {};
    var pen = penSaved.result || null;
    var em = emSaved.result || null;
    var nw = nwSaved.result || null;
    var fire = fireSaved.result || null;

    var penDone = !!(pen && isFinite(pen.netMonthly));
    var emDone = !!(em && isFinite(em.target));
    var nwDone = !!(nw && isFinite(nw.totalNetWorth));
    var fireDone = !!(fire && isFinite(fire.fireNumber));

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
  }

  function hideCard(calc) {
    var c = document.querySelector('.calc-card[data-calc="' + calc + '"]');
    if (c) c.hidden = true;
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
