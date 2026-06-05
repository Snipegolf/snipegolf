/**
 * SnipeGolf v3 — 93_PrizesApi.gs
 * Prizes are stored as JSON in Leagues.prizes_json (a column we ensure on first write).
 * Format: [{ "label": "1st place", "amount": "€500" }, ...]
 *
 * GET  /api/prizes?league=<slug>          -> public read
 * POST /api/prizes_save  { key, league, prizes:[{label,amount}] }   -> admin write
 */
(function () {

  function ensurePrizesColumn_() {
    var id = (typeof getMasterSheetId_ === 'function') ? getMasterSheetId_() : '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
    var sh = SpreadsheetApp.openById(id).getSheetByName(TAB.LEAGUES);
    if (!sh) return null;
    var lc = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lc).getValues()[0];
    for (var i = 0; i < headers.length; i++) if (String(headers[i]) === 'prizes_json') return i + 1;
    sh.getRange(1, lc + 1).setValue('prizes_json');
    return lc + 1;
  }

  function readPrizes_(leagueSlug) {
    var lg = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
    if (!lg) return null;
    var raw = String(lg.prizes_json || '');
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var r = arr[i] || {};
        out.push({ label: String(r.label || ''), amount: String(r.amount || '') });
      }
      return out;
    } catch (e) { return []; }
  }

  function apiPrizes_(p) {
    var leagueSlug = String((p && p.league) || '');
    if (!leagueSlug) return jsonOut_({ ok: false, error: 'missing_league' });
    var arr = readPrizes_(leagueSlug);
    if (arr == null) return jsonOut_({ ok: false, error: 'league_not_found' });
    return jsonOut_({ ok: true, league: leagueSlug, prizes: arr });
  }

  function apiPrizesSave_(body) {
    var leagueSlug = String(body.league || '');
    var key = String(body.key || '');
    if (!leagueSlug) return jsonOut_({ ok: false, error: 'missing_league' });
    var auth = (typeof adminAuth_ === 'function') ? adminAuth_(key, leagueSlug) : { ok: false, error: 'adminAuth_missing' };
    if (!auth.ok) return jsonOut_({ ok: false, error: auth.error });

    var rawArr = body.prizes;
    if (!Array.isArray(rawArr)) return jsonOut_({ ok: false, error: 'prizes_must_be_array' });
    var clean = [];
    for (var i = 0; i < rawArr.length; i++) {
      var r = rawArr[i] || {};
      var label = String(r.label || '').slice(0, 80).trim();
      var amount = String(r.amount || '').slice(0, 40).trim();
      if (!label && !amount) continue;
      clean.push({ label: label, amount: amount });
    }

    ensurePrizesColumn_();
    var rowNum = findRowNum_(TAB.LEAGUES, 'league_slug', leagueSlug);
    if (!rowNum) return jsonOut_({ ok: false, error: 'league_row_not_found' });
    updateRow_(TAB.LEAGUES, rowNum, { prizes_json: JSON.stringify(clean) });

    if (typeof audit_ === 'function') {
      audit_(leagueSlug, '', key, 'update_prizes', 'prizes_json', '', JSON.stringify(clean), false, '');
    }
    return jsonOut_({ ok: true, count: clean.length, prizes: clean });
  }

  globalThis.apiPrizes_ = apiPrizes_;
  globalThis.apiPrizesSave_ = apiPrizesSave_;
  globalThis.ensurePrizesColumn_ = ensurePrizesColumn_;
})();
