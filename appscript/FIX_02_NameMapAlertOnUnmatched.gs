// =============================================
// SnipeGolf — FIX_02_NameMapAlertOnUnmatched.gs
// After each ESPN import, scans all Participants
// picks against Scores!GolferName column.
// Any unmatched name = highlighted in Scores sheet
// + email alert to OwnerEmail in Config.
//
// USAGE: Add one line at end of importScoresFromESPN():
//   checkNameMapAlerts();
//
// SCHEMA:
//   Participants: Pick1(col7), Pick2(col8), Pick3(col9), Pick4(col10) [0-indexed]
//   Scores: GolferName = col1 (0-indexed)
// =============================================

function checkNameMapAlerts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = getConfig();

  var scoresSheet = ss.getSheetByName('Scores');
  var partSheet   = ss.getSheetByName('Participants');

  if (!scoresSheet || !partSheet) {
    Logger.log('FIX_02: Scores or Participants sheet missing.');
    return;
  }

  // Build set of known golfer names from Scores (col index 1 = GolferName)
  var scoreData = scoresSheet.getDataRange().getValues();
  var knownPlayers = {};
  for (var i = 1; i < scoreData.length; i++) {
    var gName = (scoreData[i][1] || '').toString().trim();
    if (gName) knownPlayers[gName.toLowerCase()] = gName;
  }

  // Check all picks in Participants (cols 7,8,9,10 = Pick1-4, 0-indexed)
  var partData = partSheet.getDataRange().getValues();
  var unmatched = {}; // { 'wrong name': ['John Murphy', 'Alice O Brien'] }

  for (var r = 1; r < partData.length; r++) {
    var entryId = (partData[r][0] || '').toString().trim();
    var firstName = (partData[r][2] || '').toString().trim();
    var lastName  = (partData[r][3] || '').toString().trim();
    var displayName = firstName + ' ' + lastName;
    if (!entryId) continue;

    for (var c = 7; c <= 10; c++) {
      var pick = (partData[r][c] || '').toString().trim();
      if (!pick) continue;
      if (!knownPlayers[pick.toLowerCase()]) {
        if (!unmatched[pick]) unmatched[pick] = [];
        unmatched[pick].push(displayName.trim() + ' (EntryID: ' + entryId + ')');
      }
    }
  }

  var unmatchedNames = Object.keys(unmatched);
  if (unmatchedNames.length === 0) {
    Logger.log('FIX_02: All picks matched. No alerts.');
    return;
  }

  // Highlight unmatched names in Scores sheet header area for visibility
  // and log to SystemLog
  var sysLog = ss.getSheetByName('SystemLog');
  if (sysLog) {
    unmatchedNames.forEach(function(name) {
      sysLog.appendRow([
        new Date().toISOString(),
        'UNMATCHED_PICK',
        name,
        'Picked by: ' + unmatched[name].join(', ')
      ]);
    });
  }

  // Send email alert
  var adminEmail = (cfg['OwnerEmail'] || '').toString().trim();
  if (!adminEmail) { Logger.log('FIX_02: No OwnerEmail in Config, skipping email.'); return; }

  var lines = unmatchedNames.map(function(name) {
    return '  • "' + name + '" — picked by: ' + unmatched[name].join(', ');
  });

  var subject = '⚠️ SnipeGolf: ' + unmatchedNames.length + ' unmatched golfer name(s) — ' + (cfg['TournamentName'] || '');
  var body = 'The following player names are in participant picks but NOT found in the Scores sheet.\n'
    + 'These entries are receiving the MC penalty. Please check for typos or name mismatches.\n\n'
    + lines.join('\n')
    + '\n\nTournament: ' + (cfg['TournamentName'] || '')
    + '\nChecked: ' + new Date().toLocaleString();

  try {
    GmailApp.sendEmail(adminEmail, subject, body);
    Logger.log('FIX_02: Alert email sent to ' + adminEmail + ' for ' + unmatchedNames.length + ' unmatched name(s).');
  } catch (e) {
    Logger.log('FIX_02: Email failed: ' + e.message);
  }
}

// TEST — Run via Extensions > Apps Script > Run > testNameMapAlerts
function testNameMapAlerts() {
  Logger.log('FIX_02 TEST: Running name check against live data...');
  checkNameMapAlerts();
  Logger.log('FIX_02 TEST: Done. Check SystemLog sheet and inbox.');
}
