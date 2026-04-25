// SnipeGolf — leaderboard.js
// Fetches leaderboard data from Apps Script Web App
// and renders it for the private group view.

(function() {
  var WEB_APP_URL = ''; // Set this after Apps Script is deployed
  var groupCode = getQueryParam('group');
  var refreshInterval = 60000; // 1 minute default

  function getQueryParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
  }

  function fetchLeaderboard() {
    if (!groupCode || !WEB_APP_URL) return;
    fetch(WEB_APP_URL + '?action=getLeaderboard&group=' + groupCode)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderLeaderboard(data);
        document.getElementById('last-updated').textContent =
          'Updated: ' + new Date().toLocaleTimeString('en-IE');
      })
      .catch(function(e) {
        console.error('Leaderboard fetch error:', e);
      });
  }

  function renderLeaderboard(data) {
    if (!data || !data.entries) return;

    // Set pub name
    if (data.pubName) {
      document.getElementById('pub-name').textContent = data.pubName;
    }
    if (data.tournament) {
      document.getElementById('tournament-name').textContent = data.tournament;
    }

    var tbody = document.getElementById('lb-body');
    tbody.innerHTML = '';

    data.entries.forEach(function(e, i) {
      var moveIcon = e.move > 0 ? '<span class="move-up">▲' + e.move + '</span>'
                   : e.move < 0 ? '<span class="move-down">▼' + Math.abs(e.move) + '</span>'
                   : '<span class="move-same">—</span>';

      var rankClass = i === 0 ? 'medal-1' : i === 1 ? 'medal-2' : i === 2 ? 'medal-3' : '';

      var row = '<tr>' +
        '<td class="rank ' + rankClass + '">' + e.rank + '</td>' +
        '<td>' + moveIcon + '</td>' +
        '<td>' + e.name + '</td>' +
        '<td class="score">' + formatScore(e.total) + '</td>' +
        '<td style="color:var(--muted);font-size:0.8rem">' + e.picks + '</td>' +
        '</tr>';
      tbody.innerHTML += row;
    });
  }

  function formatScore(s) {
    if (s === null || s === undefined || s === '') return '-';
    if (s === 0) return 'E';
    return s > 0 ? '+' + s : s.toString();
  }

  // Auto-refresh
  fetchLeaderboard();
  setInterval(fetchLeaderboard, refreshInterval);

  // Manual refresh button
  var btn = document.getElementById('refresh-btn');
  if (btn) btn.addEventListener('click', fetchLeaderboard);

})();
