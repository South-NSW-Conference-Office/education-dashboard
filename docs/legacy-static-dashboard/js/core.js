/* ============================================================
   core.js — shared helpers, persistence and routing
   No framework, no build step. Everything hangs off window.SNSW.
   ============================================================ */
(function () {
  var NS = window.SNSW = window.SNSW || {};
  NS.views = NS.views || {};

  /* ---------- formatting ---------- */
  NS.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  // 1,234 / (1,234) — accountants' negatives, as in the operating statement
  NS.fmt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    var neg = n < 0, s = Math.abs(Math.round(n)).toLocaleString('en-AU');
    return neg ? '(' + s + ')' : s;
  };
  NS.fmt$ = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    var s = '$' + Math.abs(Math.round(n)).toLocaleString('en-AU');
    return n < 0 ? '(' + s + ')' : s;
  };
  // Compact money for tiles: $217k, $1.84m, ($22k)
  NS.compact$ = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    var a = Math.abs(n), s;
    if (a >= 1e6) s = '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'm';
    else if (a >= 1e3) s = '$' + Math.round(a / 1e3) + 'k';
    else s = '$' + Math.round(a);
    return n < 0 ? '(' + s + ')' : s;
  };
  NS.pct = function (n, dp) { return (isNaN(n) ? 0 : n).toFixed(dp == null ? 1 : dp) + '%'; };
  NS.sum = function (rows, k) { return (rows || []).reduce(function (a, r) { return a + (Number(r[k]) || 0); }, 0); };
  NS.when = function (iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /* ---------- dotted paths (used by every editable field) ---------- */
  NS.getPath = function (obj, path) {
    var o = obj, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  };
  NS.setPath = function (obj, path, value) {
    var parts = path.split('.'), o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  };
  NS.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---------- status (traffic-light) vocabulary ---------- */
  NS.STATUS = {
    green: { label: 'On track', icon: '&#10003;' },
    amber: { label: 'Watch',    icon: '&#9679;' },
    red:   { label: 'Action',   icon: '&#33;' }
  };
  NS.cycle = { green: 'amber', amber: 'red', red: 'green' };
  // Variance colour: favourable = green, within 5% = amber, worse = red
  NS.varColour = function (pct) { return pct >= 0 ? 'green' : (pct > -5 ? 'amber' : 'red'); };

  /* ---------- school registry helpers ---------- */
  NS.schools = window.SNSW_SCHOOLS || [];
  NS.school = function (id) {
    for (var i = 0; i < NS.schools.length; i++) if (NS.schools[i].id === id) return NS.schools[i];
    return null;
  };
  NS.schoolByDbKey = function (key) {
    for (var i = 0; i < NS.schools.length; i++) if (NS.schools[i].dbKey === key) return NS.schools[i];
    return null;
  };

  /* ---------- persistence ----------
     Phase 1: browser localStorage, one record per board, keyed by board id.
     Phase 2: swap these three functions for API calls — nothing else needs to change. */
  var PREFIX = 'snsw-dashboard:v2:';
  NS.store = {
    defaults: function (boardId) {
      var src = window.SNSW_DATA || {};
      if (boardId === 'databoard') return src.databoard;
      var m = /^finance:(.+)$/.exec(boardId);
      if (m && src.finance) return src.finance[m[1]];
      return null;
    },
    hasLocal: function (boardId) {
      try { return !!localStorage.getItem(PREFIX + boardId); } catch (e) { return false; }
    },
    load: function (boardId) {
      var def = this.defaults(boardId);
      if (!def) return null;
      try {
        var raw = localStorage.getItem(PREFIX + boardId);
        if (raw) { var saved = JSON.parse(raw); saved.meta = saved.meta || {}; saved.meta.source = 'local'; return /^finance:/.test(boardId) ? NS.normalise(saved) : saved; }
      } catch (e) { /* fall through to defaults */ }
      var d = NS.clone(def); d.meta = d.meta || {}; d.meta.source = 'file'; return /^finance:/.test(boardId) ? NS.normalise(d) : d;
    },
    save: function (boardId, data) {
      data.meta = data.meta || {};
      data.meta.lastSaved = new Date().toISOString();
      data.meta.source = 'local';
      try { localStorage.setItem(PREFIX + boardId, JSON.stringify(data)); return true; }
      catch (e) { return false; }
    },
    reset: function (boardId) {
      try { localStorage.removeItem(PREFIX + boardId); } catch (e) { }
      return this.load(boardId);
    }
  };

  /* ---------- routing (hash based so links are shareable and Back works) ----------
     #/databoard                → weekly education databoard
     #/finance                  → all-schools finance summary
     #/finance/<school>         → school finance board, overview tab
     #/finance/<school>/details → school finance board, details tab            */
  NS.router = {
    parse: function () {
      var h = (location.hash || '').replace(/^#\/?/, '');
      var p = h.split('/').filter(Boolean);
      if (p[0] === 'finance') {
        if (p[1] && NS.school(p[1])) return { view: 'finance', school: p[1], tab: p[2] === 'details' ? 'details' : 'overview' };
        return { view: 'finance-all' };
      }
      return { view: 'databoard' };
    },
    href: function (r) {
      if (r.view === 'finance') return '#/finance/' + r.school + (r.tab === 'details' ? '/details' : '');
      if (r.view === 'finance-all') return '#/finance';
      return '#/databoard';
    },
    go: function (r) { location.hash = this.href(r); },
    boardId: function (r) { return r.view === 'finance' ? 'finance:' + r.school : (r.view === 'databoard' ? 'databoard' : null); }
  };

  /* ---------- roll-up: line items → overview categories ----------
     The Details tab holds every line of the operating statement. Overview categories,
     KPIs, the all-schools summary and the databoard are all calculated from those lines,
     so one edit flows through the whole dashboard. A category only falls back to the
     figure typed on the Overview when it has no line items (for example a board whose
     detail pages have not been entered yet). */
  var DK = ['budget', 'actual', 'annualBudget', 'eoyEstimate'];
  var GROUP_ALIASES = { // overview label → detail group labels (lower case)
    'property expenses': ['occupancy expenses', 'property expenses'],
    'capital expenditure': ['capital expenses', 'capital expenditure'],
    'tuition & care expenses': ['tuition expenses', 'tuition & care expenses'],
    'family fees': ['student tuition', 'family fees']
  };
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function groupHasData(g) { return (g.rows || []).some(function (r) { return DK.some(function (k) { return Number(r[k]); }); }); }
  function groupsSum(gs, k) { return gs.reduce(function (a, g) { return a + NS.sum(g.rows, k); }, 0); }
  NS.DK = DK;

  NS.rollup = function (d) {
    var out = { income: [], expenditure: [], unmapped: [] };
    ['income', 'expenditure'].forEach(function (sec) {
      var groups = (d.details && d.details[sec]) || [], used = {};
      (d[sec] || []).forEach(function (cat, i) {
        var names = GROUP_ALIASES[norm(cat.label)] || [norm(cat.label)];
        var gs = groups.filter(function (g) { return names.indexOf(norm(g.group)) >= 0; });
        var live = gs.some(groupHasData);
        var row = { label: cat.label, sub: cat.sub, index: i, section: sec, computed: live, groups: gs.map(function (g) { return g.group; }), reported: {} };
        DK.forEach(function (k) { row.reported[k] = Number(cat[k]) || 0; row[k] = live ? groupsSum(gs, k) : (Number(cat[k]) || 0); });
        gs.forEach(function (g) { used[norm(g.group)] = true; });
        // "of which: salaries" = the salary, casual and fringe-benefit lines of the category
        if (sec === 'expenditure') {
          var sal = [];
          gs.forEach(function (g) { (g.rows || []).forEach(function (r) { if (/salar|casual|fringe/i.test(r.label)) sal.push(r); }); });
          var typed = (cat.sub && cat.sub[0]) || null;
          if (live && sal.some(function (r) { return Number(r.budget) || Number(r.actual); })) {
            var sl = { label: typed ? typed.label : 'Salaries & wages', computed: true, lines: sal.length };
            DK.forEach(function (k) { sl[k] = NS.sum(sal, k); });
            row.sub = [sl];
          } else if (typed) {
            var st = { label: typed.label, computed: false };
            DK.forEach(function (k) { st[k] = Number(typed[k]) || 0; });
            row.sub = [st];
          } else row.sub = [];
        }
        out[sec].push(row);
      });
      // Detail groups with figures but no overview category still count towards the totals
      groups.forEach(function (g) {
        if (used[norm(g.group)] || !groupHasData(g)) return;
        var row = { label: g.group, index: -1, section: sec, computed: true, groups: [g.group], reported: null };
        DK.forEach(function (k) { row[k] = NS.sum(g.rows, k); });
        out[sec].push(row); out.unmapped.push(g.group);
      });
    });
    // EBIDA add-back = interest + depreciation + amortisation lines, when the statement has them
    var ida = [];
    ((d.details && d.details.expenditure) || []).forEach(function (g) {
      (g.rows || []).forEach(function (r) { if (/depreciation|amortis|interest/i.test(r.label)) ida.push(r); });
    });
    var idaLive = ida.some(function (r) { return Number(r.budget) || Number(r.actual); });
    var ab = d.addback || {};
    out.addback = {
      computed: idaLive, lines: ida.filter(function (r) { return Number(r.budget) || Number(r.actual); }).length,
      ytdBudget: idaLive ? NS.sum(ida, 'budget') : (Number(ab.ytdBudget) || 0),
      ytdActual: idaLive ? NS.sum(ida, 'actual') : (Number(ab.ytdActual) || 0),
      reported: { ytdBudget: Number(ab.ytdBudget) || 0, ytdActual: Number(ab.ytdActual) || 0 }
    };
    return out;
  };

  /* ---------- finance maths (shared by school board, all-schools summary and databoard) ---------- */
  /* Raw data lives only in the line items. A board whose category figures were typed on the
     Overview (no line items behind them) gets one line per category so the same rule holds. */
  NS.normalise = function (d) {
    if (!d) return d;
    d.details = d.details || {}; d.addback = d.addback || {};
    ['income', 'expenditure'].forEach(function (sec) {
      var groups = d.details[sec] = d.details[sec] || [];
      (d[sec] || []).forEach(function (cat) {
        var names = GROUP_ALIASES[norm(cat.label)] || [norm(cat.label)];
        var gs = groups.filter(function (g) { return names.indexOf(norm(g.group)) >= 0; });
        if (gs.some(groupHasData)) return;                                  // already has line items
        if (!DK.some(function (k) { return Number(cat[k]); })) return;      // nothing typed either
        var g = gs[0]; if (!g) { g = { group: cat.label, rows: [] }; groups.push(g); }
        var sub = cat.sub && cat.sub[0];
        if (sub && DK.some(function (k) { return Number(sub[k]); })) {
          var sl = { code: '', label: sub.label }, ol = { code: '', label: 'Other ' + String(cat.label).toLowerCase() };
          DK.forEach(function (k) { sl[k] = Number(sub[k]) || 0; ol[k] = (Number(cat[k]) || 0) - sl[k]; });
          g.rows.push(sl, ol);
        } else {
          var r = { code: '', label: cat.label + ' (summary figure)' };
          DK.forEach(function (k) { r[k] = Number(cat[k]) || 0; });
          g.rows.push(r);
        }
      });
    });
    return d;
  };

  /* ---------- derived traffic lights (weekly databoard) ---------- */
  NS.financeStatus = function (calc) {
    var sv = calc.surVar;
    return sv >= 0 ? 'green' : (sv > -0.05 * Math.abs(calc.sur.budget || 1) ? 'amber' : 'red');
  };
  NS.worst = function (arr) { return arr.indexOf('red') >= 0 ? 'red' : (arr.indexOf('amber') >= 0 ? 'amber' : 'green'); };
  // Finance comes from the finance board when there is one; Overall is the worst of the five measures
  NS.rowStatus = function (row, finCalc) {
    var st = {}, src = (row && row.status) || {};
    for (var k in src) st[k] = src[k];
    if (finCalc) st.finance = NS.financeStatus(finCalc);
    st.overall = NS.worst(['finance', 'enrolments', 'staffing', 'buildings', 'whs'].map(function (k) { return NS.STATUS[st[k]] ? st[k] : 'green'; }));
    return st;
  };

  NS.financeCalc = function (d) {
    var ru = NS.rollup(d);
    var inc = { budget: NS.sum(ru.income, 'budget'), actual: NS.sum(ru.income, 'actual'), annual: NS.sum(ru.income, 'annualBudget'), eoy: NS.sum(ru.income, 'eoyEstimate') };
    var exp = { budget: NS.sum(ru.expenditure, 'budget'), actual: NS.sum(ru.expenditure, 'actual'), annual: NS.sum(ru.expenditure, 'annualBudget'), eoy: NS.sum(ru.expenditure, 'eoyEstimate') };
    var sur = { budget: inc.budget - exp.budget, actual: inc.actual - exp.actual, annual: inc.annual - exp.annual, eoy: inc.eoy - exp.eoy };
    var ebida = { budget: sur.budget + ru.addback.ytdBudget, actual: sur.actual + ru.addback.ytdActual };
    // The operating statement reports operating margin on an EBIDA basis, so match it.
    var mar = { budget: inc.budget ? ebida.budget / inc.budget * 100 : 0, actual: inc.actual ? ebida.actual / inc.actual * 100 : 0 };
    return {
      inc: inc, exp: exp, sur: sur, ebida: ebida, mar: mar, rollup: ru,
      incVarPct: inc.budget ? (inc.actual - inc.budget) / inc.budget * 100 : 0,
      expVarPct: exp.budget ? (exp.actual - exp.budget) / exp.budget * 100 : 0,
      surVar: sur.actual - sur.budget
    };
  };

  // Where the operating report's page 1 figure (typed on the Overview) differs from what the line items add up to
  NS.reconcile = function (ru) {
    var TOL = 10, out = [], KL = { budget: 'YTD budget', actual: 'YTD actual', annualBudget: 'Annual budget', eoyEstimate: 'Est. end of year' };
    ['income', 'expenditure'].forEach(function (sec) {
      ru[sec].forEach(function (row) {
        if (!row.computed || !row.reported) return;
        DK.forEach(function (k) {
          var diff = row[k] - row.reported[k];
          if (Math.abs(diff) > TOL) out.push({ section: sec, label: row.label, field: KL[k], lines: row[k], reported: row.reported[k], diff: diff });
        });
      });
    });
    if (ru.addback.computed) ['ytdBudget', 'ytdActual'].forEach(function (k) {
      var diff = ru.addback[k] - ru.addback.reported[k];
      if (Math.abs(diff) > TOL) out.push({ section: 'addback', label: 'EBIDA add-back', field: k === 'ytdBudget' ? 'YTD budget' : 'YTD actual', lines: ru.addback[k], reported: ru.addback.reported[k], diff: diff });
    });
    return out;
  };
  // After an edit session: categories whose line items changed take the new line-item total as their
  // reported figure, so only the discrepancies that came with the source data stay flagged.
  NS.alignChanged = function (prev, d) {
    var ruP = NS.rollup(prev), ru = NS.rollup(d);
    ['income', 'expenditure'].forEach(function (sec) {
      ru[sec].forEach(function (row) {
        if (!row.computed || row.index < 0) return;
        var before = null;
        ruP[sec].forEach(function (r) { if (r.label === row.label) before = r; });
        DK.forEach(function (k) { if (!before || before[k] !== row[k]) d[sec][row.index][k] = row[k]; });
      });
    });
    if (ru.addback.computed) {
      d.addback = d.addback || {};
      ['ytdBudget', 'ytdActual'].forEach(function (k) { if (ruP.addback[k] !== ru.addback[k]) d.addback[k] = ru.addback[k]; });
    }
  };
  // Accept the line items as the reported page 1 figures (clears the reconciliation list)
  NS.alignReported = function (d) {
    var ru = NS.rollup(d);
    ['income', 'expenditure'].forEach(function (sec) {
      ru[sec].forEach(function (row) { if (row.computed && row.index >= 0) DK.forEach(function (k) { d[sec][row.index][k] = row[k]; }); });
    });
    if (ru.addback.computed) { d.addback = d.addback || {}; d.addback.ytdBudget = ru.addback.ytdBudget; d.addback.ytdActual = ru.addback.ytdActual; }
  };
  // One category's health: favourable variance amount and traffic-light colour
  NS.health = function (r, isIncome) {
    var v = isIncome ? (r.actual - r.budget) : (r.budget - r.actual);
    var p = r.budget ? v / Math.abs(r.budget) * 100 : (v < 0 ? -100 : 0);
    return { label: r.label, varAmt: v, pct: p, colour: NS.varColour(p) };
  };
})();
