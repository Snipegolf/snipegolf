/**
 * SnipeGolf v3 — 107_TwoStageLockdown.gs
 *
 * Runs every hour. For each comp:
 *   - If NOW >= picks_lock_datetime and status is picks_open → flip to 'locked'
 *   - If NOW >= (picks_lock_datetime + 10h) and status is 'locked' → flip to 'live'
 *     (this is the admin freeze — 10h after player lock is the tournament tee time
 *      window, admin edits still allowed via console but public routes freeze)
 *
 * Emails owner + admin on every state change.
 *
 * NO template literals, arrow, ??, ?., let, const.
 */

(function () {
  var MASTER_ID = '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
  var OWNER_EMAIL = 'badenmaher@gmail.com';

  function ss_() { return SpreadsheetApp.openById(MASTER_ID); }

  function emailLock_(comp, newStatus) {
    var lSh = ss_().getSheetByName('Leagues');
    var lv = lSh.getDataRange().getValues();
    var lh = lv[0];
    var adminEmail = '', leagueSlug = '';
    for (var i = 1; i < lv.length; i++) {
      if (lv[i][lh.indexOf('comp_slug')] === comp.comp_slug) {
        adminEmail = lv[i][lh.indexOf('admin_email')] || '';
        leagueSlug = lv[i][lh.indexOf('league_slug')] || '';
        break;
      }
    }
    var subj = 'SnipeGolf — ' + comp.name + ' status: ' + newStatus.toUpperCase();
    var body = 'Automated lockdown fired at ' + new Date().toString() + '.\n\n';
    body += 'Comp: ' + comp.name + ' (' + comp.comp_slug + ')\n';
    body += 'New status: ' + newStatus + '\n';
    body += 'Lock time was: ' + comp.picks_lock_datetime + '\n\n';
    if (newStatus === 'locked') {
      body += 'Public entries are now CLOSED. Admin console can still edit picks.\n';
    } else if (newStatus === 'live') {
      body += 'Tournament is LIVE. Admin edits are now frozen. Scoring runs on schedule.\n';
    }
    body += '\nLeaderboard: https://snipegolf.github.io/snipegolf/' + leagueSlug + '/leaderboard.html\n';
    var to = [OWNER_EMAIL];
    if (adminEmail) to.push(adminEmail);
    try { MailApp.sendEmail({ to: to.join(','), subject: subj, body: body }); }
    catch (e) { Logger.log('lock email err: ' + e); }
  }

  function runTwoStageLockdown() {
    var sh = ss_().getSheetByName('Competitions');
    var v = sh.getDataRange().getValues();
    var h = v[0];
    var iSlug = h.indexOf('comp_slug');
    var iStatus = h.indexOf('status');
    var iLock = h.indexOf('picks_lock_datetime');
    var iName = h.indexOf('name');
    var now = new Date();

    for (var i = 1; i < v.length; i++) {
      var slug = v[i][iSlug];
      if (!slug) continue;
      var status = String(v[i][iStatus] || '').toLowerCase();
      var lockStr = v[i][iLock];
      if (!lockStr) continue;
      var lockD = new Date(lockStr);
      if (isNaN(lockD.getTime())) continue;

      var comp = { comp_slug: slug, name: v[i][iName], picks_lock_datetime: lockStr };

      // Stage 1: picks_open → locked at lock time
      if (status === 'picks_open' && now >= lockD) {
        sh.getRange(i + 1, iStatus + 1).setValue('locked');
        Logger.log('LOCKED comp=' + slug);
        try { emailLock_(comp, 'locked'); } catch (e) {}
        continue;
      }

      // Stage 2: locked → live at lock + 10h (Wed 22:00 → Thu 08:00)
      if (status === 'locked') {
        var liveAt = new Date(lockD.getTime() + 10 * 3600 * 1000);
        if (now >= liveAt) {
          sh.getRange(i + 1, iStatus + 1).setValue('live');
          Logger.log('LIVE comp=' + slug);
          try { emailLock_(comp, 'live'); } catch (e) {}
        }
      }
    }
  }

  globalThis.runTwoStageLockdown = runTwoStageLockdown;
})();
