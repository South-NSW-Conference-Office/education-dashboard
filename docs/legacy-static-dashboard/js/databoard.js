/* ============================================================
   databoard.js — Weekly Education Databoard view
   ctx = { editing, finance: { <schoolId>: { calc, asAt, draft } } }
   The finance block lets each school card show its live finance position
   and link straight to its finance board.
   ============================================================ */
(function () {
  var NS = window.SNSW, esc = NS.esc;
  var COLS = [
    { key: 'overall', label: 'Overall' }, { key: 'finance', label: 'Finance' }, { key: 'enrolments', label: 'Enrolments' },
    { key: 'staffing', label: 'Staffing' }, { key: 'buildings', label: 'Buildings' }, { key: 'whs', label: 'WHS & Risk' }
  ];

  function shade(hex, amt) { // darken a hex colour by amt (0–1)
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * (1 - amt)); g = Math.round(g * (1 - amt)); b = Math.round(b * (1 - amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function field(ctx, value, path, opts) {
    opts = opts || {};
    if (!ctx.editing) return esc(value);
    if (opts.area) return '<textarea data-path="' + path + '" rows="' + (opts.rows || 2) + '">' + esc(value) + '</textarea>';
    return '<input class="txt" data-path="' + path + '" value="' + esc(value) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>';
  }
  // Traffic light: a button while editing (click to cycle), a labelled span otherwise
  function light(ctx, status, size, action) {
    status = NS.STATUS[status] ? status : 'green';
    var title = NS.STATUS[status].label;
    if (ctx.editing) return '<button type="button" class="light light-' + status + ' ' + (size || '') + '" title="' + title + ' — click to change" aria-label="' + title + '" ' + action + '></button>';
    return '<span class="light light-' + status + ' ' + (size || '') + '" title="' + title + '" role="img" aria-label="' + title + '"></span>';
  }
  function schoolFor(row) {
    return (row.id && NS.school(row.id)) || (row.theme && NS.schoolByDbKey(row.theme)) || null;
  }

  /* ---------- sparkline (enrolment trend) ---------- */
  function enrolNow(t) {
    var cur = t.length ? t[t.length - 1] : '', prev = t.length > 1 ? t[t.length - 2] : null;
    var delta = prev != null ? cur - prev : null;
    var txt = delta == null ? '' : (delta > 0 ? '<span class="c-green">&#9650; +' + delta + '</span>' : delta < 0 ? '<span class="c-red">&#9660; ' + delta + '</span>' : '<span class="muted">&#8212; no change</span>');
    return cur + (txt ? ' &middot; ' + txt : '');
  }
  function sparkline(vals) {
    if (!vals || vals.length < 2) return '<div class="enrol-label">Add 2+ points to show a trend</div>';
    var w = 180, h = 38, pad = 4, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = (max - min) || 1, step = (w - pad * 2) / (vals.length - 1);
    var pts = vals.map(function (v, i) { return [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)]; });
    var line = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var area = pad + ',' + (h - pad) + ' ' + line + ' ' + (w - pad) + ',' + (h - pad);
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="40" aria-hidden="true">' +
      '<polygon points="' + area + '" fill="rgba(13,92,171,.10)"></polygon>' +
      '<polyline points="' + line + '" fill="none" stroke="#0D5CAB" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4" fill="#0D5CAB" stroke="#fff" stroke-width="2"></circle></svg>';
  }
  NS.sparkline = sparkline; NS.enrolNow = enrolNow;

  function enrolBlock(ctx, s, i) {
    var t = (s.enrolTrend || []).map(Number).filter(function (n) { return !isNaN(n); });
    return '<div class="enrol"><div class="enrol-top"><span class="k">Enrolments</span><span class="enrol-now" id="now-' + i + '">' + enrolNow(t) + '</span></div>' +
      '<div id="spark-' + i + '" title="' + esc((s.enrolLabel || 'Trend') + ': ' + t.join(', ')) + '">' + sparkline(t) + '</div>' +
      (ctx.editing
        ? '<input class="txt mt6" value="' + esc((s.enrolTrend || []).join(', ')) + '" data-action="enrol-trend" data-idx="' + i + '" placeholder="e.g. 268, 279, 286, 300">' +
          '<input class="txt mt6" data-path="schools.' + i + '.enrolLabel" value="' + esc(s.enrolLabel || '') + '" placeholder="trend label">'
        : '<div class="enrol-label">' + esc(s.enrolLabel || '') + '</div>') + '</div>';
  }

  function listHTML(ctx, arr, key, rated) {
    if (!arr.length && !ctx.editing) return '<div class="empty muted">Nothing recorded.</div>';
    return arr.map(function (it, i) {
      var r = NS.STATUS[it.rating] ? it.rating : 'amber';
      return '<div class="item">' +
        (rated ? (ctx.editing
          ? '<button type="button" class="rating rating-' + r + '" data-action="cycle" data-type="' + key + '" data-idx="' + i + '" title="Click to change">' + NS.STATUS[r].label + '</button>'
          : '<span class="rating rating-' + r + '">' + NS.STATUS[r].label + '</span>') : '<span class="star">&#9733;</span>') +
        '<div class="txt"><div class="main">' + field(ctx, it.main, key + '.' + i + '.main') + '</div><div class="meta">' + field(ctx, it.meta, key + '.' + i + '.meta', { ph: 'Owner / due / detail' }) + '</div></div>' +
        (ctx.editing ? '<button class="btn-del" title="Remove" data-action="del-item" data-type="' + key + '" data-idx="' + i + '">&#10005;</button>' : '') +
        '</div>';
    }).join('');
  }

  NS.views.databoard = {
    render: function (d, ctx) {
      var h = '';
      // Combined finance position, calculated from the four finance boards
      var F = ctx.finance || {}, finIds = Object.keys(F), tot = { a: 0, b: 0 };
      finIds.forEach(function (id) { tot.a += F[id].calc.sur.actual; tot.b += F[id].calc.sur.budget; });
      var AUTO = '<span class="badge badge-auto" title="Calculated from the finance boards — edit the line items there">auto</span>';
      function surplusText(calc) { return (calc.sur.actual >= 0 ? 'Surplus ' : 'Deficit ') + NS.compact$(calc.sur.actual) + ' YTD'; }
      function varianceText(calc) { return NS.compact$(Math.abs(calc.surVar)) + (calc.surVar >= 0 ? ' ahead of budget' : ' behind budget'); }

      /* At a glance matrix */
      h += '<section class="section"><div class="section-head"><h2>At a glance</h2><div class="rule"></div><span class="hint">' + d.matrix.length + ' sites · six health measures' + (ctx.editing ? ' · click a light to change it' : ' · click a school to open its finance board') + '</span></div>' +
        '<div class="card scroll-x"><table class="matrix"><thead><tr><th>School</th>' + COLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr></thead><tbody>';
      d.matrix.forEach(function (r, ri) {
        var sch = schoolFor(r);
        var derived = NS.rowStatus(r, sch && F[sch.id] ? F[sch.id].calc : null);
        var name = ctx.editing
          ? field(ctx, r.school, 'matrix.' + ri + '.school') + field(ctx, r.sub, 'matrix.' + ri + '.sub')
          : (sch ? '<a href="#/finance/' + sch.id + '">' + esc(r.school) + '</a>' : esc(r.school)) + '<small>' + esc(r.sub) + '</small>';
        h += '<tr><td class="school-name">' + (sch ? '<i class="swatch" style="background:' + sch.colour + '"></i>' : '') + '<div>' + name + '</div></td>';
        COLS.forEach(function (c) {
          var st = derived[c.key] || 'green', note = (r.notes && r.notes[c.key]) || '';
          var isDerived = c.key === 'overall' || (c.key === 'finance' && sch && F[sch.id]);
          var finChip = '';
          if (c.key === 'finance' && sch && F[sch.id]) {
            var fc = F[sch.id].calc;
            finChip = '<span class="chip chip-' + (fc.surVar >= 0 ? 'green' : 'red') + ' auto-chip" title="Finance board: surplus ' + NS.fmt$(fc.sur.actual) + ' vs budget ' + NS.fmt$(fc.sur.budget) + '">' + (fc.surVar >= 0 ? '+' : '−') + NS.compact$(Math.abs(fc.surVar)) + ' vs budget</span>';
          }
          h += '<td>' + (isDerived
              ? '<span class="light light-' + st + '" role="img" aria-label="' + NS.STATUS[st].label + '" title="' + NS.STATUS[st].label + ' — ' + (c.key === 'overall' ? 'worst of the five measures' : 'from the finance board') + '"></span>' + (ctx.editing ? '<span class="auto-chip badge badge-auto">auto</span>' : '')
              : light(ctx, st, '', 'data-action="cycle" data-type="matrix" data-idx="' + ri + '" data-col="' + c.key + '"')) + finChip +
            (ctx.editing
              ? '<input class="cell-note-input" value="' + esc(note) + '" data-action="matrix-note" data-idx="' + ri + '" data-col="' + c.key + '" placeholder="note">'
              : (note ? '<span class="cell-note">' + esc(note) + '</span>' : '')) + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table><div class="light-legend"><span><i class="light light-green mini"></i>On track</span><span><i class="light light-amber mini"></i>Watch</span><span><i class="light light-red mini"></i>Action needed</span>' +
        '<span class="legend-note">Overall = worst of the five measures · Finance = from the school\u2019s finance board</span></div></div></section>';

      /* Cash position */
      h += '<section class="section"><div class="section-head"><h2>SNSW cash position</h2><div class="rule"></div><span class="hint">Consolidated across all schools</span></div><div class="grid4">' +
        d.cash.map(function (c, i) {
          var auto = /operating result/i.test(c.label) && finIds.length;
          var value = auto ? (tot.a < 0 ? '−' : '+') + NS.compact$(Math.abs(tot.a)) : field(ctx, c.value, 'cash.' + i + '.value');
          var delta = auto ? NS.compact$(Math.abs(tot.a - tot.b)) + (tot.a - tot.b >= 0 ? ' ahead of budget' : ' behind budget') + ' · ' + finIds.length + ' finance boards' : field(ctx, c.delta, 'cash.' + i + '.delta');
          return '<div class="card cash-cell' + (c.feature ? ' feature' : '') + '"' + (auto ? ' title="Sum of the YTD surplus on each school\u2019s finance board"' : '') + '><label>' + field(ctx, c.label, 'cash.' + i + '.label') + (auto ? AUTO : '') + '</label>' +
            '<div class="fig">' + value + '</div><div class="delta">' + delta + '</div></div>';
        }).join('') + '</div></section>';

      /* School snapshots */
      h += '<section class="section"><div class="section-head"><h2>School snapshots</h2><div class="rule"></div><span class="hint">Budget · buildings · staffing · enrolments</span></div><div class="schools-grid">';
      d.schools.forEach(function (s, i) {
        var sch = schoolFor(s), colour = sch ? sch.colour : '#0D5CAB';
        var fin = sch && F[sch.id];
        var finLine = fin ? '<div class="fin-line"><span class="k">From the finance board · as at ' + esc(fin.asAt) + (fin.draft ? ' <span class="badge badge-amber">placeholder</span>' : '') + '</span></div>' : '';
        var budgetV = fin ? '<span class="catcell"><span class="dot dot-' + (fin.calc.sur.actual >= 0 ? 'green' : 'red') + '"></span>' + surplusText(fin.calc) + AUTO + '</span>' : field(ctx, s.budget, 'schools.' + i + '.budget');
        var varianceV = fin ? '<span class="c-' + (fin.calc.surVar >= 0 ? 'green' : 'red') + '">' + varianceText(fin.calc) + '</span>' + AUTO : field(ctx, s.variance, 'schools.' + i + '.variance');
        h += '<div class="card school-card"><div class="head" style="background:linear-gradient(120deg,' + colour + ',' + shade(colour, .25) + ')"><div>' +
          '<h3>' + field(ctx, s.name, 'schools.' + i + '.name') + '</h3><div class="loc">' + field(ctx, s.loc, 'schools.' + i + '.loc') + '</div></div>' +
          (function () { // the card's light is the matrix row's derived Overall
            var row = null; d.matrix.forEach(function (m) { if (sch && (m.id === sch.id || m.school === s.name)) row = m; });
            var ov = row ? NS.rowStatus(row, fin ? fin.calc : null).overall : (NS.STATUS[s.overall] ? s.overall : 'green');
            return '<span class="light light-' + ov + ' ov" role="img" aria-label="' + NS.STATUS[ov].label + '" title="Overall: ' + NS.STATUS[ov].label + ' (from the at-a-glance row)"></span>';
          })() + '</div>' +
          '<div class="body">' +
          '<div class="metric-row"><span class="k">Budget</span><span class="v">' + budgetV + '</span></div>' +
          '<div class="metric-row"><span class="k">Variance</span><span class="v">' + varianceV + '</span></div>' +
          '<div class="metric-row col"><div class="between"><span class="k">Building project</span><span class="v">' + field(ctx, s.project, 'schools.' + i + '.project') + '</span></div>' +
          '<div class="progress" title="' + esc(s.project) + ': ' + (+s.progress || 0) + '% complete"><i style="width:' + Math.max(0, Math.min(100, +s.progress || 0)) + '%"></i></div>' +
          '<div class="between mt4"><span class="k">Progress</span><span class="v">' + (ctx.editing ? '<input class="num" type="number" min="0" max="100" data-path="schools.' + i + '.progress" value="' + (+s.progress || 0) + '">' : (+s.progress || 0) + '%') + '</span></div></div>' +
          '<div class="metric-row"><span class="k">Loan balance</span><span class="v">' + field(ctx, s.loan, 'schools.' + i + '.loan') + '</span></div>' +
          '<div class="metric-row"><span class="k">Payments</span><span class="v">' + field(ctx, s.payments, 'schools.' + i + '.payments') + '</span></div>' +
          '<div class="metric-row"><span class="k">Staffing</span><span class="v">' + field(ctx, s.staffing, 'schools.' + i + '.staffing') + '</span></div>' +
          enrolBlock(ctx, s, i) + '</div>' +
          (sch ? '<div class="foot">' + finLine + '<a class="btn btn-small btn-ghost" href="#/finance/' + sch.id + '">Open finance board &rarr;</a></div>' : '') +
          '</div>';
      });
      h += '</div></section>';

      /* Risks & WHS */
      h += '<section class="section"><div class="section-head"><h2>Risks &amp; WHS</h2><div class="rule"></div><span class="hint">Rating shows current exposure</span></div><div class="grid2">' +
        '<div class="card panel"><div class="panel-head"><div class="main">Risk register</div><div class="meta">Owner and status for each open risk</div></div><div>' + listHTML(ctx, d.risks, 'risks', true) + '</div>' +
        (ctx.editing ? '<div class="add-row"><button class="btn btn-small btn-dashed" data-action="add-item" data-type="risks">+ Add risk</button></div>' : '') + '</div>' +
        '<div class="card panel"><div class="panel-head"><div class="main">WHS items</div><div class="meta">Work health &amp; safety actions</div></div><div>' + listHTML(ctx, d.whs, 'whs', true) + '</div>' +
        (ctx.editing ? '<div class="add-row"><button class="btn btn-small btn-dashed" data-action="add-item" data-type="whs">+ Add WHS item</button></div>' : '') + '</div>' +
        '</div></section>';

      /* Celebration */
      h += '<section class="section"><div class="section-head"><h2>Connection &amp; celebration</h2><div class="rule"></div><span class="hint">The good news worth sharing</span></div>' +
        '<div class="card panel celebrate"><div>' + listHTML(ctx, d.celebrate, 'celebrate', false) + '</div>' +
        (ctx.editing ? '<div class="add-row"><button class="btn btn-small btn-dashed" data-action="add-item" data-type="celebrate">+ Add a win</button></div>' : '') + '</div></section>';
      return h;
    }
  };
})();
