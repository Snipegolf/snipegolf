// =============================================
// SnipeGolf — 07_Scheduler.gs
// Dual-speed score import trigger.
// Set ONE 1-minute time-driven trigger pointing
// at scheduledImport(). The function self-throttles
// to 5-min intervals during daytime and 1-min
// during Evening Fast Mode.
// =============================================

function scheduledImport() {
  // Only run inside the import window
  if (!isImportWindowOpen()) return;

  var now = new Date();

  // Daytime (before EveningFastModeStart): run every 5 minutes only
  if (!isEveningFastMode()) {
    if (now.getMinutes() % 5 !== 0) return;
  }

  // Run the import
  try {
    importScoresFromESPN();
    calculateLeaderboard();
    Logger.log('Scheduled import complete: ' + now.toISOString());
  } catch(e) {
    Logger.log('Scheduler error: ' + e.message);
  }
}

// ── Trigger management ──────────────────────
// Run once to install the 1-minute trigger
function installSchedulerTrigger() {
  // Remove any existing scheduledImport triggers first
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'scheduledImport') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('scheduledImport')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('Scheduler trigger installed.');
}

// Run to remove the trigger (e.g. after tournament ends)
function removeSchedulerTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'scheduledImport') {
      ScriptApp.deleteTrigger(t);
      Logger.log('Scheduler trigger removed.');
    }
  });
}
