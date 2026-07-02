/**
 * SnipeGolf v3 — 106_DailyDigest.gs
 *
 * Runs daily at ~08:00 BST. For each active comp+league, emails admin + owner:
 *   - Entries count (paid / unpaid / by method)
 *   - Picks submitted count
 *   - Entries missing picks
 *   - Dupe-suspect names (fuzzy)
 *   - Cron heartbeat (so Conor knows this is alive)
 *
 * NO template literals, arrow, ??, ?., let, const.
 */

(function () {
  var MASTER_ID = '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
  var OWNER_EMAIL = 'badenmaher@gmail.com';

  function ss_() { return SpreadsheetApp.openById(MASTER_ID); }

  function activeLeagues_() {
    var lSh = ss_().getSheetByName('Leagues');
    var cSh = ss_().getSheetByName('Competitions');
    var lv = lSh.getDataRange().getValues();
    var cv = cSh.getDataRange().getValues();
    var lh = lv[0], ch = cv[0];
    var comps = {};
    for (var i = 1; i < cv.length; i++) {
      var row = {};
      for (var j = 0; j < ch.length; j++) row[ch[j]] = cv[i][j];
      if (row.comp_slug) comps[row.comp_slug] = row;
    }
    var out = [];
    var now = new Date();
    for (var i2 = 1; i2 < lv.length; i2++) {
      var lrow = {};
      for (var j2 = 0; j2 < lh.length; j2++) lrow[lh[j2]] = lv[i2][j2];
      if (!lrow.league_slug) continue;
      var c = comps[lrow.comp_slug];
      if (!c) continue;
      if (c.status !== 'picks_open' && c.status !== 'live') continue;
      var lockD = new Date(c.picks_lock_datetime);
      if (isNaN(lockD.getTime())) continue;
      // Only digest if start is within 30 days
      var startD = new Date(c.start_date);
      if (!isNaN(startD.getTime())) {
        var diffDays = (startD - now) / 86400000;
        if (diffDays < -7 || diffDays > 30) continue;
      }
      out.push({ league: lrow, comp: c });
    }
    return out;
  }

  function loose_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function digestForLeague_(bundle) {
    var league = bundle.league;
    var comp = bundle.comp;
    var pSh = ss_().getSheetByName('Participants');
    var picksSh = ss_().getSheetByName('Picks');
    var pv = pSh.getDataRange().getValues();
    var pick = picksSh.getDataRange().getValues();
    var ph = pv[0], pkh = pick[0];

    var iSlug = ph.indexOf('league_slug');
    var iEmail = ph.indexOf('email');
    var iName = ph.indexOf('display_name');
    var iPaidStatus = ph.indexOf('paid_status');
    var iPaidMethod = ph.indexOf('paid_method');
    var iPid = ph.indexOf('pid');
    var iEntryTs = ph.indexOf('entry_ts');
    var iEmailStatus = ph.indexOf('email_status');

    var iPkPid = pkh.indexOf('pid');
    var iPkSlug = pkh.indexOf('league_slug');
    var iBa = pkh.indexOf('bracket_a');

    var entries = [];
    for (var i = 1; i < pv.length; i++) {
      if (pv[i][iSlug] === league.league_slug) {
        entries.push({
          pid: pv[i][iPid],
          name: pv[i][iName],
          email: pv[i][iEmail],
          paid: pv[i][iPaidStatus],
          method: pv[i][iPaidMethod],
          emailStatus: pv[i][iEmailStatus] || ''
        });
      }
    }

    var picksByPid = {};
    for (var k = 1; k < pick.length; k++) {
      if (pick[k][iPkSlug] === league.league_slug) {
        picksByPid[pick[k][iPkPid]] = pick[k][iBa]; // truthy if picked
      }
    }

    var total = entries.length;
    var paidCount = 0, unpaidCount = 0;
    var methods = {};
    var missingPicks = [];
    var emailFails = [];
    var seenNames = {};
    var dupes = [];
    for (var e = 0; e < entries.length; e++) {
      var en = entries[e];
      if (String(en.paid).toLowerCase() === 'paid') paidCount++; else unpaidCount++;
      var m = String(en.method || 'unknown').toLowerCase();
      methods[m] = (methods[m] || 0) + 1;
      if (!picksByPid[en.pid]) missingPicks.push(en);
      if (en.emailStatus && en.emailStatus !== 'sent' && en.emailStatus !== '') emailFails.push(en);
      var lo = loose_(en.name);
      if (seenNames[lo]) dupes.push({ a: seenNames[lo], b: en });
      else seenNames[lo] = en;
    }

    var lockD = new Date(comp.picks_lock_datetime);
    var hoursToLock = Math.round((lockD - new Date()) / 3600000);

    var subj = 'SnipeGolf digest — ' + comp.name + ' — ' + total + ' entries, ' + hoursToLock + 'h to lock';
    var body = '';
    body += 'Daily digest — ' + comp.name + ' (' + league.league_name + ')\n';
    body += 'Generated: ' + new Date().toString() + '\n';
    body += 'Lock: ' + comp.picks_lock_datetime + ' (in ~' + hoursToLock + 'h)\n\n';

    body += 'ENTRIES\n';
    body += '  Total: ' + total + '\n';
    body += '  Paid:  ' + paidCount + '\n';
    body += '  Unpaid: ' + unpaidCount + '\n';
    body += '  By method:\n';
    for (var mk in methods) { body += '    ' + mk + ': ' + methods[mk] + '\n'; }

    body += '\nPICKS\n';
    body += '  Submitted: ' + (total - missingPicks.length) + ' / ' + total + '\n';
    if (missingPicks.length) {
      body += '  MISSING (' + missingPicks.length + '):\n';
      for (var mp = 0; mp < missingPicks.length; mp++) {
        var m2 = missingPicks[mp];
        body += '    - ' + m2.name + ' (' + (m2.email || 'no email') + ')\n';
      }
    }

    if (emailFails.length) {
      body += '\nEMAIL FAILS (' + emailFails.length + ')\n';
      for (var ef = 0; ef < emailFails.length; ef++) {
        body += '  - ' + emailFails[ef].name + ' — ' + emailFails[ef].emailStatus + '\n';
      }
    }

    if (dupes.length) {
      body += '\nDUPE-SUSPECTS (' + dupes.length + ')\n';
      for (var d = 0; d < dupes.length; d++) {
        body += '  - ' + dupes[d].a.name + ' vs ' + dupes[d].b.name + '\n';
      }
    }

    body += '\nAdmin console: https://snipegolf.github.io/snipegolf/' + league.league_slug + '/admin-console.html?league=' + league.league_slug + '&key=' + (league.admin_key || '') + '\n';
    body += 'Public leaderboard: https://snipegolf.github.io/snipegolf/' + league.league_slug + '/leaderboard.html\n';
    body += '\n— Heartbeat OK. If no digest tomorrow, check triggers.\n';

    var recipients = [OWNER_EMAIL];
    if (league.admin_email) recipients.push(league.admin_email);
    try {
      MailApp.sendEmail({ to: recipients.join(','), subject: subj, body: body });
    } catch (er) {
      Logger.log('digest email err: ' + er);
    }
  }

  function runDailyDigest() {
    var bundles = activeLeagues_();
    for (var i = 0; i < bundles.length; i++) {
      try { digestForLeague_(bundles[i]); } catch (e) { Logger.log('digest err: ' + e); }
    }
  }

  globalThis.runDailyDigest = runDailyDigest;
})();
