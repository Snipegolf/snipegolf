/**
 * SnipeGolf v3 — 99_TwoPicksPerBracket.gs
 *
 * Implements "2 picks per bracket" feature.
 *
 * Overrides:
 *   globalThis.apiLeaderboardV2_  → handles up to 8 picks (2 per bracket)
 *   globalThis.submitPick_        → validates & stores bracket_a2/b2/c2/d2
 *   globalThis.apiAdminUpdate_    → accepts new bracket_X2 fields
 *
 * Backward compat:
 *   Competitions.picks_per_bracket column (default 2).
 *   memorial-2026 (or any comp_slug) can be set to 1 → only bracket_a/b/c/d used.
 *
 * Sheet additions required (user adds manually):
 *   Picks tab        : bracket_a2, bracket_b2, bracket_c2, bracket_d2
 *   Competitions tab : picks_per_bracket (integer; 1 or 2)
 *
 * Load order: 99_ loads last, overrides globalThis hoisted in 97_ and 87_.
 *
 * Code style: V8 Apps Script — var only, no arrow fns, no template literals,
 *             no ?., no ??. IIFE + globalThis pattern.
 */

(function () {

  // ─────────────────────────────────────────────────────────────────────
  // Helper: wrap return values for Apps Script doGet/doPost
  // ─────────────────────────────────────────────────────────────────────
  function jsonOut_(o) {
    return ContentService
      .createTextOutput(JSON.stringify(o))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helper: read picks_per_bracket for a given comp_slug (default 2)
  // ─────────────────────────────────────────────────────────────────────
  function picksPerBracket_(compSlug) {
    if (!compSlug) return 2;
    var comp = findRow_(TAB.COMPS, 'comp_slug', compSlug);
    if (!comp) return 2;
    var v = parseInt(String(comp.picks_per_bracket || ''), 10);
    if (isNaN(v) || v < 1) return 2;
    if (v === 1) return 1;
    return 2;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helper: score a single named pick against the score map
  // Returns { score, status, position_int, cut }
  // ─────────────────────────────────────────────────────────────────────
  function scorePick_(name, scPlayers, winnerScore, penalty, rosterSet, started) {
    var fallback = ((winnerScore == null) ? 0 : winnerScore) + penalty;
    if (fallback < penalty) fallback = penalty;

    // Pre-tournament: tournament not yet started -> no penalties, picks just show as pending.
    if (started === false) {
      if (!name) {
        return { score: 0, status: 'pending', position_int: 999, cut: false };
      }
      return { name: name, score: 0, status: 'pending', position_int: 999, cut: false };
    }

    if (!name) {
      return { score: fallback, status: 'no_pick', position_int: 999, cut: false };
    }

    var normNm = normNameV3_(name);
    var match = scPlayers[normNm];
    if (!match) {
      var label = 'not_in_field';
      if (rosterSet && rosterSet[normNm]) label = 'mc';
      else if (rosterSet) label = 'invalid';
      return { score: fallback, status: label, position_int: 999, cut: true };
    }

    var s = match.score;
    var isCut = !!match.cut;
    if (isCut) s = s + penalty;

    // Derive status label — mirrors 97_ logic
    var statusLabel = match.status || '';
    return { name: match.name, score: s, status: statusLabel, position_int: match.position_int, cut: isCut };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Override apiLeaderboardV2_
  // ─────────────────────────────────────────────────────────────────────
  function apiLeaderboardV4_(p) {
    var leagueSlug = String((p && p.league) || '');
    if (!leagueSlug) return jsonOut_({ ok: false, error: 'missing_league' });

    var league = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
    if (!league) return jsonOut_({ ok: false, error: 'league_not_found' });

    var comp = findRow_(TAB.COMPS, 'comp_slug', league.comp_slug);
    if (!comp) return jsonOut_({ ok: false, error: 'comp_not_found' });

    var ppb = picksPerBracket_(comp.comp_slug);

    var sc = fetchScoresV3_(comp.espn_id);
    var penalty = parseInt(String(cfg_('penalty_strokes') || '5'), 10);
    if (isNaN(penalty)) penalty = 5;

    var rosterSet = (typeof globalThis.getRosterNormSet_ === 'function')
      ? globalThis.getRosterNormSet_(comp.comp_slug)
      : null;

    // Collect participants for this league
    var partsR = rows_(TAB.PARTICIPANTS);
    var parts = [];
    for (var i = 0; i < partsR.rows.length; i++) {
      var row = partsR.rows[i];
      if (String(row.league_slug) === leagueSlug && String(row.paid_status || '') !== 'deleted') {
        parts.push(row);
      }
    }

    // Index picks by pid
    var picksR = rows_(TAB.PICKS);
    var picksByPid = {};
    for (var j = 0; j < picksR.rows.length; j++) {
      var pk = picksR.rows[j];
      if (String(pk.league_slug) === leagueSlug) picksByPid[String(pk.pid)] = pk;
    }

    var letters = ['a', 'b', 'c', 'd'];

    var entries = [];
    for (var k = 0; k < parts.length; k++) {
      var part = parts[k];
      var pid = String(part.pid);
      var pk2 = picksByPid[pid];
      var detail = [];
      var total = 0;
      var hasAnyPick = false;
      var positionsSorted = [];

      for (var li = 0; li < letters.length; li++) {
        var L = letters[li];

        // ── Primary pick (bracket_X) ──────────────────────────────────
        var name1 = pk2 ? String(pk2['bracket_' + L] || '') : '';
        var r1 = scorePick_(name1, sc.players, sc.winnerScore, penalty, rosterSet, sc.started);
        if (name1) hasAnyPick = true;
        total += r1.score;
        positionsSorted.push(r1.position_int);
        detail.push({
          bracket: L.toUpperCase(),
          slot: 1,
          name: r1.name || name1 || '',
          score: r1.score,
          status: r1.status,
          position_int: r1.position_int,
          cut: r1.cut
        });

        // ── Second pick (bracket_X2) — only when ppb === 2 ───────────
        if (ppb === 2) {
          var name2 = pk2 ? String(pk2['bracket_' + L + '2'] || '') : '';
          var r2 = scorePick_(name2, sc.players, sc.winnerScore, penalty, rosterSet, sc.started);
          if (name2) hasAnyPick = true;
          total += r2.score;
          positionsSorted.push(r2.position_int);
          detail.push({
            bracket: L.toUpperCase() + '2',
            slot: 2,
            name: r2.name || name2 || '',
            score: r2.score,
            status: r2.status,
            position_int: r2.position_int,
            cut: r2.cut
          });
        }
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

    // Sort: total ASC, then TB1, then TB2 (up to 8 sorted positions), then name
    entries.sort(function (a, b) {
      if (a.total == null && b.total == null) return cmpNameV4_(a.name, b.name);
      if (a.total == null) return 1;
      if (b.total == null) return -1;
      if (a.total !== b.total) return a.total - b.total;

      // TB1: valid (under/exact) beats overshoot
      if (a.tb_valid !== b.tb_valid) return a.tb_valid ? -1 : 1;
      if (a.tb_dist != null && b.tb_dist != null) {
        var da = a.tb_valid ? a.tb_dist : Math.abs(a.tb_dist);
        var db = b.tb_valid ? b.tb_dist : Math.abs(b.tb_dist);
        if (da !== db) return da - db;
      } else if (a.tb_dist != null) return -1;
      else if (b.tb_dist != null) return 1;

      // TB2: head-to-head across all (up to 8) sorted pick positions
      var ps = a.positions_sorted || [];
      var qs = b.positions_sorted || [];
      var len = Math.max(ps.length, qs.length);
      for (var i = 0; i < len; i++) {
        var pa = (ps[i] == null) ? 999 : ps[i];
        var pb = (qs[i] == null) ? 999 : qs[i];
        if (pa !== pb) return pa - pb;
      }

      // TB3: alphabetical
      return cmpNameV4_(a.name, b.name);
    });

    for (var m = 0; m < entries.length; m++) entries[m].pos = m + 1;

    return jsonOut_({
      ok: true,
      comp: {
        comp_slug: comp.comp_slug,
        name: comp.name,
        status: comp.status,
        espn_id: comp.espn_id,
        picks_per_bracket: ppb
      },
      league: {
        league_slug: league.league_slug,
        league_name: league.league_name,
        logo_url: league.logo_url
      },
      entries: entries,
      winner_score: sc.winnerScore,
      scores_ts: sc.ts,
      picks_per_bracket: ppb,
      tb_rule_version: 4
    });
  }

  function cmpNameV4_(a, b) {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Override submitPick_
  // ─────────────────────────────────────────────────────────────────────
  function submitPickV2_(body) {
    var pid = body.pid;
    var token = body.t;
    if (!pid || !token) return jsonOut_({ ok: false, error: 'missing_token' });

    var part = findRow_(TAB.PARTICIPANTS, 'pid', pid);
    if (!part) return jsonOut_({ ok: false, error: 'pid_not_found' });
    if (String(part.edit_token) !== String(token)) return jsonOut_({ ok: false, error: 'bad_token' });

    var comp = findRow_(TAB.COMPS, 'comp_slug', part.comp_slug);
    if (!comp) return jsonOut_({ ok: false, error: 'comp_not_found' });
    if (String(comp.status) === 'frozen') return jsonOut_({ ok: false, error: 'comp_frozen' });

    if (comp.picks_lock_datetime) {
      var lock = new Date(comp.picks_lock_datetime);
      if (!isNaN(lock.getTime()) && new Date() > lock) return jsonOut_({ ok: false, error: 'picks_locked' });
    }

    var ppb = picksPerBracket_(part.comp_slug);

    // Validate: within each bracket, the 2 picks must differ (case-insensitive)
    if (ppb === 2) {
      var letters = ['a', 'b', 'c', 'd'];
      for (var i = 0; i < letters.length; i++) {
        var L = letters[i];
        var v1 = String(body['bracket_' + L] || '').trim().toLowerCase();
        var v2 = String(body['bracket_' + L + '2'] || '').trim().toLowerCase();
        if (v1 && v2 && v1 === v2) {
          return jsonOut_({ ok: false, error: 'duplicate_pick_in_bracket', bracket: L.toUpperCase(),
                   message: 'Your two picks in Bracket ' + L.toUpperCase() + ' must be different golfers.' });
        }
      }
    }

    var existing = findRow_(TAB.PICKS, 'pid', pid);
    var nowS = nowIso_();
    var payload = {
      pid: pid,
      league_slug: part.league_slug,
      comp_slug: part.comp_slug,
      bracket_a: String(body.bracket_a || ''),
      bracket_b: String(body.bracket_b || ''),
      bracket_c: String(body.bracket_c || ''),
      bracket_d: String(body.bracket_d || ''),
      tiebreaker: String(body.tiebreaker || ''),
      updated_ts: nowS
    };

    if (ppb === 2) {
      payload.bracket_a2 = String(body.bracket_a2 || '');
      payload.bracket_b2 = String(body.bracket_b2 || '');
      payload.bracket_c2 = String(body.bracket_c2 || '');
      payload.bracket_d2 = String(body.bracket_d2 || '');
    }

    if (existing) {
      updateRow_(TAB.PICKS, existing._row, payload);
    } else {
      payload.submitted_ts = nowS;
      appendRow_(TAB.PICKS, payload);
    }

    return jsonOut_({ ok: true, pid: pid });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Override apiAdminUpdate_  — extends PICK_FIELDS to include _X2 cols
  // ─────────────────────────────────────────────────────────────────────
  var PARTICIPANT_FIELDS_V2 = ['display_name', 'email', 'paid_status', 'paid_method', 'notes'];
  var PICK_FIELDS_V2 = [
    'bracket_a', 'bracket_b', 'bracket_c', 'bracket_d',
    'bracket_a2', 'bracket_b2', 'bracket_c2', 'bracket_d2',
    'tiebreaker'
  ];

  function apiAdminUpdateV2_(body) {
    var key = String(body.key || '');
    var pid = String(body.pid || '');
    var fields = body.fields || {};
    var reason = String(body.reason || '');
    if (!pid) return jsonOut_({ ok: false, error: 'missing_pid' });

    var part = findRow_(TAB.PARTICIPANTS, 'pid', pid);
    if (!part) return jsonOut_({ ok: false, error: 'participant_not_found' });
    var leagueSlug = String(part.league_slug || '');

    // Re-use auth helper from 87_
    var authFn = globalThis.adminAuth_ || null;
    var auth;
    if (authFn) {
      auth = authFn(key, leagueSlug);
    } else {
      // Inline fallback — mirrors 87_ logic
      var ownerKey = String(cfg_('owner_admin_key') || '');
      if (ownerKey && key === ownerKey) {
        auth = { ok: true, scope: 'owner' };
      } else {
        var lg = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
        if (!lg) { auth = { ok: false, error: 'league_not_found' }; }
        else if (String(lg.admin_key || '') === String(key)) { auth = { ok: true, scope: 'league', league: lg }; }
        else { auth = { ok: false, error: 'bad_key' }; }
      }
    }
    if (!auth.ok) return jsonOut_({ ok: false, error: auth.error });

    // isPostLock_ from 87_
    var postLock = false;
    if (typeof globalThis.isPostLock_ === 'function') {
      postLock = globalThis.isPostLock_(part.comp_slug);
    }

    // audit_ from 87_
    var auditFn = globalThis.audit_ || function () {};

    // Participant fields
    var partRow = findRowNum_(TAB.PARTICIPANTS, 'pid', pid);
    var partUpd = {};
    for (var f = 0; f < PARTICIPANT_FIELDS_V2.length; f++) {
      var kk = PARTICIPANT_FIELDS_V2[f];
      if (fields.hasOwnProperty(kk)) {
        var oldV = String(part[kk] || '');
        var newV = String(fields[kk] == null ? '' : fields[kk]);
        if (oldV !== newV) {
          partUpd[kk] = newV;
          auditFn(leagueSlug, pid, key, 'update_participant', kk, oldV, newV, false, reason);
        }
      }
    }
    if (Object.keys(partUpd).length) updateRow_(TAB.PARTICIPANTS, partRow, partUpd);

    // Picks fields (now includes _X2)
    var pick = findRow_(TAB.PICKS, 'pid', pid);
    var pickRow = pick ? findRowNum_(TAB.PICKS, 'pid', pid) : null;
    var pickUpd = {};
    var anyPickChange = false;
    for (var g = 0; g < PICK_FIELDS_V2.length; g++) {
      var pk = PICK_FIELDS_V2[g];
      if (fields.hasOwnProperty(pk)) {
        var oldP = pick ? String(pick[pk] || '') : '';
        var newP = String(fields[pk] == null ? '' : fields[pk]);
        if (oldP !== newP) {
          pickUpd[pk] = newP;
          anyPickChange = true;
          auditFn(leagueSlug, pid, key, 'update_pick', pk, oldP, newP, postLock, reason);
        }
      }
    }

    if (anyPickChange) {
      pickUpd.updated_ts = nowIso_();
      if (pick) {
        updateRow_(TAB.PICKS, pickRow, pickUpd);
      } else {
        var newPick = { pid: pid, league_slug: leagueSlug, comp_slug: part.comp_slug,
                        submitted_ts: nowIso_(), updated_ts: nowIso_() };
        for (var n in pickUpd) newPick[n] = pickUpd[n];
        appendRow_(TAB.PICKS, newPick);
      }
      if (postLock && typeof globalThis.notifyOwnerPostLock_ === 'function') {
        globalThis.notifyOwnerPostLock_(leagueSlug, pid, fields, reason, key);
      }
    }

    return jsonOut_({
      ok: true,
      post_lock: postLock,
      participant_updated: Object.keys(partUpd),
      picks_updated: Object.keys(pickUpd)
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Override apiAdminList_ to also return bracket_X2 fields
  // ─────────────────────────────────────────────────────────────────────
  function apiAdminListV2_(p) {
    var leagueSlug = String(p.league || '');
    var key = String(p.key || '');

    var authFn = globalThis.adminAuth_ || null;
    var auth;
    if (authFn) {
      auth = authFn(key, leagueSlug);
    } else {
      var ownerKey = String(cfg_('owner_admin_key') || '');
      if (ownerKey && key === ownerKey) {
        auth = { ok: true, scope: 'owner' };
      } else {
        var lg = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
        if (!lg) { auth = { ok: false, error: 'league_not_found' }; }
        else if (String(lg.admin_key || '') === String(key)) { auth = { ok: true, scope: 'league', league: lg }; }
        else { auth = { ok: false, error: 'bad_key' }; }
      }
    }
    if (!auth.ok) return jsonOut_({ ok: false, error: auth.error });

    var league = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
    if (!league) return jsonOut_({ ok: false, error: 'league_not_found' });

    var comp = findRow_(TAB.COMPS, 'comp_slug', league.comp_slug);
    var ppb = picksPerBracket_(league.comp_slug);

    var postLock = false;
    if (typeof globalThis.isPostLock_ === 'function') postLock = globalThis.isPostLock_(league.comp_slug);

    var partsR = rows_(TAB.PARTICIPANTS);
    var picksR = rows_(TAB.PICKS);
    var picksByPid = {};
    for (var j = 0; j < picksR.rows.length; j++) {
      var pkRow = picksR.rows[j];
      if (String(pkRow.league_slug) === leagueSlug) picksByPid[String(pkRow.pid)] = pkRow;
    }

    var entries = [];
    var paidCount = 0, unpaidCount = 0, deletedCount = 0;
    for (var i = 0; i < partsR.rows.length; i++) {
      var part = partsR.rows[i];
      if (String(part.league_slug) !== leagueSlug) continue;
      var status = String(part.paid_status || '');
      if (status === 'deleted') { deletedCount++; continue; }
      if (status === 'paid') paidCount++; else unpaidCount++;
      var pk2 = picksByPid[String(part.pid)] || {};
      var entry = {
        pid: String(part.pid),
        display_name: String(part.display_name || ''),
        email: String(part.email || ''),
        paid_status: status,
        paid_method: String(part.paid_method || ''),
        entry_ts: String(part.entry_ts || ''),
        entered_by: String(part.entered_by || ''),
        notes: String(part.notes || ''),
        email_status: String(part.email_status || ''),
        email_sent_at: String(part.email_sent_at || ''),
        bracket_a: String(pk2.bracket_a || ''),
        bracket_b: String(pk2.bracket_b || ''),
        bracket_c: String(pk2.bracket_c || ''),
        bracket_d: String(pk2.bracket_d || ''),
        tiebreaker: String(pk2.tiebreaker || ''),
        picks_submitted: !!(pk2.submitted_ts)
      };
      if (ppb === 2) {
        entry.bracket_a2 = String(pk2.bracket_a2 || '');
        entry.bracket_b2 = String(pk2.bracket_b2 || '');
        entry.bracket_c2 = String(pk2.bracket_c2 || '');
        entry.bracket_d2 = String(pk2.bracket_d2 || '');
      }
      entries.push(entry);
    }
    entries.sort(function (a, b) {
      if (a.display_name < b.display_name) return -1;
      if (a.display_name > b.display_name) return 1;
      return 0;
    });

    return jsonOut_({
      ok: true,
      scope: auth.scope,
      picks_per_bracket: ppb,
      league: {
        league_slug: league.league_slug,
        league_name: league.league_name,
        comp_slug: league.comp_slug,
        admin_email: league.admin_email,
        revolut_link: league.revolut_link,
        logo_url: league.logo_url
      },
      comp: comp ? { name: comp.name, picks_lock_datetime: comp.picks_lock_datetime,
                     status: comp.status, picks_per_bracket: ppb } : null,
      post_lock: postLock,
      stats: { total: entries.length, paid: paidCount, unpaid: unpaidCount, deleted: deletedCount },
      entries: entries
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Override getMyPick_ to also return bracket_X2 fields
  // ─────────────────────────────────────────────────────────────────────
  function getMyPickV2_(pid, token) {
    if (!pid || !token) return { ok: false, error: 'missing_token' };
    var part = findRow_(TAB.PARTICIPANTS, 'pid', pid);
    if (!part) return { ok: false, error: 'pid_not_found' };
    if (String(part.edit_token) !== String(token)) return { ok: false, error: 'bad_token' };
    var pick = findRow_(TAB.PICKS, 'pid', pid);
    var ppb = picksPerBracket_(part.comp_slug);
    var comp = findRow_(TAB.COMPS, 'comp_slug', part.comp_slug);
    var pickOut = null;
    if (pick) {
      pickOut = {
        bracket_a: pick.bracket_a,
        bracket_b: pick.bracket_b,
        bracket_c: pick.bracket_c,
        bracket_d: pick.bracket_d,
        tiebreaker: pick.tiebreaker
      };
      if (ppb === 2) {
        pickOut.bracket_a2 = pick.bracket_a2;
        pickOut.bracket_b2 = pick.bracket_b2;
        pickOut.bracket_c2 = pick.bracket_c2;
        pickOut.bracket_d2 = pick.bracket_d2;
      }
    }
    return {
      ok: true,
      picks_per_bracket: ppb,
      participant: {
        pid: part.pid,
        display_name: part.display_name,
        league_slug: part.league_slug,
        comp_slug: part.comp_slug
      },
      pick: pickOut,
      comp: comp ? { picks_per_bracket: ppb, picks_lock_datetime: comp.picks_lock_datetime, status: comp.status } : null
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Hoist overrides
  // ─────────────────────────────────────────────────────────────────────
  globalThis.picksPerBracket_   = picksPerBracket_;
  globalThis.apiLeaderboardV2_  = apiLeaderboardV4_;  // highest-numbered override wins
  globalThis.submitPick_        = submitPickV2_;
  globalThis.apiAdminUpdate_    = apiAdminUpdateV2_;
  globalThis.apiAdminList_      = apiAdminListV2_;
  globalThis.getMyPick_         = getMyPickV2_;

})();
