/* ============================================================
   finance.js — Finance board views
     NS.views.finance     : one school's board (Overview + Details tabs)
     NS.views.financeAll  : all-schools summary built from the four boards
   Render functions return HTML strings; app.js owns state and events.
   Editable fields carry data-path="dotted.path" — app.js writes them back.

   Where the numbers come from (see NS.rollup in core.js):
     line items (Details) → overview categories → KPIs → all-schools summary → databoard.
   A category is only typed directly on the Overview when it has no line items.
   ============================================================ */
(function () {
  var NS = window.SNSW, esc = NS.esc, fmt = NS.fmt, fmt$ = NS.fmt$, health = NS.health, DK = NS.DK;

  /* ---------- small building blocks ---------- */
  function dot(c, title) { return '<span class="dot dot-' + c + '" title="' + esc(title || (NS.STATUS[c] ? NS.STATUS[c].label : '')) + '"></span>'; }
  function num(ctx, path, val) {
    return ctx.editing ? '<input class="num" type="number" data-path="' + path + '" value="' + (Number(val) || 0) + '">' : fmt(val);
  }
  // A figure that is calculated from line items — shown, never typed
  function calc(val) { return '<td class="calc" title="Calculated from the line items on the Details tab">' + fmt(val) + '</td>'; }
  function varCell(v, colour) { return '<td class="c-' + colour + ' strong">' + fmt(v) + '</td>'; }
  function signed$(v) { return (v < 0 ? '−' : '+') + fmt$(Math.abs(v)); }

  // Paired horizontal bars: budget (blue) vs actual (gold), values labelled beside each row.
  function hbars(rows, isIncome, opts) {
    opts = opts || {};
    var max = 1;
    rows.forEach(function (r) { max = Math.max(max, Math.abs(r.budget), Math.abs(r.actual)); });
    var h = '<div class="legend"><span><i class="swatch sw-budget"></i>Budget</span><span><i class="swatch sw-actual"></i>Actual</span>' +
      '<span class="legend-note">' + (isIncome ? 'Actual longer than budget = ahead' : 'Actual shorter than budget = under budget') + '</span></div>';
    rows.forEach(function (r) {
      if (!r.budget && !r.actual) return;
      var hh = health(r, isIncome);
      var w1 = Math.max(1, Math.abs(r.budget) / max * 100), w2 = Math.max(1, Math.abs(r.actual) / max * 100);
      var tip = esc(r.label) + ' — budget ' + fmt$(r.budget) + ', actual ' + fmt$(r.actual) + ' (' + signed$(hh.varAmt) + ' ' + (hh.varAmt >= 0 ? 'favourable' : 'unfavourable') + ')';
      h += '<div class="hbar-row" title="' + tip + '">' +
        '<div class="hbar-label">' + (opts.link ? '<a href="' + opts.link(r) + '">' + esc(r.label) + '</a>' : esc(r.label)) + '</div>' +
        '<div class="hbar-track"><div class="hbar hbar-budget" style="width:' + w1 + '%"></div><div class="hbar hbar-actual" style="width:' + w2 + '%"></div></div>' +
        '<div class="hbar-val"><span>' + fmt$(r.budget) + '</span><span>' + fmt$(r.actual) + '</span></div>' +
        '<div class="hbar-var"><span class="chip chip-' + hh.colour + '">' + signed$(hh.varAmt) + '</span></div>' +
        '</div>';
    });
    return h;
  }

  function kpi(label, value, sub, colour, delta) {
    return '<div class="card kpi kpi-' + colour + '">' +
      '<div class="kpi-label">' + dot(colour) + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      '<div class="kpi-sub">' + sub + '</div>' +
      (delta ? '<div class="kpi-delta c-' + colour + '">' + delta + '</div>' : '') + '</div>';
  }

  /* ============================================================
     OVERVIEW TAB
     ============================================================ */
  function overview(d, ctx) {
    var c = NS.financeCalc(d), ru = c.rollup, inc = c.inc, exp = c.exp, sur = c.sur, mar = c.mar, ebida = c.ebida, surVar = c.surVar;
    var recon = NS.reconcile(ru);
    var h = '';

    // KPI tiles
    var cInc = NS.varColour(c.incVarPct), cExp = NS.varColour(-c.expVarPct);
    var cSur = surVar >= 0 ? 'green' : (surVar > -0.05 * Math.abs(sur.budget || 1) ? 'amber' : 'red');
    var cMar = mar.actual >= mar.budget ? 'green' : (mar.actual >= mar.budget - 2 ? 'amber' : 'red');
    h += '<div class="grid4">' +
      kpi('Income (YTD)', fmt$(inc.actual), 'Budget ' + fmt$(inc.budget), cInc,
        inc.actual - inc.budget >= 0 ? fmt$(inc.actual - inc.budget) + ' ahead of budget' : fmt$(Math.abs(inc.actual - inc.budget)) + ' behind budget') +
      kpi('Spending (YTD)', fmt$(exp.actual), 'Budget ' + fmt$(exp.budget), cExp,
        exp.actual - exp.budget <= 0 ? fmt$(Math.abs(exp.actual - exp.budget)) + ' under budget' : fmt$(exp.actual - exp.budget) + ' over budget') +
      kpi('Surplus / (deficit)', fmt$(sur.actual), 'Budget ' + fmt$(sur.budget), cSur, fmt$(Math.abs(surVar)) + (surVar >= 0 ? ' ahead' : ' behind')) +
      kpi('Operating margin', NS.pct(mar.actual), 'EBIDA basis · budget ' + NS.pct(mar.budget), cMar,
        (mar.actual - mar.budget >= 0 ? '+' : '−') + Math.abs(mar.actual - mar.budget).toFixed(1) + ' pts vs budget') +
      '</div>';

    // Going well / needs attention
    var rows = ru.income.map(function (r) { return health(r, true); }).concat(ru.expenditure.map(function (r) { return health(r, false); }));
    var good = rows.filter(function (r) { return r.varAmt > 0; }).sort(function (a, b) { return b.varAmt - a.varAmt; }).slice(0, 5);
    var bad = rows.filter(function (r) { return r.varAmt < 0; }).sort(function (a, b) { return a.varAmt - b.varAmt; }).slice(0, 5);
    h += '<div class="grid2">' +
      '<div class="card"><h2 class="h-blue">&#9989; Going well</h2><ul class="health">' +
      (good.length ? good.map(function (r) { return '<li><span class="catcell">' + dot('green', 'Favourable') + esc(r.label) + '</span><span class="amt c-green">' + fmt$(r.varAmt) + ' favourable</span></li>'; }).join('')
        : '<li class="muted">Enter this period’s figures to see highlights.</li>') + '</ul></div>' +
      '<div class="card"><h2 class="h-red">&#9888;&#65039; Needs attention</h2><ul class="health">' +
      (bad.length ? bad.map(function (r) { return '<li><span class="catcell">' + dot(r.colour, 'Unfavourable') + esc(r.label) + '</span><span class="amt c-' + r.colour + '">' + fmt$(Math.abs(r.varAmt)) + ' unfavourable</span></li>'; }).join('')
        : '<li class="muted">Nothing flagged — all categories on or better than budget. &#127881;</li>') + '</ul></div>' +
      '</div>';

    // Charts
    h += '<div class="grid2">' +
      '<div class="card"><h2 class="h-blue">Income — budget vs actual (YTD)</h2>' + hbars(ru.income, true) + '</div>' +
      '<div class="card"><h2 class="h-blue">Spending — budget vs actual (YTD)</h2>' + hbars(ru.expenditure, false) + '</div>' +
      '</div>';

    // Summary table
    // Every figure on this tab is a result — nothing here is typed. Categories without line items show
    // their carried figure until lines are entered on the Details tab.
    function cell(row, k) {
      return row.computed ? calc(row[k]) : '<td class="calc" title="No line items yet — enter them on the Details tab">' + fmt(row[k]) + '</td>';
    }
    function catCells(row) { return cell(row, 'budget') + cell(row, 'actual'); }
    function catTail(row) { return cell(row, 'annualBudget') + cell(row, 'eoyEstimate'); }
    function catLabel(row, hh) {
      return '<td><span class="catcell">' + dot(hh.colour) + esc(row.label) +
        (row.computed ? '<span class="calc-mark" title="Calculated from ' + (row.groups.length ? esc(row.groups.join(', ')) : 'line items') + ' on the Details tab">&#9638;</span>' : '') +
        '</span></td>';
    }
    var anyComputed = ru.income.concat(ru.expenditure).some(function (r) { return r.computed; });
    var anyManual = ru.income.concat(ru.expenditure).some(function (r) { return !r.computed; });
    h += '<div class="card scroll-x"><div class="card-head"><h2 class="h-blue">Summary — year to date &amp; end of year outlook</h2>' +
      '<span class="hint">' + (anyComputed ? '&#9638; = calculated from the Details tab' : 'Figures come from the Details tab') + (ctx.editing ? ' — nothing on this table is typed here' : '') + '</span></div>' +
      '<table class="ftable"><thead><tr><th>Category</th><th>YTD budget</th><th>YTD actual</th><th>Variance</th><th>Annual budget</th><th>Est. end of year</th></tr></thead><tbody>' +
      '<tr class="section-label"><td colspan="6">Income</td></tr>';
    ru.income.forEach(function (r) {
      var hh = health(r, true);
      h += '<tr>' + catLabel(r, hh) + catCells(r) + varCell(hh.varAmt, hh.colour) + catTail(r) + '</tr>';
    });
    h += '<tr class="total"><td>Total income</td><td>' + fmt(inc.budget) + '</td><td>' + fmt(inc.actual) + '</td>' +
      '<td class="c-' + (inc.actual >= inc.budget ? 'green' : 'red') + '">' + fmt(inc.actual - inc.budget) + '</td><td>' + fmt(inc.annual) + '</td><td>' + fmt(inc.eoy) + '</td></tr>';
    h += '<tr class="section-label"><td colspan="6">Expenditure</td></tr>';
    ru.expenditure.forEach(function (r) {
      var hh = health(r, false);
      h += '<tr>' + catLabel(r, hh) + catCells(r) + varCell(hh.varAmt, hh.colour) + catTail(r) + '</tr>';
      (r.sub || []).forEach(function (s) {
        var sv = s.budget - s.actual;
        var sc = sv >= 0 ? 'green' : (s.budget && sv / Math.abs(s.budget) > -0.05 ? 'amber' : 'red');
        h += '<tr class="subrow"><td>&#8627; of which: ' + esc(s.label) +
          (s.computed ? '<span class="calc-mark" title="Sum of the ' + s.lines + ' salary, casual and fringe-benefit lines in this category">&#9638;</span>' : '') + '</td>' +
          '<td>' + fmt(s.budget) + '</td><td>' + fmt(s.actual) + '</td>' + varCell(sv, sc) +
          '<td>' + fmt(s.annualBudget) + '</td><td>' + fmt(s.eoyEstimate) + '</td></tr>';
      });
    });
    h += '<tr class="total"><td>Total expenditure</td><td>' + fmt(exp.budget) + '</td><td>' + fmt(exp.actual) + '</td>' +
      '<td class="c-' + (exp.actual <= exp.budget ? 'green' : 'red') + '">' + fmt(exp.budget - exp.actual) + '</td><td>' + fmt(exp.annual) + '</td><td>' + fmt(exp.eoy) + '</td></tr>';
    h += '<tr class="surplus"><td>Surplus / (deficit)</td><td>' + fmt(sur.budget) + '</td><td>' + fmt(sur.actual) + '</td><td>' + fmt(surVar) + '</td><td>' + fmt(sur.annual) + '</td><td>' + fmt(sur.eoy) + '</td></tr>';
    h += '<tr class="ebida"><td>EBIDA (surplus + interest, depreciation &amp; amortisation)</td><td>' + fmt(ebida.budget) + '</td><td>' + fmt(ebida.actual) + '</td><td colspan="3">' +
      (ru.addback.computed
        ? '<span class="hint">Add-back ' + fmt$(ru.addback.ytdBudget) + ' / ' + fmt$(ru.addback.ytdActual) + ' from ' + ru.addback.lines + ' interest, depreciation &amp; amortisation line' + (ru.addback.lines === 1 ? '' : 's') + '</span>'
        : (ctx.editing ? '<span class="flexrow end">Add-back YTD budget ' + num(ctx, 'addback.ytdBudget', d.addback.ytdBudget) + ' actual ' + num(ctx, 'addback.ytdActual', d.addback.ytdActual) + '</span>'
          : '<span class="hint">Add-back ' + fmt$(ru.addback.ytdBudget) + ' / ' + fmt$(ru.addback.ytdActual) + '</span>')) + '</td></tr>';
    h += '</tbody></table><p class="fine">Sub-lines (“of which”) are included within their category total — they show the salary component, not an extra amount. Variance is favourable when positive: income ahead of budget, or spending under budget.' +
      (anyManual ? ' Categories without the &#9638; mark have no line items yet — enter them on the Details tab.' : '') + '</p></div>';

    // Reconciliation with the operating report's page 1
    if (recon.length) {
      h += '<div class="card accent-amber"><div class="card-head"><h2 class="h-amber">&#9878;&#65039; Reconciliation with the operating report</h2>' +
        (ctx.editing ? '<button class="btn btn-small btn-gold" data-action="align-reported" title="Replace the page 1 figures with the line-item totals">Use line-item figures</button>' : '') + '</div>' +
        '<p class="intro">The dashboard follows the line items. The figures below were typed from page 1 of the operating report and do not add up to the detail pages — worth a check with the accountant.</p><ul class="recon">' +
        recon.map(function (r) {
          return '<li><b>' + esc(r.label) + '</b> · ' + esc(r.field) + ': line items ' + fmt$(r.lines) + ', page 1 ' + fmt$(r.reported) +
            ' <span class="chip chip-amber">page 1 is ' + fmt$(Math.abs(r.diff)) + (r.diff > 0 ? ' lower' : ' higher') + '</span></li>';
        }).join('') + '</ul></div>';
    }

    // Loans & leases
    function finSection(key, title, emptyLabel) {
      var s = '<div class="card"><div class="card-head"><h2 class="h-blue">' + title + '</h2>' +
        (ctx.editing ? '<button class="btn btn-small btn-gold" data-action="add-' + key + '">+ Add</button>' : '') + '</div>';
      if (!d[key].length) {
        s += '<div class="empty muted">No current ' + emptyLabel + ' recorded.' + (ctx.editing ? ' Use + Add to record one.' : '') + '</div>';
      } else {
        d[key].forEach(function (r, i) {
          var p = key + '.' + i + '.';
          if (ctx.editing) {
            s += '<div class="item-card">' +
              '<input class="txt" data-path="' + p + 'name" placeholder="Name (e.g. Building loan – Bank)" value="' + esc(r.name) + '">' +
              '<div class="flexrow">' +
              '<input class="num" type="number" data-path="' + p + 'payment" value="' + (Number(r.payment) || 0) + '">' +
              '<input class="txt w-110" data-path="' + p + 'frequency" placeholder="Frequency" value="' + esc(r.frequency) + '">' +
              '<input class="txt grow" data-path="' + p + 'ends" placeholder="Ends / matures" value="' + esc(r.ends) + '">' +
              '<button class="btn-del" title="Remove" data-action="del-' + key + '" data-idx="' + i + '">&#10005;</button></div>' +
              '<input class="txt" data-path="' + p + 'notes" placeholder="Notes" value="' + esc(r.notes) + '">' +
              '</div>';
          } else {
            s += '<div class="item-card"><div class="row"><div><b>' + esc(r.name || 'Untitled') + '</b>' +
              (r.notes ? '<div class="notes">' + esc(r.notes) + '</div>' : '') +
              (r.ends ? '<div class="notes">Ends: ' + esc(r.ends) + '</div>' : '') + '</div>' +
              '<div class="pay-col"><div class="pay">' + fmt$(r.payment) + '</div><div class="freq">' + esc(r.frequency) + '</div></div></div></div>';
          }
        });
      }
      return s + '</div>';
    }
    h += '<div class="grid2">' + finSection('loans', '&#127974; Loan repayments', 'loans') + finSection('leases', '&#128196; Lease payments', 'leases') + '</div>';

    // Looking back
    var dc = Number(d.priorYear.debtorsCurrent) || 0, dp = Number(d.priorYear.debtorsPrior) || 0, dmax = Math.max(dc, dp, 1);
    h += '<div class="card"><h2 class="h-blue">&#128202; Looking back — how this year compares</h2><div class="looking">';
    h += '<div><div class="mini-label">Family debtors</div>';
    if (!dc && !dp && !ctx.editing) {
      h += '<div class="empty muted">Not yet entered — use “Edit board” to add this period’s and last year’s family debtors.</div>';
    } else {
      h += '<div class="hbar-row simple"><div class="hbar-label">This year</div><div class="hbar-track"><div class="hbar hbar-actual" style="width:' + Math.max(1, dc / dmax * 100) + '%"></div></div><div class="hbar-val"><span>' + fmt$(dc) + '</span></div></div>';
      h += '<div class="hbar-row simple"><div class="hbar-label">Last year</div><div class="hbar-track"><div class="hbar hbar-budget" style="width:' + Math.max(1, dp / dmax * 100) + '%"></div></div><div class="hbar-val"><span>' + fmt$(dp) + '</span></div></div>';
    }
    if (ctx.editing) h += '<div class="flexrow small">This year ' + num(ctx, 'priorYear.debtorsCurrent', dc) + ' Last year ' + num(ctx, 'priorYear.debtorsPrior', dp) + '</div>';
    h += '</div><div><div class="mini-label">Strategic note vs last year</div>' +
      (ctx.editing ? '<textarea data-path="priorYear.note" placeholder="e.g. Enrolment growth vs last year, debtor trends, one-off items…">' + esc(d.priorYear.note) + '</textarea>'
        : '<p class="comment-text">' + (d.priorYear.note ? esc(d.priorYear.note) : '<span class="muted">No note yet — add one in edit mode.</span>') + '</p>') +
      '</div></div></div>';

    // Comments
    function commentCard(key, title, cls, ph) {
      return '<div class="card ' + cls + '"><h2>' + title + '</h2>' +
        (ctx.editing ? '<textarea data-path="comments.' + key + '" placeholder="' + ph + '">' + esc(d.comments[key]) + '</textarea>'
          : '<p class="comment-text">' + (d.comments[key] ? esc(d.comments[key]) : '<span class="muted">' + ph + '</span>') + '</p>') + '</div>';
    }
    h += '<div class="grid2">' +
      commentCard('current', '&#128172; Current impacts', 'accent-blue', 'What’s affecting the numbers right now — e.g. staffing changes, enrolment movement, one-off costs…') +
      commentCard('upcoming', '&#128301; Planned &amp; upcoming impacts', 'accent-gold', 'What’s coming — e.g. planned capital works, new hires, fee changes, grant timing…') +
      '</div>';
    return h;
  }

  /* ============================================================
     DETAILS TAB — every line of the operating statement (the source of truth)
     ============================================================ */
  function rowEmpty(r) { return DK.every(function (k) { return !Number(r[k]); }); }
  function groupTot(g, k) { return g.rows.reduce(function (a, r) { return a + (Number(r[k]) || 0); }, 0); }
  function sectionTot(gs, k) { return gs.reduce(function (a, g) { return a + groupTot(g, k); }, 0); }
  function sectionEmpty(gs) { return gs.every(function (g) { return g.rows.every(rowEmpty); }); }
  function dVar(b, a, isIncome) { b = Number(b) || 0; a = Number(a) || 0; return isIncome ? a - b : b - a; }
  function dVarCell(v) { return varCell(v, v > 0 ? 'green' : (v < 0 ? 'red' : 'muted')); }
  function matches(r, q) { return !q || (String(r.code || '') + ' ' + String(r.label || '')).toLowerCase().indexOf(q) >= 0; }

  function detailTable(d, ctx, key, isIncome) {
    var groups = d.details[key], q = (ctx.filter || '').trim().toLowerCase(), E = ctx.editing, cols = E ? 8 : 7;
    var head = '<table class="ftable dtable"><thead><tr><th>Code</th><th>Line item</th><th>YTD budget</th><th>YTD actual</th><th>Variance</th><th>Annual budget</th><th>Est. end of year</th>' + (E ? '<th></th>' : '') + '</tr></thead><tbody>';
    var body = '', hidden = 0, shown = 0;
    groups.forEach(function (g, gi) {
      var rowsHtml = '';
      g.rows.forEach(function (r, ri) {
        if (q && !matches(r, q)) return;
        if (!q && !E && ctx.hideZeros && rowEmpty(r)) { hidden++; return; }
        shown++;
        var p = 'details.' + key + '.' + gi + '.rows.' + ri + '.';
        rowsHtml += '<tr>' +
          (E ? '<td class="code"><input class="txt code" data-path="' + p + 'code" value="' + esc(r.code || '') + '" placeholder="code"></td>' +
               '<td><input class="txt label" data-path="' + p + 'label" value="' + esc(r.label) + '" placeholder="Line item"></td>'
             : '<td class="code">' + esc(r.code || '') + '</td><td>' + esc(r.label) + '</td>') +
          '<td>' + num(ctx, p + 'budget', r.budget) + '</td><td>' + num(ctx, p + 'actual', r.actual) + '</td>' +
          dVarCell(dVar(r.budget, r.actual, isIncome)) +
          '<td>' + num(ctx, p + 'annualBudget', r.annualBudget) + '</td><td>' + num(ctx, p + 'eoyEstimate', r.eoyEstimate) + '</td>' +
          (E ? '<td><button class="btn-del" title="Remove this line" data-action="del-line" data-sec="' + key + '" data-gi="' + gi + '" data-ri="' + ri + '">&#10005;</button></td>' : '') +
          '</tr>';
      });
      if (q && !rowsHtml) return; // no matching lines in this group
      var gb = groupTot(g, 'budget'), ga = groupTot(g, 'actual');
      body += '<tr class="grouphead"><td colspan="' + cols + '"><span class="flexrow between">' + esc(g.group) +
        (E ? '<button class="btn btn-small btn-dashed" data-action="add-line" data-sec="' + key + '" data-gi="' + gi + '">+ Add line</button>' : '') + '</span></td></tr>' + rowsHtml +
        '<tr class="grouptot"><td></td><td>Total ' + esc(g.group.toLowerCase()) + '</td><td>' + fmt(gb) + '</td><td>' + fmt(ga) + '</td>' +
        dVarCell(dVar(gb, ga, isIncome)) + '<td>' + fmt(groupTot(g, 'annualBudget')) + '</td><td>' + fmt(groupTot(g, 'eoyEstimate')) + '</td>' + (E ? '<td></td>' : '') + '</tr>';
    });
    var tb = sectionTot(groups, 'budget'), ta = sectionTot(groups, 'actual'), te = sectionTot(groups, 'eoyEstimate');
    if (q && !shown) body += '<tr><td colspan="' + cols + '" class="muted center">No line items match “' + esc(ctx.filter) + '”.</td></tr>';
    body += '<tr class="granded"><td></td><td>Total ' + (isIncome ? 'income' : 'expenditure') + '</td><td>' + fmt(tb) + '</td><td>' + fmt(ta) + '</td><td>' + fmt(dVar(tb, ta, isIncome)) + '</td>' +
      '<td>' + fmt(sectionTot(groups, 'annualBudget')) + '</td><td>' + fmt(te) + '</td>' + (E ? '<td></td>' : '') + '</tr>';
    return { html: head + body + '</tbody></table>', hidden: hidden, budget: tb, actual: ta, eoy: te };
  }

  function details(d, ctx) {
    var c = NS.financeCalc(d), recon = NS.reconcile(c.rollup);
    var incEmpty = sectionEmpty(d.details.income), expEmpty = sectionEmpty(d.details.expenditure), allEmpty = incEmpty && expEmpty;
    var h = '<div class="card intro-card"><div><h2 class="h-blue">&#128209; Full line-item detail</h2><p class="intro">' +
      (allEmpty
        ? 'Every line of the operating statement lives here, grouped and coded the same way as the report. Nothing has been entered yet — until it is, the Overview uses the category totals typed there. Choose “Edit board” and the full account list appears, ready to type into.'
        : 'This is where the figures are entered. Each line carries its account code from the operating statement, and everything else — group subtotals, the Overview categories, the KPIs, the all-schools summary and the weekly databoard — is calculated from these lines.' +
        (ctx.editing ? ' <b>All lines are shown while editing,</b> including the empty ones. Use “+ Add line” to add an account.' : '')) +
      '</p></div></div>';

    function emptyCard(title) {
      return '<div class="card"><h2 class="h-blue">' + title + '</h2><div class="empty muted">Not yet entered. Use “Edit board” to fill in the line items from the operating report.</div></div>';
    }
    function section(title, key, isIncome, isEmpty) {
      if (isEmpty && !ctx.editing) return { html: emptyCard(title), t: null };
      var t = detailTable(d, ctx, key, isIncome);
      var rc = recon.filter(function (r) { return r.section === key; }).length;
      var html = '<div class="card scroll-x"><h2 class="h-blue">' + title + '</h2>' + t.html +
        (isEmpty ? '' : '<div class="ties"><div class="tie c-green">&#10003; The Overview categories, KPIs and all-schools summary are calculated from these lines</div>' +
          (rc ? '<div class="tie c-amber">&#9878;&#65039; ' + rc + ' figure' + (rc === 1 ? '' : 's') + ' typed from page 1 of the operating report differ' + (rc === 1 ? 's' : '') + ' from these lines — see “Reconciliation” on the Overview tab</div>' : '') + '</div>') +
        (t.hidden ? '<p class="fine">' + t.hidden + ' line(s) with no budget or actual are hidden. Use “Show empty lines” to see them.</p>' : '') +
        '</div>';
      return { html: html, t: t };
    }
    var si = section('Income — line by line', 'income', true, incEmpty);
    var se = section('Expenditure — line by line', 'expenditure', false, expEmpty);
    h += si.html + se.html;

    if (si.t && se.t && !allEmpty) {
      var ds = si.t.actual - se.t.actual, dsb = si.t.budget - se.t.budget;
      h += '<div class="card accent-blue"><h2 class="h-blue">Surplus / (deficit) from the line items</h2><ul class="health">' +
        '<li><span>YTD budget</span><span class="amt">' + fmt$(dsb) + '</span></li>' +
        '<li><span>YTD actual</span><span class="amt c-' + (ds >= 0 ? 'green' : 'red') + '">' + fmt$(ds) + '</span></li>' +
        '<li><span>Variance</span><span class="amt c-' + (ds - dsb >= 0 ? 'green' : 'red') + '">' + fmt$(ds - dsb) + '</span></li></ul>' +
        '<p class="fine">For income, a positive variance means ahead of budget. For expenditure, a positive variance means spending is under budget.</p></div>';
    }
    return h;
  }

  NS.views.finance = {
    render: function (d, ctx) { return ctx.tab === 'details' ? details(d, ctx) : overview(d, ctx); }
  };

  /* ============================================================
     ALL-SCHOOLS SUMMARY — consolidates the four finance boards
     boards: [{ school, data, calc }]
     ============================================================ */
  NS.views.financeAll = {
    render: function (boards) {
      var T = { incA: 0, incB: 0, expA: 0, expB: 0, surA: 0, surB: 0 };
      boards.forEach(function (b) {
        T.incA += b.calc.inc.actual; T.incB += b.calc.inc.budget;
        T.expA += b.calc.exp.actual; T.expB += b.calc.exp.budget;
        T.surA += b.calc.sur.actual; T.surB += b.calc.sur.budget;
      });
      var surVar = T.surA - T.surB, incVar = T.incA - T.incB, expVar = T.expA - T.expB;
      var h = '';

      // Hero tiles
      h += '<div class="grid4">' +
        kpi('Combined income (YTD)', NS.compact$(T.incA), 'Budget ' + NS.compact$(T.incB), NS.varColour(T.incB ? incVar / T.incB * 100 : 0),
          fmt$(Math.abs(incVar)) + (incVar >= 0 ? ' ahead of budget' : ' behind budget')) +
        kpi('Combined spending (YTD)', NS.compact$(T.expA), 'Budget ' + NS.compact$(T.expB), NS.varColour(T.expB ? -expVar / T.expB * 100 : 0),
          fmt$(Math.abs(expVar)) + (expVar <= 0 ? ' under budget' : ' over budget')) +
        kpi('Combined surplus (YTD)', NS.compact$(T.surA), 'Budget ' + NS.compact$(T.surB), surVar >= 0 ? 'green' : 'red',
          fmt$(Math.abs(surVar)) + (surVar >= 0 ? ' ahead' : ' behind')) +
        kpi('Boards reporting', boards.length + ' of ' + NS.schools.length,
          boards.map(function (b) { return b.school.short + ' · ' + esc(b.data.meta.asAt); }).join('<br>'), 'blue', '') +
        '</div>';

      // Per-school table
      h += '<div class="card scroll-x"><div class="card-head"><h2 class="h-blue">School by school</h2><span class="hint">Click a school to open its full board</span></div>' +
        '<table class="ftable stable"><thead><tr><th>School</th><th>Income YTD</th><th>vs budget</th><th>Spending YTD</th><th>vs budget</th><th>Surplus / (deficit)</th><th>vs budget</th><th>Margin</th></tr></thead><tbody>';
      boards.forEach(function (b) {
        var c = b.calc, s = b.school;
        var iv = c.inc.actual - c.inc.budget, ev = c.exp.budget - c.exp.actual, sv = c.surVar;
        var overall = NS.financeStatus(c);
        h += '<tr class="rowlink" data-href="#/finance/' + s.id + '">' +
          '<td><a class="school-link" href="#/finance/' + s.id + '"><i class="swatch" style="background:' + s.colour + '"></i><span><b>' + esc(s.name) + '</b><small>As at ' + esc(b.data.meta.asAt) + (b.data.meta.draft ? ' · <span class="badge badge-amber">placeholder</span>' : '') + '</small></span></a></td>' +
          '<td>' + fmt$(c.inc.actual) + '</td>' + varCell(iv, NS.varColour(c.incVarPct)) +
          '<td>' + fmt$(c.exp.actual) + '</td>' + varCell(ev, NS.varColour(-c.expVarPct)) +
          '<td><span class="catcell right">' + dot(overall) + fmt$(c.sur.actual) + '</span></td>' + varCell(sv, overall) +
          '<td>' + NS.pct(c.mar.actual) + '</td></tr>';
      });
      h += '<tr class="total"><td>All schools</td><td>' + fmt$(T.incA) + '</td>' + varCell(incVar, incVar >= 0 ? 'green' : 'red') +
        '<td>' + fmt$(T.expA) + '</td>' + varCell(-expVar, expVar <= 0 ? 'green' : 'red') +
        '<td>' + fmt$(T.surA) + '</td>' + varCell(surVar, surVar >= 0 ? 'green' : 'red') +
        '<td>' + NS.pct(T.incA ? (T.surA / T.incA * 100) : 0) + '</td></tr>';
      h += '</tbody></table><p class="fine">Variance is favourable when positive. Each school’s board is as at its own reporting month, so the combined figures mix periods where the months differ. Margin for the combined row is surplus over income (schools show EBIDA margin).</p></div>';

      // Chart + cross-school attention list
      var surRows = boards.map(function (b) { return { label: b.school.name, budget: b.calc.sur.budget, actual: b.calc.sur.actual, id: b.school.id }; });
      var flags = [];
      boards.forEach(function (b) {
        b.calc.rollup.income.forEach(function (r) { var hh = health(r, true); if (hh.varAmt < 0) flags.push({ s: b.school, h: hh }); });
        b.calc.rollup.expenditure.forEach(function (r) { var hh = health(r, false); if (hh.varAmt < 0) flags.push({ s: b.school, h: hh }); });
      });
      flags.sort(function (a, b) { return a.h.varAmt - b.h.varAmt; });
      h += '<div class="grid2">' +
        '<div class="card"><h2 class="h-blue">Surplus / (deficit) by school — budget vs actual (YTD)</h2>' +
        hbars(surRows, true, { link: function (r) { return '#/finance/' + r.id; } }) + '</div>' +
        '<div class="card"><h2 class="h-red">&#9888;&#65039; Needs attention across schools</h2><ul class="health">' +
        (flags.length ? flags.slice(0, 7).map(function (f) {
          return '<li><span class="catcell">' + dot(f.h.colour, 'Unfavourable') + '<a class="tag" href="#/finance/' + f.s.id + '">' + esc(f.s.short) + '</a>' + esc(f.h.label) + '</span>' +
            '<span class="amt c-' + f.h.colour + '">' + fmt$(Math.abs(f.h.varAmt)) + ' unfavourable</span></li>';
        }).join('') : '<li class="muted">Nothing flagged across any school. &#127881;</li>') +
        '</ul><p class="fine">The largest unfavourable variances across all four boards, by category.</p></div>' +
        '</div>';
      return h;
    }
  };
})();
