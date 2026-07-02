/**
 * SnipeGolf v3 — 108_TriggersInstaller.gs
 *
 * Run once from Apps Script editor: installTriggers()
 * Installs:
 *   - runTwoStageLockdown  every hour
 *   - runWithdrawalDetector daily 09:00
 *   - runDailyDigest        daily 08:00
 *   - runHourly (scoring)   every hour (if not already)
 *
 * Idempotent: removes any existing trigger with same handler before creating.
 */

function installTriggers() {
  var handlers = [
    { fn: 'runTwoStageLockdown', kind: 'hourly' },
    { fn: 'runWithdrawalDetector', kind: 'daily', hour: 9 },
    { fn: 'runDailyDigest', kind: 'daily', hour: 8 },
    { fn: 'runHourly', kind: 'hourly' }
  ];
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    for (var j = 0; j < handlers.length; j++) {
      if (existing[i].getHandlerFunction() === handlers[j].fn) {
        ScriptApp.deleteTrigger(existing[i]);
        break;
      }
    }
  }
  for (var k = 0; k < handlers.length; k++) {
    var h = handlers[k];
    try {
      if (h.kind === 'hourly') {
        ScriptApp.newTrigger(h.fn).timeBased().everyHours(1).create();
      } else if (h.kind === 'daily') {
        ScriptApp.newTrigger(h.fn).timeBased().everyDays(1).atHour(h.hour).create();
      }
      Logger.log('installed ' + h.fn);
    } catch (e) {
      Logger.log('trigger install err ' + h.fn + ': ' + e);
    }
  }
  return 'ok';
}

function listMyTriggers() {
  var t = ScriptApp.getProjectTriggers();
  var out = [];
  for (var i = 0; i < t.length; i++) {
    out.push(t[i].getHandlerFunction() + ' — ' + t[i].getTriggerSourceId() + ' — ' + t[i].getEventType());
  }
  Logger.log(out.join('\n'));
  return out;
}
