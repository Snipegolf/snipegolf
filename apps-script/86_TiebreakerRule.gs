/**
 * SnipeGolf v3 — 86_TiebreakerRule.gs
 *
 * Rebuilds the leaderboard sort using the locked tiebreaker spec:
 *  Primary sort: total picks score ASC (lower better)
 *  TB1 (close-to-pin): winner_score - player_tb (the actual to-par the leader is at).
 *      >= 0 means player guessed under or exact → valid. < 0 = overshot.
 *      Among valid: smallest distance wins. Among overshots: smallest |distance| wins.
 *      All valid players rank ahead of all overshot players.
 *  TB2 (best finishes): compare sorted list of pick FINISH POSITIONS head-to-head.
 *      Each pick has an ESPN position (1, 2, T3 → 3, etc). Lower = better.
 *      Cut/WD/DQ = 999 (worst). Sort each player's 4 pick-positions ascending,
 *      then compare element-by-element until one wins.
 *  TB3: alphabetical by display_name (deterministic).
 *
 * Also enriches each pick with `position_int` from ESPN.
 *
 * Loaded after 85_LeaderboardApi.gs (alphabetical) — overrides apiLeaderboard_.
 */

(function () {
  var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=';

  function fetchScores2_(espnId) {
    if (!espnId) return { players: {}, winnerScore: null, ts: '' };
    try {
      var resp = UrlFetchApp.fetch(ESPN_BASE + encodeURIComponent(espnId), { muteHttpExceptions: true, followRedirects: true });
      if (resp.getResponseCode() !== 200) return { players: {}, winnerScore: null, ts: '' };
      var d = JSON.parse(resp.getContentText());
      var ev = (d.events || [])[0]; if (!ev) return { players: {}, winnerScore: null, ts: '' };
      var comp = (ev.competitions || [])[0]; if (!comp) return { players: {}, winnerScore: null, ts: '' };
      var competitors = comp.competitors || [];
      var out = {};
      var best = null;
      for (var i = 0; i < competitors.length; i++) {
        var c = competitors[i];
        var ath = c.athlete || {};
        var name = String(ath.displayName || '');
        var raw = c.score;
        var stat = String(((c.status || {}).type || {}).description || '');
        var posShort = String(((c.status || {}).position || {}).displayName || '');
        var n = parseScore2_(raw);
        var isCut = /WD|MDF|CUT|DQ|MC/i.test(posShort) || /Withdrawn|Disqualif|Cut/i.test(stat);
        var posInt = parsePos2_(posShort);
        out[normName2_(name)] = { name: name, score: n, raw: raw, status: stat, position: posShort, position_int: posInt, cut: isCut };
        if (!isCut && (best == null || n < best)) best = n;
      }
      return { players: out, winnerScore: best, ts: nowIso_() };
    } catch (err) {
      return { players: {}, winnerScore: null, ts: '', error: String(err) };
    }
  }

  function parseScore2_(s) {
    if (s === 0 || s === '0' || s === 'E' || s === 'e') return 0;
    if (s == null || s === '') return 0;
    var str = String(s);
    var sign = 1;
    if (str.charAt(0) === '+') { str = str.substring(1); }
    else if (str.charAt(0) === '-') { sign = -1; str = str.substring(1); }
    var n = parseInt(str, 10);
    if (isNaN(n)) return 0;
    return sign * n;
  }

  function parsePos2_(p) {
    if (!p) return 999;
    var s = String(p).toUpperCase();
    if (/CUT|MDF|WD|DQ|MC/.test(s)) return 999;
    // strip T (tied) prefix → "T3" → 3
    s = s.replace(/^T/, '');
    var n = parseInt(s, 10);
    if (isNaN(n)) return 999;
    return n;
  }

  function normName2_(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\u00C0-\u017F]/g, function (ch) {
      var map = { '\u00e1':'a','\u00e0':'a','\u00e4':'a','\u00e2':'a','\u00e9':'e','\u00e8':'e','\u00eb':'e','\u00ea':'e','\u00ed':'i','\u00ef':'i','\u00ee':'i','\u00f3':'o','\u00f6':'o','\u00f4':'o','\u00fa':'u','\u00fc':'u','\u00fb':'u','\u00f1':'n','\u00e5':'a','\u00f8':'o','\u00e6':'ae' };
      return map[ch] || ch;
    }).replace(/[^a-z0-9]/g, '');
  }

  function apiLeaderboardV2_(p) {
    var leagueSlug = String((p && p.league) || '');
    if (!leagueSlug) return jsonOut_({ ok: false, error: 'missing_league' });
    var league = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
    if (!league) return jsonOut_({ ok: false, error: 'league_not_found' });
    var comp = findRow_(TAB.COMPS, 'comp_slug', league.comp_slug);
    if (!comp) return jsonOut_({ ok: false, error: 'comp_not_found' });

    var sc = fetchScores2_(comp.espn_id);
    var penalty = parseInt(cfg_('penalty_strokes') || '5', 10);
    if (isNaN(penalty)) penalty = 5;

    var partsR = rows_(TAB.PARTICIPANTS);
    var parts = [];
    for (var i = 0; i < partsR.rows.length; i++) {
      if (String(partsR.rows[i].league_slug) === leagueSlug && String(partsR.rows[i].paid_status || '') !== 'deleted') {
        parts.push(partsR.rows[i]);
      }
    }
    var picksR = rows_(TAB.PICKS);
    var picksByPid = {};
    for (var j = 0; j < picksR.rows.length; j++) {
      var pk = picksR.rows[j];
      if (String(pk.league_slug) === leagueSlug) picksByPid[String(pk.pid)] = pk;
    }

    var entries = [];
    for (var k = 0; k < parts.length; k++) {
      var part = parts[k];
      var pid = String(part.pid);
      var pk2 = picksByPid[pid];
      var letters = ['a', 'b', 'c', 'd'];
      var detail = [];
      var total = 0;
      var hasAnyPick = false;
      var positionsSorted = []; // for TB2
      for (var li = 0; li < letters.length; li++) {
        var L = letters[li];
        var name = pk2 ? String(pk2['bracket_' + L] || '') : '';
        // worst-case fallback score: leader's current score + penalty (treat missing pick like worst MC)
        var fallbackScore = ((sc.winnerScore == null) ? 0 : sc.winnerScore) + penalty;
        if (!name) {
          // no pick selected — apply penalty so empty picks don't get a free 0
          detail.push({ bracket: L.toUpperCase(), name: '', score: fallbackScore, status: 'no_pick', position_int: 999 });
          positionsSorted.push(999);
          total += fallbackScore;
          continue;
        }
        hasAnyPick = true;
        var match = sc.players[normName2_(name)];
        if (!match) {
          // player not in ESPN field (withdrew before tee-off / wrong name) — apply penalty
          detail.push({ bracket: L.toUpperCase(), name: name, score: fallbackScore, status: 'not_in_field', position_int: 999 });
          positionsSorted.push(999);
          total += fallbackScore;
          continue;
        }
        var s = match.score;
        if (match.cut) s = s + penalty;
        total += s;
        detail.push({ bracket: L.toUpperCase(), name: match.name, score: s, status: match.position, position_int: match.position_int });
        positionsSorted.push(match.position_int);
      }
      positionsSorted.sort(function (a, b) { return a - b; });
      var tb = pk2 ? parseScore2_(pk2.tiebreaker) : null;
      // TB1 metric: winner - player_tb. >=0 = under/exact (valid). <0 = overshot.
      var tbDist = null;
      var tbValid = false;
      if (tb != null && sc.winnerScore != null) {
        tbDist = sc.winnerScore - tb;
        tbValid = tbDist >= 0;
      }
      entries.push({
        pid: pid,
        name: String(part.display_name || ''),
        total: hasAnyPick ? total : null,
        tiebreaker: tb,
        tb_dist: tbDist,
        tb_valid: tbValid,
        picks: detail,
        positions_sorted: positionsSorted
      });
    }

    entries.sort(function (a, b) {
      if (a.total == null && b.total == null) return cmpName_(a.name, b.name);
      if (a.total == null) return 1;
      if (b.total == null) return -1;
      if (a.total !== b.total) return a.total - b.total;

      // TB1: valid (under/exact) beats invalid (overshoot)
      if (a.tb_valid !== b.tb_valid) return a.tb_valid ? -1 : 1;
      // both valid: smaller positive dist wins
      // both invalid: smaller |dist| wins (less overshot)
      if (a.tb_dist != null && b.tb_dist != null) {
        var da = a.tb_valid ? a.tb_dist : Math.abs(a.tb_dist);
        var db = b.tb_valid ? b.tb_dist : Math.abs(b.tb_dist);
        if (da !== db) return da - db;
      } else if (a.tb_dist != null) return -1;
      else if (b.tb_dist != null) return 1;

      // TB2: head-to-head sorted pick positions
      var ps = a.positions_sorted || [], qs = b.positions_sorted || [];
      var len = Math.max(ps.length, qs.length);
      for (var i = 0; i < len; i++) {
        var pa = ps[i] == null ? 999 : ps[i];
        var pb = qs[i] == null ? 999 : qs[i];
        if (pa !== pb) return pa - pb;
      }

      // TB3: alphabetical
      return cmpName_(a.name, b.name);
    });
    for (var m = 0; m < entries.length; m++) entries[m].pos = m + 1;

    return jsonOut_({
      ok: true,
      comp: { comp_slug: comp.comp_slug, name: comp.name, status: comp.status, espn_id: comp.espn_id },
      league: { league_slug: league.league_slug, league_name: league.league_name, logo_url: league.logo_url },
      entries: entries,
      winner_score: sc.winnerScore,
      scores_ts: sc.ts,
      tb_rule_version: 2
    });
  }

  function cmpName_(a, b) {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  globalThis.apiLeaderboardV2_ = apiLeaderboardV2_;
})();

// Override doGet again — 86_ loads after 85_LeaderboardApi
function doGet(e) {
  try {
    var p = e && e.parameter ? e.parameter : {};
    var route = String(p.route || 'ping');

    if (route === 'leaderboard') return apiLeaderboardV2_(p);
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
