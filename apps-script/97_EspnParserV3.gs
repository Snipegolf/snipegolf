/**
 * SnipeGolf v3 - 97_EspnParserV3.gs
 *
 * Replaces fetchScores2_ in 86_TiebreakerRule.gs with an upgraded parser that uses
 * ESPN's /golf/leaderboard?event=X endpoint (richer payload than /golf/pga/scoreboard).
 *
 * The old endpoint returns status:{} empty for all players => position_int always 999.
 * The new endpoint returns:
 *   status.position.displayName  -> "1", "T9", "T40", "-" (cut)
 *   status.type.description       -> "Finish", "In Progress", "Missed Cut", "Withdrawn"
 *   status.type.name              -> "STATUS_CUT", "STATUS_WD", "STATUS_DQ", ...
 *   status.displayValue           -> "CUT", "WD", "F", "Thru 8"
 *   score                         -> { value: 222, displayValue: "+6" } OR plain string fallback
 *
 * Loads after 96_ alphabetically. Overrides globalThis.apiLeaderboardV2_ via a wrapper that
 * swaps in fetchScoresV3_ instead of fetchScores2_.
 */

(function () {
  var ESPN_BASE_V3 = 'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=';

  function parseScoreV3_(s) {
    if (s === 0 || s === '0') return 0;
    if (s == null || s === '') return 0;
    // object form: { value, displayValue }
    if (typeof s === 'object') {
      if (s.displayValue != null) return parseDisplayScore_(s.displayValue);
      if (typeof s.value === 'number') return Math.round(s.value); // raw stroke total fallback
      return 0;
    }
    return parseDisplayScore_(s);
  }

  function parseDisplayScore_(str) {
    str = String(str);
    if (str === 'E' || str === 'e' || str === '0') return 0;
    var sign = 1;
    if (str.charAt(0) === '+') str = str.substring(1);
    else if (str.charAt(0) === '-') { sign = -1; str = str.substring(1); }
    var n = parseInt(str, 10);
    if (isNaN(n)) return 0;
    return sign * n;
  }

  function parsePosV3_(p) {
    if (!p) return 999;
    var s = String(p).toUpperCase().trim();
    if (!s || s === '-' || /CUT|MDF|WD|DQ|MC/.test(s)) return 999;
    s = s.replace(/^T/, '');
    var n = parseInt(s, 10);
    if (isNaN(n)) return 999;
    return n;
  }

  function normNameV3_(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\u00C0-\u017F]/g, function (ch) {
      var map = { '\u00e1':'a','\u00e0':'a','\u00e4':'a','\u00e2':'a','\u00e9':'e','\u00e8':'e','\u00eb':'e','\u00ea':'e','\u00ed':'i','\u00ef':'i','\u00ee':'i','\u00f3':'o','\u00f6':'o','\u00f4':'o','\u00fa':'u','\u00fc':'u','\u00fb':'u','\u00f1':'n','\u00e5':'a','\u00f8':'o','\u00e6':'ae' };
      return map[ch] || ch;
    }).replace(/[^a-z0-9]/g, '');
  }

  function fetchScoresV3_(espnId) {
    if (!espnId) return { players: {}, winnerScore: null, ts: '', started: false };
    try {
      var resp = UrlFetchApp.fetch(ESPN_BASE_V3 + encodeURIComponent(espnId), { muteHttpExceptions: true, followRedirects: true });
      if (resp.getResponseCode() !== 200) return { players: {}, winnerScore: null, ts: '', started: false };
      var d = JSON.parse(resp.getContentText());
      var events = d.events || [];
      var ev = null;
      // events array often contains many tournaments - pick the one whose competition id matches
      for (var i = 0; i < events.length; i++) {
        if (String(events[i].id || '') === String(espnId)) { ev = events[i]; break; }
      }
      if (!ev && events.length === 1) ev = events[0];
      if (!ev) ev = events[0];
      if (!ev) return { players: {}, winnerScore: null, ts: '', started: false };
      var comp = (ev.competitions || [])[0];
      if (!comp) return { players: {}, winnerScore: null, ts: '', started: false };
      var competitors = comp.competitors || [];
      // Detect tournament started: status.type.state must be 'in' or 'post' (ESPN convention).
      // 'pre' = scheduled and not yet underway -> no penalties yet.
      var stateRaw = '';
      try { stateRaw = String(((comp.status || {}).type || {}).state || ''); } catch (eState) { stateRaw = ''; }
      if (!stateRaw) {
        try { stateRaw = String(((ev.status || {}).type || {}).state || ''); } catch (eState2) { stateRaw = ''; }
      }
      var started = (stateRaw === 'in' || stateRaw === 'post') && competitors.length > 0;
      var out = {};
      var best = null;
      for (var i2 = 0; i2 < competitors.length; i2++) {
        var c = competitors[i2];
        var ath = c.athlete || {};
        var name = String(ath.displayName || '');
        var stObj = c.status || {};
        var stType = stObj.type || {};
        var stPos = stObj.position || {};

        var typeName = String(stType.name || '').toUpperCase();
        var typeDesc = String(stType.description || '');
        var dispVal = String(stObj.displayValue || '');
        var posDisp = String(stPos.displayName || '');

        var isCut = (typeName.indexOf('CUT') >= 0) || (typeName.indexOf('WD') >= 0) || (typeName.indexOf('WITHDRAW') >= 0) || (typeName.indexOf('DQ') >= 0) || (typeName.indexOf('DISQ') >= 0) || /CUT|MDF|WD|DQ|MC/.test(dispVal.toUpperCase());

        var rawScore = c.score;
        var n = parseScoreV3_(rawScore);
        // LIVE FIX: if c.score.displayValue is 'E' but a linescore for current/last round has a real value,
        // use that instead. ESPN only updates c.score after the round ends.
        try {
          var lsArr = c.linescores || [];
          var liveSum = null;
          for (var li = 0; li < lsArr.length; li++) {
            var dv = lsArr[li] && lsArr[li].displayValue;
            if (dv == null || dv === '' || dv === '-') continue;
            var lsVal = parseDisplayScore_(dv);
            if (liveSum == null) liveSum = 0;
            liveSum += lsVal;
          }
          if (liveSum != null && (n === 0)) {
            n = liveSum;
          }
        } catch (eLs) { /* non-fatal */ }

        var posInt = parsePosV3_(posDisp);
        var statusLabel = posDisp || dispVal || typeDesc || '';
        if (isCut) statusLabel = dispVal || 'CUT';

        out[normNameV3_(name)] = {
          name: name,
          score: n,
          raw: rawScore,
          status: statusLabel,
          position: posDisp,
          position_int: posInt,
          cut: isCut
        };
        if (!isCut && (best == null || n < best)) best = n;
      }
      return { players: out, winnerScore: best, ts: new Date().toISOString(), started: started };
    } catch (err) {
      return { players: {}, winnerScore: null, ts: '', started: false, error: String(err) };
    }
  }

  // Expose globally so other files (or testing) can use it
  globalThis.fetchScoresV3_ = fetchScoresV3_;
  globalThis.normNameV3_ = normNameV3_;
  globalThis.parseScoreV3_ = parseScoreV3_;

  // ---- Replace apiLeaderboardV2_ to use V3 fetcher ----
  function apiLeaderboardV3_(p) {
    var leagueSlug = String((p && p.league) || '');
    if (!leagueSlug) return jsonOut_({ ok: false, error: 'missing_league' });
    var league = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
    if (!league) return jsonOut_({ ok: false, error: 'league_not_found' });
    var comp = findRow_(TAB.COMPS, 'comp_slug', league.comp_slug);
    if (!comp) return jsonOut_({ ok: false, error: 'comp_not_found' });

    var sc = fetchScoresV3_(comp.espn_id);
    var penalty = parseInt(cfg_('penalty_strokes') || '5', 10);
    if (isNaN(penalty)) penalty = 5;

    var rosterSet = (typeof globalThis.getRosterNormSet_ === 'function') ? globalThis.getRosterNormSet_(comp.comp_slug) : null;

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
      var positionsSorted = [];
      for (var li = 0; li < letters.length; li++) {
        var L = letters[li];
        var name = pk2 ? String(pk2['bracket_' + L] || '') : '';
        var fallbackScore = ((sc.winnerScore == null) ? 0 : sc.winnerScore) + penalty;
        if (fallbackScore < penalty) fallbackScore = penalty;
        if (!name) {
          detail.push({ bracket: L.toUpperCase(), name: '', score: fallbackScore, status: 'no_pick', position_int: 999 });
          positionsSorted.push(999);
          total += fallbackScore;
          continue;
        }
        hasAnyPick = true;
        var normNm = normNameV3_(name);
        var match = sc.players[normNm];
        if (!match) {
          var label = 'not_in_field';
          if (rosterSet && rosterSet[normNm]) label = 'mc';
          else if (rosterSet) label = 'invalid';
          detail.push({ bracket: L.toUpperCase(), name: name, score: fallbackScore, status: label, position_int: 999 });
          positionsSorted.push(999);
          total += fallbackScore;
          continue;
        }
        var s = match.score;
        if (match.cut) s = s + penalty;
        total += s;
        detail.push({ bracket: L.toUpperCase(), name: match.name, score: s, status: match.status, position_int: match.position_int });
        positionsSorted.push(match.position_int);
      }
      positionsSorted.sort(function (a, b) { return a - b; });
      var tb = pk2 ? parseScoreV3_(pk2.tiebreaker) : null;
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
      if (a.total == null && b.total == null) return cmpNameV3_(a.name, b.name);
      if (a.total == null) return 1;
      if (b.total == null) return -1;
      if (a.total !== b.total) return a.total - b.total;

      if (a.tb_valid !== b.tb_valid) return a.tb_valid ? -1 : 1;
      if (a.tb_dist != null && b.tb_dist != null) {
        var da = a.tb_valid ? a.tb_dist : Math.abs(a.tb_dist);
        var db = b.tb_valid ? b.tb_dist : Math.abs(b.tb_dist);
        if (da !== db) return da - db;
      } else if (a.tb_dist != null) return -1;
      else if (b.tb_dist != null) return 1;

      var ps = a.positions_sorted || [], qs = b.positions_sorted || [];
      var len = Math.max(ps.length, qs.length);
      for (var i = 0; i < len; i++) {
        var pa = ps[i] == null ? 999 : ps[i];
        var pb = qs[i] == null ? 999 : qs[i];
        if (pa !== pb) return pa - pb;
      }

      return cmpNameV3_(a.name, b.name);
    });
    for (var m = 0; m < entries.length; m++) entries[m].pos = m + 1;

    return jsonOut_({
      ok: true,
      comp: { comp_slug: comp.comp_slug, name: comp.name, status: comp.status, espn_id: comp.espn_id },
      league: { league_slug: league.league_slug, league_name: league.league_name, logo_url: league.logo_url },
      entries: entries,
      winner_score: sc.winnerScore,
      scores_ts: sc.ts,
      tb_rule_version: 3
    });
  }

  function cmpNameV3_(a, b) {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  globalThis.apiLeaderboardV2_ = apiLeaderboardV3_;
})();
