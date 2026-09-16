/* ---------------------------------------------------------------------------
   Monthly Budget Calculator: net income vs dynamic expense categories, surplus
   or deficit, and a 50/30/20 (needs / wants / savings) comparison. Each category
   is assigned to one bucket (editable per row). Uses the shared window.AIO
   helpers (formatting, rate, storage). Everything stays in the browser.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'aio:budget';
  // Starter categories with a sensible default 50/30/20 bucket each.
  var STARTER = [
    { name: 'Rent / Housing', amount: '', bucket: 'needs' },
    { name: 'Groceries', amount: '', bucket: 'needs' },
    { name: 'Transport', amount: '', bucket: 'needs' },
    { name: 'Insurance', amount: '', bucket: 'needs' },
    { name: 'Subscriptions', amount: '', bucket: 'wants' },
    { name: 'Entertainment', amount: '', bucket: 'wants' },
    { name: 'Savings / Investments', amount: '', bucket: 'savings' }
  ];
  var BUCKETS = [
    { id: 'needs', label: 'Needs', target: 0.50 },
    { id: 'wants', label: 'Wants', target: 0.30 },
    { id: 'savings', label: 'Savings', target: 0.20 }
  ];
  var BUCKET_BY_ID = {};
  BUCKETS.forEach(function (b) { BUCKET_BY_ID[b.id] = b; });

  var els = {};
  var rows = [];             // [{ nameEl, amtEl, bucketEl, row }]
  var lastResult = null;
  var userTouched = false;   // gates the homepage dashboard

  function $(id) { return document.getElementById(id); }
  function numVal(el) {
    var v = el.value;
    if (v.trim() === '') return 0;
    var n = AIO.parseNumber(v); // sanitizes thousands separators
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* ---------------- dynamic category rows ---------------- */
  function addRow(name, amount, bucket) {
    var row = document.createElement('div');
    row.className = 'bud-row';

    var nameEl = document.createElement('input');
    nameEl.type = 'text';
    nameEl.placeholder = 'Category name';
    nameEl.setAttribute('aria-label', 'Category name');
    if (name != null) nameEl.value = name;

    var amtEl = document.createElement('input');
    amtEl.type = 'text';
    amtEl.className = 'amt';
    amtEl.inputMode = 'numeric';
    amtEl.placeholder = '0';
    amtEl.setAttribute('aria-label', 'Monthly amount (euros)');
    if (amount != null && amount !== '') amtEl.value = amount;

    var bucketEl = document.createElement('select');
    bucketEl.className = 'field-select bud-bucket';
    bucketEl.setAttribute('aria-label', 'Which 50/30/20 bucket');
    for (var i = 0; i < BUCKETS.length; i++) {
      var o = document.createElement('option');
      o.value = BUCKETS[i].id; o.textContent = BUCKETS[i].label;
      bucketEl.appendChild(o);
    }
    bucketEl.value = BUCKET_BY_ID[bucket] ? bucket : 'needs';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nw-cat-remove';
    removeBtn.setAttribute('aria-label', 'Remove this category');
    removeBtn.textContent = '×';

    var entry = { nameEl: nameEl, amtEl: amtEl, bucketEl: bucketEl, row: row };
    removeBtn.addEventListener('click', function () {
      userTouched = true;
      var idx = rows.indexOf(entry);
      if (idx > -1) rows.splice(idx, 1);
      row.parentNode.removeChild(row);
      compute();
    });
    nameEl.addEventListener('input', function () { userTouched = true; compute(); });
    amtEl.addEventListener('input', function () { userTouched = true; compute(); });
    bucketEl.addEventListener('change', function () { userTouched = true; compute(); });

    row.appendChild(nameEl);
    row.appendChild(amtEl);
    row.appendChild(bucketEl);
    row.appendChild(removeBtn);
    els.budList.appendChild(row);
    rows.push(entry);
    return entry;
  }

  function anyEntered() {
    if (els.budIncome.value.trim() !== '') return true;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].amtEl.value.trim() !== '' || rows[i].nameEl.value.trim() !== '') return true;
    }
    return false;
  }

  /* ---------------- compute + render ---------------- */
  function compute() {
    if (!anyEntered()) { render(null); persist(null); return; }

    var income = numVal(els.budIncome);
    var totalAllocated = 0;
    var buckets = { needs: 0, wants: 0, savings: 0 };
    var cats = [];
    for (var i = 0; i < rows.length; i++) {
      var amt = numVal(rows[i].amtEl);
      var bucket = rows[i].bucketEl.value;
      var name = rows[i].nameEl.value.trim();
      totalAllocated += amt;
      if (buckets[bucket] == null) bucket = 'needs';
      buckets[bucket] += amt;
      if (amt > 0) cats.push({ name: name || 'Category', amount: amt, bucket: bucket });
    }

    var r = {
      income: income,
      totalAllocated: totalAllocated,
      surplus: income - totalAllocated,
      needs: buckets.needs, wants: buckets.wants, savings: buckets.savings,
      cats: cats
    };
    lastResult = r;
    render(r);
    persist(r);
  }

  function pct(part, whole) { return whole > 0 ? (part / whole) * 100 : 0; }

  function render(r) {
    if (!r) {
      lastResult = null;
      els.budBalance.textContent = '–';
      els.budBalanceInr.textContent = '';
      els.budBalanceLabel.textContent = 'Left over each month';
      els.budBalance.classList.remove('result-good', 'result-bad');
      els.budTotalIncome.textContent = '–';
      els.budTotalAlloc.textContent = '–';
      els.budRuleBlock.hidden = true;
      els.budBreakdownBlock.hidden = true;
      els.budFireNudge.hidden = true;
      els.budMeta.textContent = 'Enter your income and expenses to see your budget.';
      return;
    }

    els.budTotalIncome.textContent = AIO.formatEUR(r.income);
    els.budTotalAlloc.textContent = AIO.formatEUR(r.totalAllocated);

    // Surplus / deficit headline, clearly flagged when negative.
    var deficit = r.surplus < 0;
    els.budBalance.classList.toggle('result-bad', deficit);
    els.budBalance.classList.toggle('result-good', r.surplus > 0);
    els.budBalanceLabel.textContent = deficit ? 'Over budget by' : 'Left over each month';
    els.budBalance.textContent = (deficit ? '−' : '') + AIO.formatEUR(Math.abs(r.surplus));
    renderBalanceConv();

    if (r.income > 0 && r.surplus < 0) {
      els.budMeta.textContent = 'You are spending more than you earn. Trim a category or raise your income to balance it.';
    } else if (r.income > 0) {
      els.budMeta.textContent = 'You have allocated ' + Math.round(pct(r.totalAllocated, r.income)) + '% of your income.';
    } else {
      els.budMeta.textContent = 'Add your monthly income to see your surplus and the 50/30/20 split.';
    }

    renderRule(r);
    renderBreakdown(r);
    renderFireNudge(r);
  }

  function renderBalanceConv() {
    if (!lastResult) { els.budBalanceInr.textContent = ''; return; }
    var rate = AIO.getRate();
    if (AIO.getCurrency() === 'EUR' || rate == null) { els.budBalanceInr.textContent = ''; return; }
    var sign = lastResult.surplus < 0 ? '−' : '';
    els.budBalanceInr.textContent = '≈ ' + sign + AIO.formatAmount(Math.abs(lastResult.surplus) * rate);
  }

  // 50/30/20: actual % of income per bucket vs the benchmark, flag over/under.
  function renderRule(r) {
    if (!(r.income > 0) || r.totalAllocated <= 0) { els.budRuleBlock.hidden = true; return; }
    var html = '';
    for (var i = 0; i < BUCKETS.length; i++) {
      var b = BUCKETS[i];
      var amt = r[b.id];
      var actualPct = pct(amt, r.income);
      var targetPct = b.target * 100;
      var targetAmt = b.target * r.income;
      var diff = actualPct - targetPct;
      var status, cls;
      if (Math.abs(diff) < 2) { status = 'on target'; cls = 'ok'; }
      else if (b.id === 'savings') { // more savings is good, less is a shortfall
        status = diff > 0 ? Math.round(diff) + ' pts above target' : Math.round(-diff) + ' pts below target';
        cls = diff > 0 ? 'ok' : 'warn';
      } else { // needs / wants: over benchmark is the risk
        status = diff > 0 ? Math.round(diff) + ' pts over' : Math.round(-diff) + ' pts under';
        cls = diff > 0 ? 'warn' : 'ok';
      }
      var barW = Math.max(0, Math.min(100, actualPct));
      html +=
        '<div class="bud-rule-row">' +
          '<div class="bud-rule-top">' +
            '<span class="bud-rule-name">' + b.label + '</span>' +
            '<span class="bud-rule-fig">' + Math.round(actualPct) + '% <span class="bud-rule-target">of ' + Math.round(targetPct) + '%</span></span>' +
          '</div>' +
          '<div class="bud-track"><div class="bud-fill ' + cls + '" style="width:' + barW + '%"></div>' +
            '<span class="bud-target-mark" style="left:' + targetPct + '%"></span></div>' +
          '<div class="bud-rule-foot"><span class="bud-badge ' + cls + '">' + status + '</span>' +
            '<span class="bud-rule-amt">' + AIO.formatEUR(amt) + ' of ' + AIO.formatEUR(targetAmt) + '</span></div>' +
        '</div>';
    }
    els.budRule.innerHTML = html;
    els.budRuleBlock.hidden = false;
  }

  // Simple visual: each category as a share of income (falls back to allocated
  // if no income is entered yet).
  function renderBreakdown(r) {
    if (r.cats.length === 0) { els.budBreakdownBlock.hidden = true; return; }
    var base = r.income > 0 ? r.income : r.totalAllocated;
    var sorted = r.cats.slice().sort(function (a, b) { return b.amount - a.amount; });
    var html = '';
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      var p = pct(c.amount, base);
      html +=
        '<div class="bud-bar-row">' +
          '<div class="bud-bar-top"><span class="bud-bar-name bucket-' + c.bucket + '">' + escapeHtml(c.name) + '</span>' +
            '<span class="bud-bar-fig">' + AIO.formatEUR(c.amount) + ' · ' + Math.round(p) + '%</span></div>' +
          '<div class="bud-track"><div class="bud-fill bucket-' + c.bucket + '" style="width:' + Math.max(0, Math.min(100, p)) + '%"></div></div>' +
        '</div>';
    }
    els.budBars.innerHTML = html;
    els.budBreakdownBlock.hidden = false;
  }

  // Cross-calculator nudge: surplus + FIRE not yet calculated.
  function renderFireNudge(r) {
    var fireSaved = AIO.load('aio:fire');
    var fireDone = fireSaved && fireSaved.touched === true && fireSaved.result && isFinite(fireSaved.result.fireNumber);
    if (r.income > 0 && r.surplus > 0 && !fireDone) {
      els.budFireNudge.innerHTML = 'You have <strong>' + AIO.formatEUR(r.surplus) + '</strong> left over each month. ' +
        '<a href="../fire/">See how fast that gets you to financial independence →</a>';
      els.budFireNudge.hidden = false;
    } else {
      els.budFireNudge.hidden = true;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- persistence ---------------- */
  function serializeRows() {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({ name: rows[i].nameEl.value, amount: rows[i].amtEl.value, bucket: rows[i].bucketEl.value });
    }
    return out;
  }
  function persist(result) {
    // Dashboard needs the split status; store a compact result summary.
    var summary = null;
    if (result) {
      summary = {
        income: result.income,
        totalAllocated: result.totalAllocated,
        surplus: result.surplus,
        needsPct: Math.round(pct(result.needs, result.income)),
        wantsPct: Math.round(pct(result.wants, result.income)),
        savingsPct: Math.round(pct(result.savings, result.income))
      };
    }
    var s = { result: summary, touched: userTouched, income: els.budIncome.value, categories: serializeRows() };
    AIO.save(KEY, s);
  }
  function restore() {
    var s = AIO.load(KEY);
    if (!s) return false;
    if (s.touched) userTouched = true;
    if (s.income != null && s.income !== '') els.budIncome.value = s.income;
    if (Array.isArray(s.categories)) {
      for (var i = 0; i < s.categories.length; i++) {
        addRow(s.categories[i].name, s.categories[i].amount, s.categories[i].bucket);
      }
      return true;
    }
    return false;
  }

  function seedStarter() {
    for (var i = 0; i < STARTER.length; i++) addRow(STARTER[i].name, STARTER[i].amount, STARTER[i].bucket);
  }

  function init() {
    ['budIncome', 'budList', 'budAddBtn', 'budBalance', 'budBalanceInr', 'budBalanceLabel',
     'budTotalIncome', 'budTotalAlloc', 'budRuleBlock', 'budRule', 'budBreakdownBlock', 'budBars',
     'budMeta', 'budFireNudge'].forEach(function (id) { els[id] = $(id); });

    var hadSaved = restore();
    if (!hadSaved) seedStarter();

    els.budIncome.addEventListener('input', function () { userTouched = true; compute(); });
    els.budAddBtn.addEventListener('click', function () {
      userTouched = true;
      addRow('', '', 'needs').nameEl.focus();
    });
    AIO.onRate(renderBalanceConv);
    compute();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
