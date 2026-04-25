// =============================================
// SnipeGolf — FIX_01_DuplicatePickBlocker.gs
// Prevents duplicate golfer picks across all
// 4 pick slots for one entry.
//
// SCHEMA: Participants columns
//   Pick1(col7), Pick2(col8), Pick3(col9), Pick4(col10) [0-indexed]
//
// USAGE: Call validateNoDuplicatePicks(picks) before writing
//        any row to Participants. If .ok is false, reject.
//
//   var r = validateNoDuplicatePicks({p1:'Rory McIlroy', p2:'Jon Rahm', p3:'Jon Rahm', p4:'Tiger Woods'});
//   if (!r.ok) return {error: r.error};
// =============================================

function validateNoDuplicatePicks(picks) {
  var slots = [
    { key: 'p1', label: 'Pick 1' },
    { key: 'p2', label: 'Pick 2' },
    { key: 'p3', label: 'Pick 3' },
    { key: 'p4', label: 'Pick 4' }
  ];

  var seen = {};
  var duplicates = [];

  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    var name = (picks[slot.key] || '').trim();
    if (!name) continue;
    var key = name.toLowerCase();
    if (seen[key]) {
      duplicates.push('"' + name + '" appears in both ' + seen[key] + ' and ' + slot.label);
    } else {
      seen[key] = slot.label;
    }
  }

  if (duplicates.length > 0) {
    return {
      ok: false,
      error: 'Duplicate player(s): ' + duplicates.join('; ') +
             '. Each golfer can only be selected once.'
    };
  }
  return { ok: true, error: null };
}


// TEST — Run via Extensions > Apps Script > Run > testDuplicatePickBlocker
function testDuplicatePickBlocker() {
  var results = [];

  var clean = validateNoDuplicatePicks({ p1:'Rory McIlroy', p2:'Jon Rahm', p3:'Scottie Scheffler', p4:'Brooks Koepka' });
  results.push('Test 1 (clean): ' + (clean.ok ? 'PASS ✅' : 'FAIL ❌ ' + clean.error));

  var dup = validateNoDuplicatePicks({ p1:'Rory McIlroy', p2:'Rory McIlroy', p3:'Scottie Scheffler', p4:'Brooks Koepka' });
  results.push('Test 2 (dup): ' + (!dup.ok ? 'BLOCKED ✅ — ' + dup.error : 'FAIL ❌ should have blocked'));

  var partial = validateNoDuplicatePicks({ p1:'Rory McIlroy', p2:'', p3:'', p4:'' });
  results.push('Test 3 (partial): ' + (partial.ok ? 'PASS ✅' : 'FAIL ❌ ' + partial.error));

  Logger.log('FIX_01 Results:\n' + results.join('\n'));
  return results;
}
