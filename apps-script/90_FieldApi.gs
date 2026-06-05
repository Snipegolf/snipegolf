/**
 * SnipeGolf v3 — File 90: FieldApi
 * Route: GET ?route=field&comp=<comp_slug>   (or &espn=<id>)
 * Returns the full live field for the tournament: pos, name, total, today, thru, round scores.
 *
 * Used by field.html (per-league field page).
 *
 * V8 strict, var only, IIFE-safe.
 */
(function () {
  var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=';

  function parseScore_(s) {
    if (s === 0 || s === '0' || s === 'E' || s === 'e') return 0;
    if (s == null || s === '') return null;
    var str = String(s);
    var sign = 1;
    if (str.charAt(0) === '+') str = str.substring(1);
    else if (str.charAt(0) === '-') { sign = -1; str = str.substring(1); }
    var n = parseInt(str, 10);
    if (isNaN(n)) return null;
    return sign * n;
  }

  function fetchField_(espnId) {
    if (!espnId) return { ok: false, error: 'no_espn_id' };
    try {
      var resp = UrlFetchApp.fetch(ESPN_BASE + encodeURIComponent(espnId), { muteHttpExceptions: true, followRedirects: true });
      if (resp.getResponseCode() !== 200) return { ok: false, error: 'espn_' + resp.getResponseCode() };
      var d = JSON.parse(resp.getContentText());
      var ev = (d.events || [])[0]; if (!ev) return { ok: false, error: 'no_event' };
      var comp = (ev.competitions || [])[0]; if (!comp) return { ok: false, error: 'no_competition' };
      var competitors = comp.competitors || [];
      var status = comp.status || ev.status || {};
      var period = (status.period || ((status.type || {}).period)) || null;
      var roundLbl = period ? ('R' + period) : ((status.type || {}).shortDetail || '');
      var cutScore = null;
      if (typeof comp.cutLine !== 'undefined') cutScore = parseScore_(comp.cutLine);

      var field = [];
      for (var i = 0; i < competitors.length; i++) {
        var c = competitors[i];
        var ath = c.athlete || {};
        var st = c.status || {};
        var pos = ((st.position) || {}).displayName || '';
        var posShort = pos;
        var stat = ((st.type) || {}).description || '';
        var linescores = c.linescores || [];
        var r1 = linescores[0] ? (linescores[0].displayValue || linescores[0].value) : '';
        var r2 = linescores[1] ? (linescores[1].displayValue || linescores[1].value) : '';
        var r3 = linescores[2] ? (linescores[2].displayValue || linescores[2].value) : '';
        var r4 = linescores[3] ? (linescores[3].displayValue || linescores[3].value) : '';
        var thru = st.thru != null ? String(st.thru) : ((st.position && st.position.thru) ? String(st.position.thru) : '');
        if (!thru && stat) thru = stat;
        var total = parseScore_(c.score);
        var today = null;
        // today = the current round's linescore relative to par
        if (period && linescores[period - 1]) {
          var lr = linescores[period - 1];
          var tdy = lr.value;
          if (tdy != null) {
            // ESPN sometimes gives strokes, sometimes "+1"/"-2"; try displayValue first
            today = parseScore_(lr.displayValue);
            if (today == null) today = parseScore_(tdy);
          }
        }
        field.push({
          pos: posShort || '',
          name: String(ath.displayName || ''),
          total: total,
          today: today,
          thru: thru,
          status: stat,
          r1: r1, r2: r2, r3: r3, r4: r4
        });
      }
      return { ok: true, field: field, round: roundLbl, cut_score: cutScore, status: stat_(status), ts: nowIso_() };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  function stat_(s) { try { return (s && s.type && s.type.state) || ''; } catch (e) { return ''; } }

  function apiField_(p) {
    var espnId = (p && p.espn) ? String(p.espn) : '';
    if (!espnId && p && p.comp) {
      var comp = findRow_(TAB.COMPS, 'comp_slug', String(p.comp));
      if (comp) espnId = String(comp.espn_id || '');
    }
    if (!espnId && p && p.league) {
      var lg = findRow_(TAB.LEAGUES, 'league_slug', String(p.league));
      if (lg) {
        var c2 = findRow_(TAB.COMPS, 'comp_slug', String(lg.comp_slug));
        if (c2) espnId = String(c2.espn_id || '');
      }
    }
    return jsonOut_(fetchField_(espnId));
  }

  globalThis.apiField_ = apiField_;
})();

// Override doGet — 90_ loads after 86 and 87
function doGet(e) {
  try {
    var p = e && e.parameter ? e.parameter : {};
    var route = String(p.route || 'ping');

    if (route === 'field') return apiField_(p);
    if (route === 'leaderboard') return (globalThis.apiLeaderboardV2_ || globalThis.apiLeaderboard_)(p);
    if (route === 'me') return apiMe_(p);
    if (route === 'admin_leagues') return apiAdminLeagues_(p);
    if (route === 'admin_list') return apiAdminList_(p);

    if (route === 'ping') return json_({ ok: true, ts: nowIso_() });
    if (route === 'comp') return json_(getComp_(p.slug));
    if (route === 'league') return json_(getLeague_(p.slug));
    if (route === 'brackets') return json_(getBrackets_(p.comp));
    if (route === 'participants') return json_(getParticipantsPublic_(p.league));
    if (route === 'picks') return json_(getPicksPublic_(p.league));
    if (route === 'mypick') return json_(getMyPick_(p.pid, p.t));

    return json_({ ok: false, error: 'unknown_route', route: route });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
