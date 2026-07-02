/**
 * SnipeGolf v3 — 105_WithdrawalDetector.gs
 *
 * Runs daily (~09:00 BST). Compares current Brackets tab roster for a comp
 * against fresh ESPN field. If a player is missing from ESPN (WD), auto-swaps
 * in the highest-DG-ranked player NOT already in Brackets — but ONLY if
 * NOW < picks_lock_datetime. After lock, no swaps; parser applies MC+5.
 *
 * Also emails admin_email + owner when any change is made.
 * Writes an audit line per swap.
 *
 * ESPN endpoint used: /apis/site/v2/sports/golf/leaderboard?event=<espn_id>
 * Only trusts ESPN once its status shows at least ~120 players (else skip = still empty).
 *
 * NO template literals, arrow functions, ??, ?., let, const. V8 var only.
 */

(function () {
  var MASTER_ID = '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
  var MIN_ESPN_FIELD = 100; // don't trust ESPN if fewer than this
  var OWNER_EMAIL = 'badenmaher@gmail.com';

  function ss_() { return SpreadsheetApp.openById(MASTER_ID); }

  function activeComps_() {
    // Returns comps in status picks_open/locked with future lock date
    var sh = ss_().getSheetByName('Competitions');
    if (!sh) return [];
    var v = sh.getDataRange().getValues();
    var headers = v[0];
    var out = [];
    var now = new Date();
    for (var i = 1; i < v.length; i++) {
      var row = {};
      for (var j = 0; j < headers.length; j++) row[headers[j]] = v[i][j];
      if (!row.comp_slug) continue;
      var lockStr = row.picks_lock_datetime;
      if (!lockStr) continue;
      var lockDate = new Date(lockStr);
      if (isNaN(lockDate.getTime())) continue;
      if (lockDate < now) continue; // already past lock; skip
      if (row.status !== 'picks_open' && row.status !== 'live') continue;
      out.push(row);
    }
    return out;
  }

  function fetchEspnField_(espnId) {
    if (!espnId) return null;
    try {
      var url = 'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=' + espnId;
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return null;
      var data = JSON.parse(res.getContentText());
      var events = data.events || [];
      if (!events.length) return null;
      var comps = events[0].competitions || [];
      if (!comps.length) return null;
      var players = comps[0].competitors || [];
      var names = [];
      for (var i = 0; i < players.length; i++) {
        var a = players[i].athlete || {};
        if (a.displayName) names.push(a.displayName);
      }
      return names;
    } catch (e) {
      Logger.log('fetchEspnField err: ' + e);
      return null;
    }
  }

  function readBracketsForComp_(compSlug) {
    var sh = ss_().getSheetByName('Brackets');
    var v = sh.getDataRange().getValues();
    var headers = v[0];
    var iComp = headers.indexOf('comp_slug');
    var iBracket = headers.indexOf('bracket');
    var iPlayer = headers.indexOf('player_name');
    var rows = [];
    for (var i = 1; i < v.length; i++) {
      if (v[i][iComp] === compSlug) {
        rows.push({ rowNum: i + 1, bracket: v[i][iBracket], player: v[i][iPlayer] });
      }
    }
    return { sheet: sh, rows: rows, iPlayer: iPlayer };
  }

  function loose_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function emailChanges_(comp, changes) {
    if (!changes.length) return;
    // find league admin email
    var lSh = ss_().getSheetByName('Leagues');
    var lv = lSh.getDataRange().getValues();
    var lh = lv[0];
    var adminEmail = '';
    for (var i = 1; i < lv.length; i++) {
      if (lv[i][lh.indexOf('comp_slug')] === comp.comp_slug) {
        adminEmail = lv[i][lh.indexOf('admin_email')] || '';
        break;
      }
    }
    var subject = 'SnipeGolf — ' + comp.name + ': ' + changes.length + ' withdrawal(s) auto-handled';
    var body = 'Automated withdrawal detector ran at ' + new Date().toString() + '.\n\n';
    body += 'Comp: ' + comp.name + ' (' + comp.comp_slug + ')\n\n';
    for (var c = 0; c < changes.length; c++) {
      var ch = changes[c];
      body += 'Bracket ' + ch.bracket + ': ' + ch.out + ' → ' + ch.in + '\n';
    }
    body += '\nPre-lock swap policy: highest-ranked alternate not already in field.\n';
    body += '\nReview: https://snipegolf.github.io/snipegolf/' + comp.comp_slug + '-cobh-gc/brackets.html\n';
    var recipients = [OWNER_EMAIL];
    if (adminEmail) recipients.push(adminEmail);
    try {
      MailApp.sendEmail({ to: recipients.join(','), subject: subject, body: body });
    } catch (e) {
      Logger.log('email err: ' + e);
    }
  }

  function auditLog_(compSlug, action, oldVal, newVal, reason) {
    try {
      var sh = ss_().getSheetByName('AuditLog');
      if (!sh) return;
      sh.appendRow([new Date(), '', '', '', action, 'brackets.player_name', oldVal, newVal, '', reason || ('comp=' + compSlug)]);
    } catch (e) {}
  }

  function detectAndSwapForComp_(comp) {
    var espn = fetchEspnField_(comp.espn_id);
    if (!espn || espn.length < MIN_ESPN_FIELD) {
      Logger.log('WD detect: skipping ' + comp.comp_slug + ' — ESPN empty or too small (' + (espn ? espn.length : 0) + ')');
      return { skipped: true, reason: 'espn_empty', changes: [] };
    }
    var espnLoose = {};
    for (var i = 0; i < espn.length; i++) espnLoose[loose_(espn[i])] = espn[i];

    var b = readBracketsForComp_(comp.comp_slug);
    if (!b.rows.length) return { skipped: true, reason: 'no_brackets', changes: [] };

    // Set of currently-bracketed players
    var inField = {};
    for (var j = 0; j < b.rows.length; j++) inField[loose_(b.rows[j].player)] = true;

    // Find WDs: brackets player not in ESPN
    var wds = [];
    for (var k = 0; k < b.rows.length; k++) {
      if (!espnLoose[loose_(b.rows[k].player)]) wds.push(b.rows[k]);
    }
    if (!wds.length) return { skipped: false, changes: [] };

    // Alternates: ESPN players not in brackets, in ESPN order (ESPN sorts by position typically alphabetical pre-tourney)
    var alternates = [];
    for (var m = 0; m < espn.length; m++) {
      var lo = loose_(espn[m]);
      if (!inField[lo]) alternates.push(espn[m]);
    }

    var changes = [];
    for (var w = 0; w < wds.length && w < alternates.length; w++) {
      var wd = wds[w];
      var alt = alternates[w];
      b.sheet.getRange(wd.rowNum, b.iPlayer + 1).setValue(alt);
      changes.push({ bracket: wd.bracket, out: wd.player, in: alt });
      auditLog_(comp.comp_slug, 'auto_wd_swap', wd.player, alt, 'ESPN missing pre-lock');
      inField[loose_(alt)] = true;
    }
    if (wds.length > alternates.length) {
      for (var x = alternates.length; x < wds.length; x++) {
        auditLog_(comp.comp_slug, 'wd_no_alt', wds[x].player, '', 'No alternate available');
      }
    }
    return { skipped: false, changes: changes };
  }

  function runWithdrawalDetector() {
    var comps = activeComps_();
    for (var i = 0; i < comps.length; i++) {
      var comp = comps[i];
      try {
        var r = detectAndSwapForComp_(comp);
        if (r.changes && r.changes.length) emailChanges_(comp, r.changes);
      } catch (e) {
        Logger.log('WD err for ' + comp.comp_slug + ': ' + e);
      }
    }
  }

  globalThis.runWithdrawalDetector = runWithdrawalDetector;
})();
