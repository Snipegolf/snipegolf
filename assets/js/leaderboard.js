// SnipeGolf — leaderboard.js
// Fetches leaderboard data from Apps Script Web App
// and renders it for the private group view on GitHub Pages.

(function() {
  // ── Your deployed Apps Script Web App URL ─────────────────────
  var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzf26drG5RAVZTBIOVzOJbK7yyNOHZvvi6iaTOq0lre50coQR5sCztY3xBDj4CQDJl9mw/exec';

  var groupCode      = getQueryParam('group') || getQueryParam('gc');
  var refreshInterval = 120000; // 2 minutes

  function getQueryParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
  }

  // ── Initial load ───────────────────────────────────────────────
  if (!groupCode) {
    document.getElementById('pub-name').textContent = 'No group code in URL';
    document.getElementById('lb-body').innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">' +
      'Use the link provided by your pub admin to view your leaderboard.</td></tr>';
    return;
  }

  fetchLeaderboard();
  setInterval(fetchLeaderboard, refreshInterval);

  var btn = document.getElementById('refresh-btn');
  if (btn) btn.addEventListener('click', fetchLeaderboard);

  // ── Fetch from Apps Script ─────────────────────────────────────
  function fetchLeaderboard() {
    fetch(WEB_APP_URL + '?mode=leaderboard&gc=' + encodeURIComponent(groupCode) + '&format=json')
      .then(function(r) { return r.text(); })
      .then(function(text) {
        try {
          var data = JSON.parse(text);
          renderLeaderboard(data);
        } catch(e) {
          // If it returned HTML (legacy), show fallback message
          showError('Leaderboard data unavailable. Try refreshing in a moment.');
        }
        document.getElementById('last-updated').textContent =
          'Updated: ' + new Date().toLocaleTimeString('en-IE');
      })
      .catch(function(e) {
        showError('Could not load leaderboard. Check your connection.');
        console.error('Leaderboard fetch error:', e);
      });
  }

  // ── Render ─────────────────────────────────────────────────────
  function renderLeaderboard(data) {
    if (!data) return;

    if (data.error) {
      showError(data.error);
      return;
    }

    if (data.pubName)    document.getElementById('pub-name').textContent = data.pubName;
    if (data.tournament) document.getElementById('tournament-name').textContent = data.tournament;
    if (data.prize)      document.getElementById('prize-display').textContent = '🏆 ' + data.prize;

    var tbody = document.getElementById('lb-body');
    tbody.innerHTML = '';

    var entries = data.entries || [];
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No entries yet — check back once the tournament starts.</td></tr>';
      return;
    }

    entries.forEach(function(e, i) {
      var pos = i + 1;
      var moveIcon = '';
      if (e.move > 0)      moveIcon = '<span class="move-up">▲' + e.move + '</span>';
      else if (e.move < 0) moveIcon = '<span class="move-down">▼' + Math.abs(e.move) + '</span>';
      else                 moveIcon = '<span class="move-same">—</span>';

      var rankClass = pos === 1 ? 'medal-1' : pos === 2 ? 'medal-2' : pos === 3 ? 'medal-3' : 'rank';

      var scoreStr = formatScore(e.total);

      tbody.innerHTML +=
        '<tr>' +
        '<td class="' + rankClass + '">' + pos + '</td>' +
        '<td>' + moveIcon + '</td>' +
        '<td><strong>' + esc(e.name) + '</strong></td>' +
        '<td class="score" style="color:' + scoreColour(e.total) + '">' + scoreStr + '</td>' +
        '<td style="font-size:0.78rem;color:var(--muted)">' + esc(e.pick1||'') + '</td>' +
        '<td style="font-size:0.78rem;color:var(--muted)">' + esc(e.pick2||'') + '</td>' +
        '</tr>';
    });

    // Update entry count stat
    var cntEl = document.getElementById('entry-count');
    if (cntEl) cntEl.textContent = entries.length;
  }

  function formatScore(s) {
    if (s === null || s === undefined || s === '') return '—';
    var n = parseFloat(s);
    if (isNaN(n)) return '—';
    if (n === 0) return 'E';
    return n > 0 ? '+' + n : n.toString();
  }

  function scoreColour(s) {
    if (s === null || s === undefined || s === '') return 'var(--muted)';
    var n = parseFloat(s);
    if (isNaN(n)) return 'var(--muted)';
    if (n < 0) return 'var(--green)';
    if (n > 0) return 'var(--red)';
    return 'var(--text)';
  }

  function esc(str) {
    return (str || '').toString()
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function showError(msg) {
    var tbody = document.getElementById('lb-body');
    if (tbody) tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:32px">⚠️ ' + esc(msg) + '</td></tr>';
  }

})();
