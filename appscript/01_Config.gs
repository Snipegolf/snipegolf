// =============================================
// SnipeGolf — 01_Config.gs
// Central config reader used by all modules.
// =============================================

var CONFIG_CACHE_ = null;

function getConfig() {
  if (CONFIG_CACHE_) return CONFIG_CACHE_;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Config');
  var data = sheet.getDataRange().getValues();
  var cfg = {};
  data.forEach(function(row) {
    if (row[0]) cfg[row[0].toString().trim()] = row[1];
  });
  CONFIG_CACHE_ = cfg;
  return cfg;
}

// Call this if you update Config mid-session
function clearConfigCache() {
  CONFIG_CACHE_ = null;
}

// Returns true if current time is before the user entry lock
function isUserEntryOpen() {
  var cfg = getConfig();
  var lockStr = cfg['UserLockDateTime'];
  if (!lockStr) return true;
  var lock = new Date(lockStr);
  return new Date() < lock;
}

// Returns true if current time is before the admin lock
function isAdminEntryOpen() {
  var cfg = getConfig();
  var lockStr = cfg['AdminLockDateTime'];
  if (!lockStr) return true;
  var lock = new Date(lockStr);
  return new Date() < lock;
}

// Returns true if we are inside the score import window
function isImportWindowOpen() {
  var cfg = getConfig();
  var start = new Date(cfg['ScoreImportStart']);
  var stop  = new Date(cfg['ScoreImportStop']);
  var now   = new Date();
  return now >= start && now <= stop;
}

// Returns true if we are in Evening Fast Mode (1-min updates)
function isEveningFastMode() {
  var cfg = getConfig();
  var fastStr = cfg['EveningFastModeStart'];
  if (!fastStr) return false;
  var parts = fastStr.toString().split(':');
  var fastHour = parseInt(parts[0], 10);
  var fastMin  = parseInt(parts[1] || '0', 10);
  var now = new Date();
  var nowMins = now.getHours() * 60 + now.getMinutes();
  var fastMins = fastHour * 60 + fastMin;
  return nowMins >= fastMins;
}
