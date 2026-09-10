/* ============================================================
   app.js — shell: navigation, top bar, edit/save/export/import, events
   ============================================================ */
(function () {
  var NS = window.SNSW, esc = NS.esc, R = NS.router;

  var App = NS.app = {
    route: null, editing: false, hideZeros: true, filter: '', menuOpen: false, drawerOpen: false,
    cache: {}, snapshot: null, lastHash: null,

    board: function (id) {
      if (!id) return null;
      if (!this.cache[id]) this.cache[id] = NS.store.load(id);
      return this.cache[id];
    },
    currentId: function () { return R.boardId(this.route); },
    current: function () { return this.board(this.currentId()); },
    allFinance: function () {
      return NS.schools.map(function (s) { return { school: s, data: App.board('finance:' + s.id) }; })
        .filter(function (b) { return b.data; })
        .map(function (b) { b.calc = NS.financeCalc(b.data); return b; });
    },
    financeCtx: function () { // per-school finance summary, used by the databoard and the nav
      var o = {};
      this.allFinance().forEach(function (b) { o[b.school.id] = { calc: b.calc, asAt: b.data.meta.asAt, draft: !!b.data.meta.draft }; });
      return o;
    },
    overallStatus: function (schoolId) { // from the weekly databoard matrix
      var db = this.board('databoard'); if (!db) return null;
      var s = NS.school(schoolId);
      var fin = this.board('finance:' + schoolId);
      for (var i = 0; i < db.matrix.length; i++) {
        var r = db.matrix[i];
        if (r.id === schoolId || (s && r.school === s.name)) return NS.rowStatus(r, fin ? NS.financeCalc(fin) : null).overall;
      }
      return null;
    },

    /* ---------- rendering ---------- */
    render: function () {
      this.route = R.parse();
      document.body.classList.toggle('editing', this.editing);
      this.renderNav();
      this.renderTopbar();
      this.renderContent();
    },

    renderNav: function () {
      var r = this.route, h = '';
      function item(href, active, inner, cls) { return '<a class="nav-item' + (active ? ' active' : '') + (cls ? ' ' + cls : '') + '" href="' + href + '">' + inner + '</a>'; }
      h += '<div class="nav-group">Education</div>';
      h += item('#/databoard', r.view === 'databoard', '<span class="nav-ico">&#128203;</span><span class="nav-text">Weekly Databoard<small>All sites · one page</small></span>');
      h += '<div class="nav-group">Finance</div>';
      h += item('#/finance', r.view === 'finance-all', '<span class="nav-ico">&#9638;</span><span class="nav-text">All schools<small>Consolidated summary</small></span>');
      NS.schools.forEach(function (s) {
        var st = App.overallStatus(s.id), fin = App.board('finance:' + s.id);
        h += item('#/finance/' + s.id, r.view === 'finance' && r.school === s.id,
          '<span class="nav-swatch" style="background:' + s.colour + '"></span>' +
          '<span class="nav-text">' + esc(s.name) + '<small>' + esc(s.loc) + (fin ? ' · ' + esc(fin.meta.asAt) : '') + '</small></span>' +
          (st ? '<span class="dot dot-' + st + '" title="Overall status on the weekly databoard: ' + NS.STATUS[st].label + '"></span>' : ''));
      });
      document.getElementById('nav').innerHTML = h;
    },

    renderTopbar: function () {
      var r = this.route, d = this.current(), h = '', eyebrow, title, period = '', updated = '';
      if (r.view === 'databoard') {
        eyebrow = 'Education · South New South Wales'; title = 'Weekly Education Databoard';
        period = '<span class="pill"><label>Week ending</label>' + (this.editing ? '<input data-path="weekEnding" value="' + esc(d.weekEnding) + '">' : '<b>' + esc(d.weekEnding || '—') + '</b>') + '</span>';
      } else if (r.view === 'finance-all') {
        eyebrow = 'Finance · All schools'; title = 'Finance summary';
        var boards = this.allFinance();
        period = '<span class="pill"><label>Boards as at</label><b>' + boards.map(function (b) { return esc(b.data.meta.asAt); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ') + '</b></span>';
      } else {
        var s = NS.school(r.school);
        eyebrow = 'Finance · ' + esc(s.type) + ' · ' + esc(s.loc); title = esc(s.name);
        period = '<span class="pill"><label>As at</label>' + (this.editing ? '<input data-path="meta.asAt" value="' + esc(d.meta.asAt) + '">' : '<b>' + esc(d.meta.asAt || '—') + '</b>') + '</span>';
      }
      if (d) {
        updated = '<span class="pill" title="' + (d.meta.source === 'local' ? 'These figures were saved in this browser. Use More → Reset to go back to the source file.' : 'Figures as published in the source data file.') + '">' +
          '<label>Figures</label><b>' + (d.meta.source === 'local' ? 'Saved ' + esc(NS.when(d.meta.lastSaved)) : 'Source file') + '</b></span>';
      }

      var actions = '';
      if (d) {
        actions = this.editing
          ? '<button class="btn btn-primary" data-action="save">&#10003; Save changes</button><button class="btn btn-ghost" data-action="cancel">Cancel</button>'
          : '<button class="btn btn-primary" data-action="edit">&#9998; Edit board</button>';
      }
      actions += '<div class="menu-wrap"><button class="btn btn-ghost" data-action="menu" aria-haspopup="true" aria-expanded="' + this.menuOpen + '">More &#9662;</button>' +
        '<div class="menu' + (this.menuOpen ? ' open' : '') + '">' +
        (d ? '<button data-action="export">&#11015; Export this board (JSON)</button><button data-action="import">&#11014; Import figures (JSON)</button>' : '') +
        '<button data-action="print">&#128438; Print / save as PDF</button>' +
        (d ? '<hr><button class="danger" data-action="reset"' + (d.meta.source === 'local' ? '' : ' disabled') + '>Reset to source figures</button>' : '') +
        '</div></div>';

      h += '<div class="tb-row"><button class="icon-btn nav-toggle" data-action="nav-toggle" aria-label="Menu">&#9776;</button>' +
        '<div class="tb-title"><div class="eyebrow">' + eyebrow + '</div><h1>' + title + '</h1></div>' +
        '<div class="tb-pills">' + period + updated + '</div><div class="tb-actions">' + actions + '</div></div>';

      if (r.view === 'finance') {
        h += '<div class="tb-tabs"><div class="tabs">' +
          '<a class="tab' + (r.tab === 'overview' ? ' active' : '') + '" href="#/finance/' + r.school + '">&#128200; Overview</a>' +
          '<a class="tab' + (r.tab === 'details' ? ' active' : '') + '" href="#/finance/' + r.school + '/details">&#128209; Details <small>every line item</small></a></div>' +
          (r.tab === 'details' ? '<div class="tab-tools"><input id="detail-filter" class="search" type="search" placeholder="Filter line items — code or name" value="' + esc(this.filter) + '" data-action="filter">' +
            (!this.editing && !this.filter ? '<button class="toggle' + (this.hideZeros ? '' : ' on') + '" data-action="zeros">' + (this.hideZeros ? 'Show empty lines' : 'Hide empty lines') + '</button>' : '') + '</div>' : '') +
          '</div>';
      }
      document.getElementById('topbar').innerHTML = h;
    },

    renderContent: function () {
      var r = this.route, d = this.current(), h = '';
      if (d && d.meta.draft) h += '<div class="banner banner-amber">&#9888;&#65039; <b>Placeholder figures.</b> This board’s numbers are for layout only and were not taken from an operating report. Replace them before sharing.</div>';
      if (this.editing) h += '<div class="banner banner-green"><b>Edit mode.</b> ' +
        (r.view === 'databoard' ? 'Type into any figure or note and click the Enrolments, Staffing, Buildings and WHS lights to cycle them. The Overall and Finance lights, the operating result and each school’s budget and variance are calculated and cannot be changed here.'
          : r.tab === 'details' ? 'Type into any line, or add and remove lines. Totals, the Overview, the all-schools summary and the databoard recalculate when you leave a field.'
          : 'Every figure on this tab is calculated from the Details tab. Only the period, loans, leases, family debtors and notes are typed here.') +
        ' Changes are kept in this browser when you save.</div>';

      if (r.view === 'databoard') {
        h += NS.views.databoard.render(d, { editing: this.editing, finance: this.financeCtx() });
      } else if (r.view === 'finance-all') {
        h += NS.views.financeAll.render(this.allFinance());
      } else {
        h += NS.views.finance.render(d, { editing: this.editing, tab: r.tab, hideZeros: this.hideZeros, filter: this.filter, school: NS.school(r.school) });
      }
      h += '<div class="foot">Adventist Education South New South Wales · Dashboards for principals, the finance team and the education board.<br>Figures are indicative — the operating statement remains the authoritative record.</div>';
      var el = document.getElementById('content');
      el.innerHTML = h;
    },

    /* ---------- actions ---------- */
    edit: function () { var d = this.current(); if (!d) return; this.snapshot = JSON.stringify(d); this.editing = true; this.menuOpen = false; this.render(); },
    save: function () {
      var id = this.currentId(), d = this.current(); if (!d) return;
      if (/^finance:/.test(id) && this.snapshot) NS.alignChanged(JSON.parse(this.snapshot), d);
      var ok = NS.store.save(id, d);
      this.editing = false; this.snapshot = null; this.render();
      this.toast(ok ? 'Saved. Figures are kept in this browser.' : 'Could not save to browser storage — export the board to keep your changes.', ok ? 'ok' : 'warn');
    },
    cancel: function () {
      var id = this.currentId();
      if (this.snapshot) this.cache[id] = JSON.parse(this.snapshot);
      this.editing = false; this.snapshot = null; this.render();
    },
    dirty: function () { return this.editing && this.snapshot !== null && JSON.stringify(this.current()) !== this.snapshot; },
    reset: function () {
      var id = this.currentId(); if (!id) return;
      if (!confirm('Discard the figures saved in this browser and go back to the source file figures for this board?')) return;
      this.cache[id] = NS.store.reset(id); this.editing = false; this.snapshot = null; this.menuOpen = false; this.render();
      this.toast('Board reset to source figures.', 'ok');
    },
    exportJSON: function () {
      var id = this.currentId(), d = this.current(); if (!d) return;
      var out = NS.clone(d); delete out.meta.source;
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'snsw-' + id.replace(':', '-') + '-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      this.menuOpen = false; this.renderTopbar();
    },
    importJSON: function (file) {
      var id = this.currentId(), self = this; if (!id || !file) return;
      var rd = new FileReader();
      rd.onload = function (e) {
        try {
          var j = JSON.parse(e.target.result);
          var isFin = /^finance:/.test(id);
          var valid = isFin ? (Array.isArray(j.income) && Array.isArray(j.expenditure) && j.details) : (Array.isArray(j.matrix) && Array.isArray(j.schools));
          if (!valid) throw new Error('shape');
          j.meta = j.meta || {}; if (isFin && !j.meta.asAt) j.meta.asAt = self.current().meta.asAt;
          self.cache[id] = j; NS.store.save(id, j); self.editing = false; self.render();
          self.toast('Figures imported and saved.', 'ok');
        } catch (err) { self.toast('That file is not a ' + (/^finance:/.test(id) ? 'finance board' : 'databoard') + ' export.', 'warn'); }
      };
      rd.readAsText(file);
    },
    toast: function (msg, kind) {
      var t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '');
      clearTimeout(this._tt); this._tt = setTimeout(function () { t.className = 'toast'; }, 3200);
    },
    setDrawer: function (open) { this.drawerOpen = open; document.body.classList.toggle('drawer-open', open); }
  };

  /* ---------- events (one delegated handler each) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) {
      if (App.menuOpen && !e.target.closest('.menu-wrap')) { App.menuOpen = false; App.renderTopbar(); }
      if (e.target.closest('.rowlink') && !e.target.closest('a')) { location.hash = e.target.closest('.rowlink').getAttribute('data-href'); }
      if (e.target.closest('.nav-item')) App.setDrawer(false);
      if (e.target.id === 'scrim') App.setDrawer(false);
      return;
    }
    var a = t.getAttribute('data-action'), d = App.current(), idx = Number(t.getAttribute('data-idx')), type = t.getAttribute('data-type');
    switch (a) {
      case 'nav-toggle': App.setDrawer(!App.drawerOpen); break;
      case 'edit': App.edit(); break;
      case 'save': App.save(); break;
      case 'cancel': App.cancel(); break;
      case 'reset': App.reset(); break;
      case 'menu': App.menuOpen = !App.menuOpen; App.renderTopbar(); break;
      case 'export': App.exportJSON(); break;
      case 'import': App.menuOpen = false; App.renderTopbar(); document.getElementById('import-file').click(); break;
      case 'print': App.menuOpen = false; App.renderTopbar(); window.print(); break;
      case 'zeros': App.hideZeros = !App.hideZeros; App.render(); break;
      case 'add-loans': d.loans.push({ name: '', payment: 0, frequency: 'Monthly', ends: '', notes: '' }); App.render(); break;
      case 'add-leases': d.leases.push({ name: '', payment: 0, frequency: 'Monthly', ends: '', notes: '' }); App.render(); break;
      case 'del-loans': d.loans.splice(idx, 1); App.render(); break;
      case 'del-leases': d.leases.splice(idx, 1); App.render(); break;
      case 'add-line': {
        var rows = d.details[t.getAttribute('data-sec')][Number(t.getAttribute('data-gi'))].rows;
        rows.push({ code: '', label: 'New line', budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 });
        App.renderContent();
        var last = document.querySelectorAll('.dtable input.code'); if (last.length) last[last.length - 1].focus();
        break;
      }
      case 'del-line': {
        var g = d.details[t.getAttribute('data-sec')][Number(t.getAttribute('data-gi'))], ri = Number(t.getAttribute('data-ri'));
        if (confirm('Remove “' + (g.rows[ri].label || 'this line') + '” from the statement?')) { g.rows.splice(ri, 1); App.renderContent(); }
        break;
      }
      case 'align-reported': NS.alignReported(d); App.renderContent(); App.toast('Page 1 figures now match the line items.', 'ok'); break;
      case 'cycle':
        if (!App.editing) break;
        if (type === 'matrix') { var col = t.getAttribute('data-col'); if (col === 'overall') break; d.matrix[idx].status = d.matrix[idx].status || {}; d.matrix[idx].status[col] = NS.cycle[d.matrix[idx].status[col] || 'green']; }
        else d[type][idx].rating = NS.cycle[d[type][idx].rating || 'green'];
        App.renderContent(); break;
      case 'add-item':
        d[type].push(type === 'celebrate' ? { main: 'New highlight', meta: '' } : { rating: 'amber', main: 'New item', meta: '' }); App.renderContent(); break;
      case 'del-item': d[type].splice(idx, 1); App.renderContent(); break;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target, d = App.current();
    var p = el.getAttribute('data-path');
    if (p && d) { NS.setPath(d, p, el.type === 'number' ? Number(el.value) : el.value); return; }
    var a = el.getAttribute('data-action');
    if (a === 'filter') {
      App.filter = el.value;
      App.renderTopbar(); App.renderContent();
      var f = document.getElementById('detail-filter'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
    } else if (a === 'matrix-note' && d) {
      var i = Number(el.getAttribute('data-idx')), col = el.getAttribute('data-col');
      d.matrix[i].notes = d.matrix[i].notes || {}; d.matrix[i].notes[col] = el.value;
    } else if (a === 'enrol-trend' && d) {
      // update the data and redraw just the sparkline so typing keeps focus
      var k = Number(el.getAttribute('data-idx'));
      d.schools[k].enrolTrend = el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(Number);
      var tr = d.schools[k].enrolTrend.filter(function (n) { return !isNaN(n); });
      var sw = document.getElementById('spark-' + k), nw = document.getElementById('now-' + k);
      if (sw) sw.innerHTML = NS.sparkline(tr); if (nw) nw.innerHTML = NS.enrolNow(tr);
    }
  });

  // Numbers feed totals and traffic lights: re-render once a field is committed, not on every keystroke.
  document.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-path') && e.target.type === 'number') App.renderContent();
    if (e.target.id === 'import-file' && e.target.files[0]) { App.importJSON(e.target.files[0]); e.target.value = ''; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (App.menuOpen) { App.menuOpen = false; App.renderTopbar(); } App.setDrawer(false); }
  });

  window.addEventListener('hashchange', function () {
    if (App._reverting) { App._reverting = false; return; }
    if (App.dirty() && !confirm('You have unsaved changes on this board. Leave without saving?')) {
      if (App.lastHash && App.lastHash !== location.hash) { App._reverting = true; location.hash = App.lastHash; }
      return;
    }
    if (App.editing) App.cancel();
    var prev = App.route, next = R.parse();
    if (!prev || prev.view !== next.view || prev.school !== next.school) { App.filter = ''; window.scrollTo(0, 0); }
    App.lastHash = location.hash; App.menuOpen = false; App.render();
  });

  if (!location.hash) location.replace('#/databoard');
  App.lastHash = location.hash;
  App.render();
})();
