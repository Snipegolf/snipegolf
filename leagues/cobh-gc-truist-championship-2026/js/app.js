/**
 * SnipeGolf — app.js (v2)
 * Single bundle: theme picker, leaderboard fetch, picks form, QR, config loader.
 *
 * Template variables (substituted by Apps Script on provisioning):
 *   https://script.google.com/macros/s/AKfycbzf26drG5RAVZTBIOVzOJbK7yyNOHZvvi6iaTOq0lre50coQR5sCztY3xBDj4CQDJl9mw/exec           Apps Script web-app URL
 *   cobh-gc-truist-championship-2026               league slug
 *   401811945            ESPN tournament event id
 *
 * Page router: <body data-page="leaderboard|picks|admin|index|qr|main-leaderboard|landing|terms|privacy">
 */

(function () {
  'use strict';

  var API_BASE = 'https://script.google.com/macros/s/AKfycbzf26drG5RAVZTBIOVzOJbK7yyNOHZvvi6iaTOq0lre50coQR5sCztY3xBDj4CQDJl9mw/exec';
  var SLUG     = 'cobh-gc-truist-championship-2026';
  var ESPN_ID  = '401811945';

  var REFRESH_MS  = 60000;
  var FAIL_TEXT   = 'Connection lost — retrying…';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtScore(n) {
    if (n === null || n === undefined || n === '') return '—';
    var num = Number(n);
    if (isNaN(num)) return String(n);
    if (num === 0) return 'E';
    return num > 0 ? '+' + num : String(num);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiUrl(mode, extra) {
    var base = API_BASE;
    if (!base || /\{\{|^$/.test(base)) return null;
    var url = base + '?league=' + encodeURIComponent(SLUG) + '&mode=' + mode;
    if (extra) url += '&' + extra;
    return url;
  }

  function fetchJson(url, cb) {
    if (!url) { cb(new Error('no url')); return; }
    if (window.fetch) {
      fetch(url, { mode: 'cors', credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) { cb(null, data); })
        .catch(function (err) { cb(err); });
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch (e) { cb(e); }
      } else cb(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { cb(new Error('Network error')); };
    xhr.send();
  }

  /* ── Theme picker ───────────────────────────────────────────────────── */

  function initThemePicker() {
    if (!window.SnipeThemes) return;
    var current = window.SnipeThemes.init();
    buildThemeFab(current);
  }

  function buildThemeFab(currentTheme) {
    if ($('.theme-fab')) return;

    var fab = document.createElement('button');
    fab.className = 'theme-fab';
    fab.setAttribute('aria-label', 'Choose theme');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 22a10 10 0 1 1 9.9-11.5c.4 2.5-1.6 4.5-4.1 4.5h-2a3 3 0 0 0-3 3v.5A3.5 3.5 0 0 1 12 22Z"/>' +
        '<circle cx="7.5" cy="11" r="1.2" fill="currentColor"/>' +
        '<circle cx="11" cy="6.5" r="1.2" fill="currentColor"/>' +
        '<circle cx="16.5" cy="8" r="1.2" fill="currentColor"/>' +
      '</svg>';

    var drawer = document.createElement('div');
    drawer.className = 'theme-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Theme picker');
    drawer.innerHTML =
      '<div class="theme-drawer__title">Theme</div>' +
      '<div class="theme-drawer__sub">Choose a course palette. Auto-rotates daily otherwise.</div>' +
      '<div class="theme-grid" id="theme-grid"></div>';

    document.body.appendChild(drawer);
    document.body.appendChild(fab);

    var grid = $('#theme-grid', drawer);
    window.SnipeThemes.list.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'theme-swatch';
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-pressed', String(t.id === currentTheme.id));
      btn.dataset.themeId = t.id;
      btn.innerHTML =
        '<span class="theme-swatch__dots">' +
          '<span class="theme-swatch__dot" style="background:' + t.tokens['--bg']      + '"></span>' +
          '<span class="theme-swatch__dot" style="background:' + t.tokens['--accent']  + '"></span>' +
          '<span class="theme-swatch__dot" style="background:' + t.tokens['--accent-2']+ '"></span>' +
        '</span>' +
        '<span><span class="theme-swatch__name">' + esc(t.name) + '</span>' +
        '<span class="theme-swatch__desc">' + esc(t.desc) + '</span></span>';
      btn.addEventListener('click', function () {
        var applied = window.SnipeThemes.apply(t.id);
        window.SnipeThemes.save(applied.id);
        $$('.theme-swatch', drawer).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeId === applied.id)); });
      });
      grid.appendChild(btn);
    });

    function close() { drawer.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); }
    function toggle() {
      var open = drawer.classList.toggle('open');
      fab.setAttribute('aria-expanded', String(open));
    }
    fab.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener('click', function (e) {
      if (!drawer.contains(e.target) && e.target !== fab) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  /* ── Leaderboard ───────────────────────────────────────────────────── */

  function startCountdown(el, ms) {
    if (!el) return;
    var remaining = ms / 1000;
    function tick() {
      remaining -= 1;
      if (remaining <= 0) remaining = ms / 1000;
      el.textContent = 'Refresh in ' + Math.max(0, Math.round(remaining)) + 's';
    }
    tick();
    setInterval(tick, 1000);
  }

  function expandRow(tr, picks) {
    var existing = tr.nextElementSibling;
    if (existing && existing.classList.contains('lb-detail-row')) {
      existing.parentNode.removeChild(existing);
      tr.classList.remove('expanded');
      return;
    }
    var detail = document.createElement('tr');
    detail.className = 'lb-detail-row';
    var cell = document.createElement('td');
    cell.colSpan = tr.children.length;
    var grid = '<div class="lb-detail-grid">';
    for (var i = 0; i < 8; i++) {
      grid += '<div><span>Pick ' + (i + 1) + '</span><strong>' + esc(picks[i] || '—') + '</strong></div>';
    }
    grid += '</div>';
    cell.innerHTML = '<div class="lb-detail">' + grid + '</div>';
    detail.appendChild(cell);
    tr.parentNode.insertBefore(detail, tr.nextSibling);
    tr.classList.add('expanded');
  }

  function renderLeaderboard(data) {
    var wrap    = $('#lb-body');
    var entries = (data && data.entries) || [];
    var elCount = $('#stat-entries');
    var elLeader= $('#stat-leader');
    var elScore = $('#stat-score');
    var elUpd   = $('#lb-updated');

    if (elCount)  elCount.textContent  = entries.length || '0';
    if (entries.length > 0) {
      if (elLeader) elLeader.textContent = (entries[0].name || '').split(' ').pop();
      if (elScore)  elScore.textContent  = fmtScore(entries[0].total);
    } else {
      if (elLeader) elLeader.textContent = '—';
      if (elScore)  elScore.textContent  = '—';
    }
    if (elUpd) {
      var ts = data && data.updatedAt ? new Date(data.updatedAt) : new Date();
      elUpd.textContent = 'Updated ' + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    if (!wrap) return;
    if (!entries.length) {
      wrap.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">' +
        esc((data && data.message) || 'No entries yet — check back once picks are submitted.') +
        '</td></tr>';
      return;
    }

    var html = '';
    entries.forEach(function (r, idx) {
      var rank   = Number(r.rank) || (idx + 1);
      var medal  = rank === 1 ? 'medal-1' : rank === 2 ? 'medal-2' : rank === 3 ? 'medal-3' : '';
      var mv     = String(r.move || '');
      var mvCls  = mv.indexOf('\u25b2') >= 0 ? 'move-up' : mv.indexOf('\u25bc') >= 0 ? 'move-down' : 'move-same';
      var picks  = Array.isArray(r.picks) ? r.picks : [];
      var best   = picks.length ? picks[0] : '';
      var worst  = picks.length ? picks[picks.length - 1] : '';

      html += '<tr class="expandable" data-picks="' + esc(JSON.stringify(picks)) + '">';
      html += '<td class="col-rank ' + medal + '">' + rank + '</td>';
      html += '<td class="col-name"><strong>' + esc(r.name) + '</strong></td>';
      html += '<td class="col-score ' + medal + '">' + fmtScore(r.total) + '</td>';
      html += '<td class="hide-sm">' + esc(best) + '</td>';
      html += '<td class="hide-sm">' + esc(worst) + '</td>';
      html += '<td class="hide-xs ' + mvCls + '">' + esc(mv || '—') + '</td>';
      html += '</tr>';
    });
    wrap.innerHTML = html;

    $$('.expandable', wrap).forEach(function (tr) {
      tr.addEventListener('click', function () {
        var picks;
        try { picks = JSON.parse(tr.getAttribute('data-picks') || '[]'); }
        catch (e) { picks = []; }
        expandRow(tr, picks);
      });
    });
  }

  function showLbError(wrap, err) {
    if (!wrap) return;
    wrap.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--bad);padding:24px">' +
      esc(err && err.message ? FAIL_TEXT : 'No data') + '</td></tr>';
  }

  function initLeaderboard() {
    var wrap = $('#lb-body');
    if (!wrap) return;
    var url = apiUrl('leaderboard', 'format=json');
    if (!url) {
      wrap.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Awaiting deployment configuration…</td></tr>';
      return;
    }

    function load() {
      fetchJson(url, function (err, data) {
        if (err) { showLbError(wrap, err); return; }
        renderLeaderboard(data);
      });
    }

    load();
    setInterval(function () {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') load();
    });

    var counter = $('#refresh-counter');
    if (counter) startCountdown(counter, REFRESH_MS);
  }

  /* ── Public main leaderboard (ESPN) ────────────────────────────────── */

  function initMainLeaderboard() {
    var tbody = $('#scoreboard-body');
    if (!tbody) return;
    var url = ESPN_ID && !/\{\{/.test(ESPN_ID)
      ? 'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=' + encodeURIComponent(ESPN_ID)
      : 'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard';

    function load() {
      fetchJson(url, function (err, data) {
        if (err || !data) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--bad);padding:24px">' + FAIL_TEXT + '</td></tr>';
          return;
        }
        var ev = (data.events && data.events[0]) || data;
        var comp = ev.competitions && ev.competitions[0];
        var competitors = (comp && comp.competitors) || [];

        var tEl = $('#tournament-name');
        var cEl = $('#course-name');
        var sEl = $('#round-status');
        var uEl = $('#last-updated');
        if (tEl && ev.name) tEl.textContent = ev.name;
        if (cEl && ev.courses && ev.courses[0]) cEl.textContent = ev.courses[0].name;
        if (sEl && comp && comp.status && comp.status.type) sEl.textContent = comp.status.type.shortDetail || comp.status.type.description || '';
        if (uEl) uEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

        if (!competitors.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No leaderboard data available yet.</td></tr>';
          return;
        }

        var html = '';
        competitors.slice(0, 80).forEach(function (c) {
          var ath  = c.athlete || {};
          var stats= c.statistics || [];
          var pos  = (c.status && c.status.position && c.status.position.displayName) || '—';
          var thru = (c.status && (c.status.thru || (c.status.type && c.status.type.shortDetail))) || '—';
          var today= '—';
          var total= c.score || (c.statistics && c.statistics[0] && c.statistics[0].displayValue) || '—';
          stats.forEach(function (s) {
            if (s.name === 'scoreToPar') total = s.displayValue;
            if (s.name === 'currentRoundScore' || s.name === 'todaysPar') today = s.displayValue;
          });
          var country = (ath.flag && ath.flag.alt) || (ath.citizenship) || '';

          html += '<tr>';
          html += '<td class="col-rank">' + esc(pos) + '</td>';
          html += '<td class="col-name"><strong>' + esc(ath.displayName || '—') + '</strong></td>';
          html += '<td class="hide-sm">' + esc(country) + '</td>';
          html += '<td class="col-score">' + esc(total) + '</td>';
          html += '<td class="hide-sm">' + esc(today) + '</td>';
          html += '<td>' + esc(thru) + '</td>';
          html += '</tr>';
        });
        tbody.innerHTML = html;
      });
    }

    load();
    setInterval(function () {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);

    var counter = $('#refresh-counter');
    if (counter) startCountdown(counter, REFRESH_MS);
  }

  /* ── Picks form ────────────────────────────────────────────────────── */

  function initPicksForm() {
    var form = $('#picks-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      var selects = $$('select[required]', form);
      var values = [];
      var allFilled = true;

      for (var i = 0; i < selects.length; i++) {
        var v = selects[i].value;
        if (!v) { allFilled = false; break; }
        values.push(v);
      }

      if (!allFilled) {
        e.preventDefault();
        showError('Please select a golfer for every pick slot.');
        return;
      }

      var seen = {};
      for (var j = 0; j < values.length; j++) {
        if (seen[values[j]]) {
          e.preventDefault();
          showError('You cannot pick the same golfer twice: ' + values[j]);
          return;
        }
        seen[values[j]] = true;
      }

      // Tiebreaker — score to par (e.g. -23), NOT a 72-hole stroke total
      var tb = form.querySelector('input[name="tiebreaker"]');
      if (tb) {
        var n = Number(tb.value);
        if (tb.value === '' || isNaN(n) || n < -40 || n > 40) {
          e.preventDefault();
          showError('Enter the winner\'s score to par, e.g. -23. Must be between -40 and +40.');
          return;
        }
      }

      var gdpr = form.querySelector('input[name="gdpr"]');
      if (gdpr && !gdpr.checked) {
        e.preventDefault();
        showError('You must accept the data consent to submit your picks.');
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    });
  }

  function showError(msg) {
    var existing = $('#client-error');
    if (existing) existing.parentNode.removeChild(existing);
    var div = document.createElement('div');
    div.id = 'client-error';
    div.className = 'msg msg-err';
    div.textContent = msg;
    var form = $('#picks-form');
    if (form) form.insertBefore(div, form.firstChild);
    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── QR ────────────────────────────────────────────────────────────── */

  function initQr() {
    var wrap = $('#qr-target');
    if (!wrap) return;
    var url = wrap.getAttribute('data-url') || window.location.href;

    if (typeof QRCode !== 'undefined') {
      new QRCode(wrap, {
        text: url, width: 360, height: 360,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } else {
      var img = document.createElement('img');
      img.src = 'https://chart.googleapis.com/chart?chs=360x360&cht=qr&chl=' + encodeURIComponent(url) + '&choe=UTF-8';
      img.alt = 'Picks QR code';
      img.width = 360; img.height = 360;
      wrap.appendChild(img);
    }
    var lbl = $('#qr-url-label');
    if (lbl) lbl.textContent = url;
  }

  /* ── Config / branding ─────────────────────────────────────────────── */

  function loadConfig() {
    var url = apiUrl('config', 'format=json');
    if (!url) return;
    fetchJson(url, function (err, cfg) {
      if (err || !cfg) return;
      if (cfg.tournament) {
        var t = $('[data-tournament]'); if (t) t.textContent = cfg.tournament;
        document.title = document.title.replace('Cobh GC — Truist Championship 2026', cfg.tournament);
      }
      var badge = $('#status-badge');
      if (badge && cfg.status) {
        badge.textContent = cfg.status.toUpperCase();
        badge.className = 'badge badge-' + cfg.status.toLowerCase();
      }
      $$('[data-prize]').forEach(function (el) { el.textContent = cfg.prizeText || el.textContent; });
      $$('[data-club-name]').forEach(function (el) { if (cfg.clubName) el.textContent = cfg.clubName; });
    });
  }

  /* ── Live ticker ───────────────────────────────────────────────────── */

  function initTicker() {
    var ticker = $('#live-ticker');
    if (!ticker) return;
    var demo = [
      { club: 'Royal County Down GC', score: '-12', leader: 'Lowry' },
      { club: 'Lahinch GC',           score: '-9',  leader: 'McIlroy' },
      { club: 'Portmarnock',          score: '-7',  leader: 'Rahm' },
      { club: 'The K Club',           score: '-6',  leader: 'Scheffler' },
      { club: 'Ballybunion',          score: '-5',  leader: 'Hovland' }
    ];
    var html = '';
    demo.forEach(function (d) {
      html += '<span class="ticker__pill"><span class="live-dot"></span>' +
              esc(d.club) + ' · ' + esc(d.leader) + ' <strong>' + esc(d.score) + '</strong></span>';
    });
    ticker.innerHTML = html;
  }

  /* ── Page router ───────────────────────────────────────────────────── */

  function init() {
    initThemePicker();
    var page = (document.body.getAttribute('data-page') || '').toLowerCase();
    switch (page) {
      case 'leaderboard':       initLeaderboard(); loadConfig(); break;
      case 'picks':             initPicksForm();  loadConfig(); break;
      case 'admin':             loadConfig(); break;
      case 'qr':                initQr(); loadConfig(); break;
      case 'index':             initLeaderboard(); loadConfig(); break;
      case 'main-leaderboard':  initMainLeaderboard(); break;
      case 'landing':           initTicker(); break;
      default: loadConfig();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
