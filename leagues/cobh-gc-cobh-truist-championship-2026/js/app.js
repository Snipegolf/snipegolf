/**
 * SnipeGolf League Frontend — app.js
 * Template variables substituted by Apps Script on provisioning.
 *
 * https://script.google.com/macros/s/AKfycbzf26drG5RAVZTBIOVzOJbK7yyNOHZvvi6iaTOq0lre50coQR5sCztY3xBDj4CQDJl9mw/exec  — Apps Script web app URL
 * cobh-gc-cobh-truist-championship-2026      — league slug
 * 401811945   — ESPN event ID
 */

(function () {
  'use strict';

  var API_BASE = 'https://script.google.com/macros/s/AKfycbzf26drG5RAVZTBIOVzOJbK7yyNOHZvvi6iaTOq0lre50coQR5sCztY3xBDj4CQDJl9mw/exec';
  var SLUG     = 'cobh-gc-cobh-truist-championship-2026';
  var ESPN_ID  = '401811945';

  // Refresh interval in ms (60s during play, 5min pre-tournament)
  var REFRESH_MS = 60000;

  /* ── Utility helpers ─────────────────────────────────────────────────── */

  function fmt(n) {
    if (n === null || n === undefined || n === '') return '—';
    var num = Number(n);
    if (isNaN(num)) return String(n);
    if (num === 0) return 'E';
    return num > 0 ? '+' + num : String(num);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiUrl(mode, extra) {
    var url = API_BASE + '?league=' + encodeURIComponent(SLUG) + '&mode=' + mode;
    if (extra) url += '&' + extra;
    return url;
  }

  function fetchJson(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch (e) { cb(e); }
      } else {
        cb(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function () { cb(new Error('Network error')); };
    xhr.send();
  }

  /* ── Leaderboard page ────────────────────────────────────────────────── */

  function initLeaderboard() {
    var wrap = document.getElementById('lb-body');
    if (!wrap) return;

    function load() {
      fetchJson(apiUrl('leaderboard', 'format=json'), function (err, data) {
        var upd = document.getElementById('lb-updated');

        if (err || !data) {
          if (wrap) wrap.innerHTML =
            '<tr><td colspan="12" class="text-center" style="color:var(--red);padding:20px">Error loading leaderboard.</td></tr>';
          return;
        }

        // Update stats
        var entries = data.entries || [];
        var elCount = document.getElementById('stat-entries');
        var elLeader = document.getElementById('stat-leader');
        var elScore = document.getElementById('stat-score');

        if (elCount) elCount.textContent = entries.length;
        if (entries.length > 0) {
          if (elLeader) elLeader.textContent = entries[0].name.split(' ').pop();
          if (elScore)  elScore.textContent  = fmt(entries[0].total);
        }
        if (upd) {
          var ts = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
          upd.textContent = 'Updated ' + ts;
        }

        if (!entries.length) {
          wrap.innerHTML =
            '<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:32px">' +
            esc(data.message || 'No entries yet — check back once picks are submitted.') +
            '</td></tr>';
          return;
        }

        var html = '';
        entries.forEach(function (r) {
          var rank    = Number(r.rank) || 0;
          var rankCls = rank === 1 ? 'medal-1' : rank === 2 ? 'medal-2' : rank === 3 ? 'medal-3' : '';
          var mv      = String(r.move || '');
          var mvCls   = mv.indexOf('\u25b2') >= 0 ? 'move-up' : mv.indexOf('\u25bc') >= 0 ? 'move-down' : 'move-same';
          var picks   = Array.isArray(r.picks) ? r.picks : [];

          // Hide pick columns ≤600px via data attributes (CSS targets .hide-mobile)
          html += '<tr>';
          html += '<td class="rank ' + rankCls + '">' + rank + '</td>';
          html += '<td><strong>' + esc(r.name) + '</strong></td>';
          html += '<td class="' + rankCls + '">' + fmt(r.total) + '</td>';
          html += '<td class="' + mvCls + '">' + esc(mv) + '</td>';
          for (var p = 0; p < 8; p++) {
            var hideCls = p >= 4 ? ' class="hide-sm"' : '';
            html += '<td' + hideCls + '>' + esc(picks[p] || '') + '</td>';
          }
          html += '</tr>';
        });
        wrap.innerHTML = html;
      });
    }

    load();
    setInterval(load, REFRESH_MS);
  }

  /* ── Field / WD status page ──────────────────────────────────────────── */

  function initField() {
    var wrap = document.getElementById('field-wrap');
    if (!wrap) return;

    fetchJson(apiUrl('field', 'format=json'), function (err, data) {
      if (err || !data) {
        wrap.innerHTML = '<p style="color:var(--red)">Error loading field.</p>';
        return;
      }

      var brackets = ['b1', 'b2', 'b3', 'b4'];
      var labels   = ['Bracket 1 — Top Ranked', 'Bracket 2', 'Bracket 3', 'Bracket 4 — Longshots'];
      var html     = '';

      brackets.forEach(function (b, idx) {
        var players = data[b] || [];
        html += '<h3 style="color:var(--accent2);margin:20px 0 8px">' + labels[idx] + '</h3>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
        players.forEach(function (p) {
          var name = typeof p === 'object' ? (p.name || '') : String(p);
          var wd   = typeof p === 'object' ? !!p.wd : false;
          html += '<span style="' +
            'padding:4px 10px;border-radius:14px;font-size:.78rem;' +
            (wd ? 'background:#2a1a1a;color:var(--red);text-decoration:line-through;'
                : 'background:#13132a;color:var(--text);') +
            '">' + esc(name) + (wd ? ' WD' : '') + '</span>';
        });
        html += '</div>';
      });

      wrap.innerHTML = html;
    });
  }

  /* ── Picks form client-side validation ───────────────────────────────── */

  function initPicksForm() {
    var form = document.getElementById('picks-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      var selects  = form.querySelectorAll('select[required]');
      var values   = [];
      var allFilled = true;

      // Use a polyfill-safe loop
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

      // Duplicate check
      var seen = {};
      for (var j = 0; j < values.length; j++) {
        if (seen[values[j]]) {
          e.preventDefault();
          showError('You cannot pick the same golfer twice: ' + values[j]);
          return;
        }
        seen[values[j]] = true;
      }

      // GDPR consent
      var gdpr = form.querySelector('input[name="gdpr"]');
      if (gdpr && !gdpr.checked) {
        e.preventDefault();
        showError('You must accept the data consent to submit your picks.');
        return;
      }

      // Disable submit button to prevent double-submit
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled    = true;
        btn.textContent = '⏳ Submitting…';
      }
    });
  }

  function showError(msg) {
    var existing = document.getElementById('client-error');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id        = 'client-error';
    div.className = 'msg-err';
    div.textContent = '⚠️ ' + msg;
    var form = document.getElementById('picks-form');
    if (form) form.insertBefore(div, form.firstChild);
    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── QR code generation ──────────────────────────────────────────────── */

  function initQr() {
    var wrap = document.getElementById('qr-target');
    if (!wrap) return;

    var url = wrap.getAttribute('data-url') || window.location.href;

    // Use qrcode.js from CDN (loaded in qr.html)
    if (typeof QRCode !== 'undefined') {
      new QRCode(wrap, {
        text:          url,
        width:         280,
        height:        280,
        colorDark:     '#000000',
        colorLight:    '#ffffff',
        correctLevel:  QRCode.CorrectLevel.H
      });
    } else {
      // Fallback: Google Charts QR API
      var img    = document.createElement('img');
      img.src    = 'https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl=' +
                   encodeURIComponent(url) + '&choe=UTF-8';
      img.alt    = 'QR Code';
      img.width  = 280;
      img.height = 280;
      wrap.appendChild(img);
    }

    // Show URL under QR
    var urlLabel = document.getElementById('qr-url-label');
    if (urlLabel) urlLabel.textContent = url;
  }

  /* ── Config/branding loader ──────────────────────────────────────────── */

  function loadConfig() {
    fetchJson(apiUrl('config', 'format=json'), function (err, cfg) {
      if (err || !cfg) return;

      // Update document title
      if (cfg.tournament) document.title = cfg.tournament + ' | SnipeGolf';

      // Update status badge
      var badge = document.getElementById('status-badge');
      if (badge && cfg.status) {
        badge.textContent = cfg.status.toUpperCase();
        badge.className   = 'badge badge-' + cfg.status.toLowerCase();
      }

      // Update prize text
      var prizeEl = document.querySelectorAll('[data-prize]');
      for (var i = 0; i < prizeEl.length; i++) {
        prizeEl[i].textContent = cfg.prizeText || '';
      }
    });
  }

  /* ── Page init router ────────────────────────────────────────────────── */

  function init() {
    var page = document.body.getAttribute('data-page') || '';

    if (page === 'leaderboard') { initLeaderboard(); loadConfig(); }
    else if (page === 'picks')  { initPicksForm(); }
    else if (page === 'field')  { initField(); }
    else if (page === 'qr')     { initQr(); }
    else if (page === 'admin')  { loadConfig(); }
    else if (page === 'index')  { initLeaderboard(); loadConfig(); }

    // Run on all pages
    loadConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
