/**
 * SnipeGolf v3 — 92_BracketBuilder.gs
 * Auto-build A/B/C/D brackets for a competition.
 *
 * Strategy (tries each in order, uses first that yields enough names):
 *   1. OWGR from ESPN competitor statistics (look for 'world ranking' or 'owgr')
 *   2. Current total score (low = top seed)
 *   3. PGA Tour public field page name scrape (last-resort name list, alphabetical)
 *
 * Writes to "Brackets" sheet with cols: comp_slug, bracket, name, seed
 * Overwrites existing rows for that comp.
 */
(function () {
  var TAB_NAME = 'Brackets';
  var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=';

  function ss_() {
    var id = (typeof getMasterSheetId_ === 'function') ? getMasterSheetId_() : '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
    return SpreadsheetApp.openById(id);
  }

  function ensureBracketsSheet_() {
    var sh = ss_().getSheetByName(TAB_NAME);
    if (!sh) {
      sh = ss_().insertSheet(TAB_NAME);
      sh.appendRow(['comp_slug', 'bracket', 'name', 'seed']);
      sh.setFrozenRows(1);
    }
    return sh;
  }

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

  function fetchEspnField_(espnId) {
    var resp = UrlFetchApp.fetch(ESPN_BASE + encodeURIComponent(espnId), { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) return null;
    var d = JSON.parse(resp.getContentText());
    var ev = (d.events || [])[0]; if (!ev) return null;
    var c = (ev.competitions || [])[0]; if (!c) return null;
    return c.competitors || [];
  }

  function tryOWGR_(competitors) {
    var out = [];
    for (var i = 0; i < competitors.length; i++) {
      var c = competitors[i];
      var ath = c.athlete || {};
      var nm = String(ath.displayName || '').trim();
      if (!nm) continue;
      var stats = c.statistics || [];
      var rank = null;
      for (var j = 0; j < stats.length; j++) {
        var key = String(stats[j].name || stats[j].abbreviation || '').toLowerCase();
        if (key.indexOf('owgr') >= 0 || key.indexOf('world') >= 0 || key === 'wr') {
          var v = parseInt(stats[j].value || stats[j].displayValue, 10);
          if (!isNaN(v) && v > 0) { rank = v; break; }
        }
      }
      if (rank != null) out.push({ name: nm, rank: rank });
    }
    if (out.length < competitors.length * 0.5) return null;
    out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }

  function tryTotalScore_(competitors) {
    var out = [];
    for (var i = 0; i < competitors.length; i++) {
      var c = competitors[i];
      var ath = c.athlete || {};
      var nm = String(ath.displayName || '').trim();
      if (!nm) continue;
      var s = parseScore_(c.score);
      if (s == null) s = 0;
      out.push({ name: nm, rank: s });
    }
    out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }

  function tryPgaTour_(pgaSlug) {
    if (!pgaSlug) return null;
    try {
      var url = 'https://www.pgatour.com/tournaments/' + pgaSlug + '/field';
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (resp.getResponseCode() !== 200) return null;
      var html = resp.getContentText();
      var names = [];
      var re = /"firstName":"([^"]+)","lastName":"([^"]+)"/g;
      var m;
      while ((m = re.exec(html)) !== null) {
        names.push((m[1] + ' ' + m[2]).trim());
      }
      var uniq = {};
      var out = [];
      for (var i = 0; i < names.length; i++) {
        if (!uniq[names[i]]) { uniq[names[i]] = true; out.push({ name: names[i], rank: i + 1 }); }
      }
      if (out.length < 30) return null;
      return out;
    } catch (e) { return null; }
  }

  function splitIntoBrackets_(sorted) {
    var n = sorted.length;
    if (!n) return { A: [], B: [], C: [], D: [] };
    var size = Math.ceil(n / 4);
    return {
      A: sorted.slice(0, size),
      B: sorted.slice(size, size * 2),
      C: sorted.slice(size * 2, size * 3),
      D: sorted.slice(size * 3)
    };
  }

  function writeBrackets_(compSlug, brackets) {
    var sh = ensureBracketsSheet_();
    var last = sh.getLastRow();
    if (last > 1) {
      var data = sh.getRange(2, 1, last - 1, 1).getValues();
      var toDelete = [];
      for (var i = 0; i < data.length; i++) if (data[i][0] === compSlug) toDelete.push(i + 2);
      toDelete.sort(function (a, b) { return b - a; });
      for (var j = 0; j < toDelete.length; j++) sh.deleteRow(toDelete[j]);
    }
    var rows = [];
    var letters = ['A', 'B', 'C', 'D'];
    for (var k = 0; k < letters.length; k++) {
      var L = letters[k];
      var arr = brackets[L];
      for (var m = 0; m < arr.length; m++) rows.push([compSlug, L, arr[m].name, m + 1]);
    }
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    return rows.length;
  }

  function buildBracketsForComp(compSlug) {
    if (!compSlug) return { ok: false, error: 'missing_comp' };
    var comp = findRow_(TAB.COMPS, 'comp_slug', compSlug);
    if (!comp) return { ok: false, error: 'comp_not_found' };
    var espnId = String(comp.espn_id || '');
    if (!espnId) return { ok: false, error: 'no_espn_id' };

    var competitors = fetchEspnField_(espnId);
    var sorted = null, source = '';
    if (competitors && competitors.length) {
      sorted = tryOWGR_(competitors);
      if (sorted) source = 'owgr';
      else { sorted = tryTotalScore_(competitors); if (sorted) source = 'total_score'; }
    }
    if (!sorted || sorted.length < 30) {
      var pga = tryPgaTour_(String(comp.pga_slug || ''));
      if (pga) { sorted = pga; source = 'pgatour_alpha'; }
    }
    if (!sorted || !sorted.length) return { ok: false, error: 'no_source_yielded_field' };

    var brackets = splitIntoBrackets_(sorted);
    var written = writeBrackets_(compSlug, brackets);
    return {
      ok: true, source: source, total: sorted.length, written: written,
      sizes: { A: brackets.A.length, B: brackets.B.length, C: brackets.C.length, D: brackets.D.length }
    };
  }

  function getBracketsForComp_(compSlug) {
    var sh = ss_().getSheetByName(TAB_NAME);
    if (!sh) return { A: [], B: [], C: [], D: [] };
    var last = sh.getLastRow();
    if (last <= 1) return { A: [], B: [], C: [], D: [] };
    var data = sh.getRange(2, 1, last - 1, 4).getValues();
    var out = { A: [], B: [], C: [], D: [] };
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] !== compSlug) continue;
      rows.push({ bracket: String(data[i][1]), name: String(data[i][2]), seed: Number(data[i][3]) || 0 });
    }
    rows.sort(function (a, b) { return a.seed - b.seed; });
    for (var j = 0; j < rows.length; j++) {
      var b = rows[j].bracket;
      if (out[b]) out[b].push({ name: rows[j].name, seed: rows[j].seed });
    }
    return out;
  }

  function apiBrackets_(p) {
    var compSlug = String((p && (p.comp || p.slug)) || '');
    if (!compSlug && p && p.league) {
      var lg = findRow_(TAB.LEAGUES, 'league_slug', String(p.league));
      if (lg) compSlug = String(lg.comp_slug);
    }
    if (!compSlug) return jsonOut_({ ok: false, error: 'missing_comp' });
    return jsonOut_({ ok: true, comp: compSlug, brackets: getBracketsForComp_(compSlug) });
  }

  globalThis.buildBracketsForComp = buildBracketsForComp;
  globalThis.getBracketsForComp_ = getBracketsForComp_;
  globalThis.apiBrackets_ = apiBrackets_;
})();

function buildBracketsUSOpen() { return buildBracketsForComp('us-open-2026'); }
function buildBracketsAll() {
  var compsR = rows_(TAB.COMPS);
  var out = [];
  for (var i = 0; i < compsR.rows.length; i++) {
    var c = compsR.rows[i];
    if (!c.espn_id) continue;
    out.push({ slug: c.comp_slug, r: buildBracketsForComp(c.comp_slug) });
  }
  return out;
}
