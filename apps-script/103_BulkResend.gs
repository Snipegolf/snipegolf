/**
 * SnipeGolf v3 - 103_BulkResend.gs
 * Manual one-shot: resend picks-open email to every entry in a league.
 *
 * Usage (Apps Script editor):
 *   Run > bulkResendUSOpen
 *   First run will prompt for Gmail scope. Approve.
 *
 * Safety:
 *   - Skips rows with email_status='sent' AND email_sent_at within last 30 min
 *     (so you can re-run if it stalls without double-sending the early ones).
 *   - Stops if MailApp quota drops below 5.
 *   - Sleeps 1500ms between sends.
 *   - Logs every send to Logger.
 */

function bulkResendUSOpen() {
  return bulkResend_('us-open-2026-cobh-gc');
}

function bulkResend_(leagueSlug) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.PARTICIPANTS);
  if (!sh) throw new Error('Participants tab not found');
  var data = sh.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('no participants');
    return;
  }
  var headers = data[0];
  var col = {};
  for (var i = 0; i < headers.length; i++) col[String(headers[i])] = i;

  var need = ['pid', 'league_slug', 'email', 'email_status', 'email_sent_at'];
  for (var n = 0; n < need.length; n++) {
    if (col[need[n]] === undefined) throw new Error('missing column: ' + need[n]);
  }

  var pidCol = col.pid;
  var lgCol = col.league_slug;
  var emCol = col.email;
  var stCol = col.email_status;
  var atCol = col.email_sent_at;

  var sent = 0, skipped = 0, failed = 0;
  var cutoff = Date.now() - (30 * 60 * 1000); // 30 min ago

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (String(row[lgCol]) !== leagueSlug) continue;
    if (!row[emCol]) { skipped++; continue; }
    var pid = String(row[pidCol]);
    if (!pid) { skipped++; continue; }

    // Skip if just sent (re-run safety)
    var status = String(row[stCol] || '');
    var sentAt = row[atCol] ? new Date(row[atCol]).getTime() : 0;
    if (status === 'sent' && sentAt > cutoff) {
      Logger.log('skip recent: ' + pid);
      skipped++;
      continue;
    }

    if (MailApp.getRemainingDailyQuota() < 5) {
      Logger.log('quota low, stopping at row ' + r);
      break;
    }

    try {
      sendEntryEmail_(pid);
      sh.getRange(r + 1, stCol + 1).setValue('sent');
      sh.getRange(r + 1, atCol + 1).setValue(new Date().toISOString());
      sent++;
      Logger.log('sent: ' + pid);
    } catch (e) {
      failed++;
      sh.getRange(r + 1, stCol + 1).setValue('failed');
      Logger.log('FAIL ' + pid + ': ' + String(e).substring(0, 200));
    }

    Utilities.sleep(1500);
  }

  var msg = 'bulk resend done. sent=' + sent + ' skipped=' + skipped + ' failed=' + failed;
  Logger.log(msg);
  return msg;
}

globalThis.bulkResendUSOpen = bulkResendUSOpen;
globalThis.bulkResend_ = bulkResend_;
