/**
 * SnipeGolf v3 — 91_LockRoster.gs
 * Stores the field roster snapshot at lock time so we can distinguish:
 *   - "mc"      : pick was in field at lock, now missing (Missed Cut / WD)
 *   - "invalid" : pick was NEVER in field (typo / wrong name)
 *
 * Storage: tab "FieldSnapshots" cols [comp_slug, snapshot_ts, names_json]
 * We keep the LAST snapshot per comp. Older rows pruned.
 */
(function () {
  var TAB_NAME = 'FieldSnapshots';

  function ss_() {
    var id = (typeof getMasterSheetId_ === 'function') ? getMasterSheetId_() : '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
    return SpreadsheetApp.openById(id);
  }

  function ensureRosterSheet_() {
    var sh = ss_().getSheetByName(TAB_NAME);
    if (!sh) {
      sh = ss_().insertSheet(TAB_NAME);
      sh.appendRow(['comp_slug', 'snapshot_ts', 'names_json']);
      sh.setFrozenRows(1);
    }
    return sh;
  }

  function normRoster_(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\u00C0-\u017F]/g, function (ch) {
      var map = { '\u00e1':'a','\u00e0':'a','\u00e4':'a','\u00e2':'a','\u00e9':'e','\u00e8':'e','\u00eb':'e','\u00ea':'e','\u00ed':'i','\u00ef':'i','\u00ee':'i','\u00f3':'o','\u00f6':'o','\u00f4':'o','\u00fa':'u','\u00fc':'u','\u00fb':'u','\u00f1':'n','\u00e5':'a','\u00f8':'o','\u00e6':'ae' };
      return map[ch] || ch;
    }).replace(/[^a-z0-9]/g, '');
  }

  function writeRosterSnapshot(compSlug) {
    if (!compSlug) return { ok: false, error: 'missing_comp' };
    var comp = findRow_(TAB.COMPS, 'comp_slug', compSlug);
    if (!comp) return { ok: false, error: 'comp_not_found' };
    var espnId = String(comp.espn_id || '');
    if (!espnId) return { ok: false, error: 'no_espn_id' };

    var url = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=' + encodeURIComponent(espnId);
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'espn_' + resp.getResponseCode() };
    var d = JSON.parse(resp.getContentText());
    var ev = (d.events || [])[0]; if (!ev) return { ok: false, error: 'no_event' };
    var comp2 = (ev.competitions || [])[0]; if (!comp2) return { ok: false, error: 'no_competition' };
    var competitors = comp2.competitors || [];
    var names = [];
    for (var i = 0; i < competitors.length; i++) {
      var ath = competitors[i].athlete || {};
      var nm = String(ath.displayName || '').trim();
      if (nm) names.push(nm);
    }
    if (!names.length) return { ok: false, error: 'empty_field' };

    var sh = ensureRosterSheet_();
    sh.appendRow([compSlug, nowIso_(), JSON.stringify(names)]);
    pruneRoster_(sh, compSlug);
    return { ok: true, count: names.length };
  }

  function pruneRoster_(sh, compSlug) {
    var last = sh.getLastRow();
    if (last <= 1) return;
    var data = sh.getRange(2, 1, last - 1, 3).getValues();
    var keepIdx = -1;
    for (var i = data.length - 1; i >= 0; i--) {
      if (data[i][0] === compSlug) { keepIdx = i; break; }
    }
    if (keepIdx < 0) return;
    var toDelete = [];
    for (var j = 0; j < data.length; j++) {
      if (data[j][0] === compSlug && j !== keepIdx) toDelete.push(j + 2);
    }
    toDelete.sort(function (a, b) { return b - a; });
    for (var k = 0; k < toDelete.length; k++) sh.deleteRow(toDelete[k]);
  }

  function getRosterNormSet_(compSlug) {
    try {
      var sh = ss_().getSheetByName(TAB_NAME);
      if (!sh) return null;
      var last = sh.getLastRow();
      if (last <= 1) return null;
      var data = sh.getRange(2, 1, last - 1, 3).getValues();
      var found = null, foundTs = '';
      for (var i = 0; i < data.length; i++) {
        if (data[i][0] === compSlug && String(data[i][1]) > foundTs) {
          foundTs = String(data[i][1]); found = data[i][2];
        }
      }
      if (!found) return null;
      var arr = JSON.parse(found);
      var set = {};
      for (var j = 0; j < arr.length; j++) set[normRoster_(arr[j])] = arr[j];
      return set;
    } catch (e) { return null; }
  }

  function ensureRosterAtLockTrigger_() {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'rosterSnapshotAllComps') return;
    }
    ScriptApp.newTrigger('rosterSnapshotAllComps').timeBased().everyHours(6).create();
  }

  function rosterSnapshotAllComps() {
    var compsR = rows_(TAB.COMPS);
    var out = [];
    for (var i = 0; i < compsR.rows.length; i++) {
      var c = compsR.rows[i];
      if (!c.espn_id) continue;
      try { out.push({ slug: c.comp_slug, r: writeRosterSnapshot(c.comp_slug) }); }
      catch (e) { out.push({ slug: c.comp_slug, err: String(e) }); }
    }
    return out;
  }

  globalThis.writeRosterSnapshot = writeRosterSnapshot;
  globalThis.rosterSnapshotAllComps = rosterSnapshotAllComps;
  globalThis.ensureRosterAtLockTrigger_ = ensureRosterAtLockTrigger_;
  globalThis.getRosterNormSet_ = getRosterNormSet_;
  globalThis.normRoster_ = normRoster_;
})();

function snapshotRosterNow_USOpen() { return writeRosterSnapshot('us-open-2026'); }
function snapshotRosterAll() { return rosterSnapshotAllComps(); }
function ensureRosterTrigger() { return globalThis.ensureRosterAtLockTrigger_(); }
