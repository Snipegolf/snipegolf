// =============================================
// SnipeGolf — 00_Setup.gs
// Run ONCE to create all tabs and headers.
// Safe to re-run — won't overwrite existing data.
// =============================================

function setupSnipeGolfSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var tabNames = ['Config','Groups','Participants','GroupMembers','Scores','Leaderboard','AdminActions','SystemLog','Snapshots'];

  tabNames.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
      Logger.log('Created: ' + name);
    }
  });

  // CONFIG
  var config = ss.getSheetByName('Config');
  if (config.getLastRow() === 0) {
    var configData = [
      ['TournamentName',       'US Open 2026'],
      ['EspnEventId',          ''],
      ['EspnUrl',              ''],
      ['UserLockDateTime',     '2026/06/11 17:00:00'],
      ['AdminLockDateTime',    '2026/06/12 09:00:00'],
      ['ScoreImportStart',     '2026/06/12 13:00:00'],
      ['ScoreImportStop',      '2026/06/16 00:00:00'],
      ['EveningFastModeStart', '20:00'],
      ['WebAppUrl',            ''],
      ['GitHubPagesUrl',       'https://snipegolf.github.io/snipegolf/'],
      ['SheetId',              SpreadsheetApp.getActiveSpreadsheet().getId()],
      ['OwnerEmail',           'badenmaher@gmail.com'],
      ['Version',              'v1.0']
    ];
    config.getRange(1,1,configData.length,2).setValues(configData);
    config.getRange(1,1,configData.length,1).setFontWeight('bold');
    config.setColumnWidth(1,220);
    config.setColumnWidth(2,320);
  }

  // GROUPS
  var groups = ss.getSheetByName('Groups');
  if (groups.getLastRow() === 0) {
    groups.appendRow(['GroupCode','PubName','PubShortName','AdminEmail','AdminPIN','AdminLinkSent','MaxEntrants','PrizeName','Active']);
    styleHeader_(groups);
  }

  // PARTICIPANTS
  var p = ss.getSheetByName('Participants');
  if (p.getLastRow() === 0) {
    p.appendRow(['EntryID','Timestamp','FirstName','LastName','Email','Phone','GroupCode','Pick1','Pick2','Pick3','Pick4','Tiebreaker','ConsentGiven','PaymentStatus','EnteredBy']);
    styleHeader_(p);
  }

  // GROUPMEMBERS
  var gm = ss.getSheetByName('GroupMembers');
  if (gm.getLastRow() === 0) {
    gm.appendRow(['GroupCode','EntryID','JoinedTimestamp']);
    styleHeader_(gm);
  }

  // SCORES
  var sc = ss.getSheetByName('Scores');
  if (sc.getLastRow() === 0) {
    sc.appendRow(['GolferId','GolferName','Bracket','Round1','Round2','Round3','Round4','TotalScore','Position','ScoreOverride','OverrideReason','LastUpdated']);
    styleHeader_(sc);
  }

  // LEADERBOARD
  var lb = ss.getSheetByName('Leaderboard');
  if (lb.getLastRow() === 0) {
    lb.appendRow(['Rank','PrevRank','Move','EntryID','ParticipantName','GroupCode','Pick1Score','Pick2Score','Pick3Score','Pick4Score','TotalScore','Tiebreaker','LastUpdated']);
    styleHeader_(lb);
  }

  // ADMINACTIONS
  var aa = ss.getSheetByName('AdminActions');
  if (aa.getLastRow() === 0) {
    aa.appendRow(['Timestamp','AdminEmail','GroupCode','Action','TargetEntryID','Detail']);
    styleHeader_(aa);
  }

  // SYSTEMLOG
  var sl = ss.getSheetByName('SystemLog');
  if (sl.getLastRow() === 0) {
    sl.appendRow(['Tournament','StartDate','EndDate','ResetDate','TotalEntries','TotalGroups','Notes']);
    styleHeader_(sl);
    sl.appendRow(['Masters 2026','10/04/2026','13/04/2026','','165','1','First run — 0 admin errors']);
  }

  // SNAPSHOTS
  var sn = ss.getSheetByName('Snapshots');
  if (sn.getLastRow() === 0) {
    sn.appendRow(['SnapshotTime','EntryID','ParticipantName','GroupCode','Rank','TotalScore']);
    styleHeader_(sn);
  }

  // Remove default Sheet1 if present
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1) ss.deleteSheet(sheet1);

  SpreadsheetApp.getUi().alert('✅ SnipeGolf setup complete! All tabs and headers created.');
}

function styleHeader_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  var h = sheet.getRange(1,1,1,lastCol);
  h.setFontWeight('bold');
  h.setBackground('#1a1a2e');
  h.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}
